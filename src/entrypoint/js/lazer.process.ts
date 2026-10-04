import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import Realm from "realm";
import { OsuFileObjectCounts, parseOsuObjectCounts } from "../../shared/utils/lazerObjectCounts";
import { computeLazerSetHash, LazerHashableFile } from "../../shared/utils/lazerSetHash";
import { parseLazerStatistics } from "../../shared/utils/lazerStats";
import { createLogger } from "../../utils/logger";
import { readWithOffset } from "../../utils/reader";

const log = createLogger("LazerProcess");

const parentPort: {
    on(event: "message", listener: (event: { data: unknown }) => void): void;
    postMessage(message: unknown): void;
} = (process as any).parentPort;

let _realm: Realm | undefined;
/** Realm file path captured at init; the detail path derives lazer storage from it. */
let _realmPath: string | undefined;

function q(value: unknown): string {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function finiteNumber(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function numberList(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return values.map((v) => finiteNumber(v)).filter((v): v is number => v !== undefined);
}

function stringList(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return values.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function cmp(field: string, cond: unknown): string | undefined {
    const c = cond as { op?: unknown; val?: unknown };
    const op = typeof c?.op === "string" && [">", ">=", "<", "<=", "=="].includes(c.op) ? c.op : undefined;
    const val = finiteNumber(c?.val);
    return op && val !== undefined ? `${field} ${op} ${val}` : undefined;
}

function collectionHashesForNames(names: string[]): string[] {
    const hashes = new Set<string>();
    for (const name of names) {
        const col = _realm?.objects("BeatmapCollection").filtered(`Name == ${q(name)}`)[0] as any;
        if (col?.BeatmapMD5Hashes) {
            for (const h of col.BeatmapMD5Hashes) {
                if (typeof h === "string" && h.length > 0) hashes.add(h);
            }
        }
    }
    return Array.from(hashes);
}

/** Builds the Realm query string for a LazerBeatmapQuerySpec. */
function buildLazerBeatmapQuery(spec: Record<string, unknown>): string {
    const parts: string[] = ["Hidden == false"];
    if (spec.title) parts.push(`Metadata.Title CONTAINS[c] ${q(spec.title)}`);
    if (spec.artist) parts.push(`Metadata.Artist CONTAINS[c] ${q(spec.artist)}`);
    if (spec.creator) parts.push(`Metadata.Author.Username CONTAINS[c] ${q(spec.creator)}`);
    const srMin = finiteNumber(spec.srMin ?? spec.starRatingMin);
    const srMax = finiteNumber(spec.srMax ?? spec.starRatingMax);
    const drainMin = finiteNumber(spec.drainMin);
    const drainMax = finiteNumber(spec.drainMax);
    if (srMin !== undefined) parts.push(`StarRating >= ${srMin}`);
    if (srMax !== undefined) parts.push(`StarRating <= ${srMax}`);
    if (drainMin !== undefined) parts.push(`Length >= ${drainMin}`);
    if (drainMax !== undefined) parts.push(`Length <= ${drainMax}`);
    const modes = numberList(spec.modes);
    if (modes.length > 0) {
        const modeList = modes.join(",");
        parts.push(`Ruleset.OnlineID IN {${modeList}}`);
    }
    const rankStatuses = numberList(spec.rankStatuses);
    if (rankStatuses.length > 0) parts.push(`Status IN {${rankStatuses.join(",")}}`);
    const ar = cmp("Difficulty.ApproachRate", spec.ar);
    const cs = cmp("Difficulty.CircleSize", spec.cs);
    const hp = cmp("Difficulty.DrainRate", spec.hp);
    const od = cmp("Difficulty.OverallDifficulty", spec.od);
    if (ar) parts.push(ar);
    if (cs) parts.push(cs);
    if (hp) parts.push(hp);
    if (od) parts.push(od);
    if (spec.unplayed === true) parts.push("LastPlayed == nil");
    if (spec.unplayed === false) parts.push("LastPlayed != nil");
    const includedHashes = stringList(spec.includedHashes);
    if (includedHashes.length > 0) {
        const hashList = includedHashes.map(q).join(",");
        parts.push(`MD5Hash IN {${hashList}}`);
    }
    const excludedHashes = stringList(spec.excludeHashes ?? spec.excludedHashes);
    if (excludedHashes.length > 0) {
        const hashList = excludedHashes.map(q).join(",");
        parts.push(`NOT (MD5Hash IN {${hashList}})`);
    }
    const setIds = numberList(spec.beatmapSetIds);
    if (setIds.length > 0) {
        const setList = setIds.join(",");
        parts.push(`BeatmapSet.OnlineID IN {${setList}}`);
    }
    const beatmapIds = numberList(spec.beatmapIds);
    if (beatmapIds.length > 0) {
        const idList = beatmapIds.join(",");
        parts.push(`OnlineID IN {${idList}}`);
    }
    const playerTagBeatmapIds = numberList(spec.playerTagBeatmapIds);
    if (playerTagBeatmapIds.length > 0) {
        const idList = playerTagBeatmapIds.join(",");
        parts.push(`OnlineID IN {${idList}}`);
    }
    const includedCollectionNames = stringList(spec.includedCollectionNames);
    if (includedCollectionNames.length > 0) {
        const hashList = collectionHashesForNames(includedCollectionNames).map(q);
        if (hashList.length > 0) parts.push(`MD5Hash IN {${hashList.join(",")}}`);
        else parts.push("OnlineID == -1"); // requested collection has no maps → match nothing
    }
    const excludedCollectionNames = stringList(spec.excludedCollectionNames);
    if (excludedCollectionNames.length > 0) {
        const hashList = collectionHashesForNames(excludedCollectionNames).map(q);
        if (hashList.length > 0) parts.push(`NOT (MD5Hash IN {${hashList.join(",")}})`);
    }
    return parts.join(" AND ");
}

type RosuModule = typeof import("rosu-pp-js");

let _rosu: RosuModule | null | undefined;

/**
 * Loaded lazily: the wasm module costs ~1MB of parse work at require time and is
 * only needed by the dedicated one-map detail read, never by paged queries.
 */
function rosuModule(): RosuModule | null {
    if (_rosu === undefined) {
        try {
            _rosu = require("rosu-pp-js") as RosuModule;
        } catch (err) {
            log.warn(`rosu-pp-js unavailable in lazer worker: ${String(err)}`);
            _rosu = null;
        }
    }
    return _rosu;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Resolves the osu!lazer content-addressed path `<lazerRoot>/files/<h0>/<h0h1>/<hash>`
 * (osu!lazer `ModelExtensions.GetStoragePath`). Returns undefined for anything
 * that is not a 64-hex digest or that escapes the resolved `files` root.
 */
function resolveStoredOsuPath(realmPath: string, contentHash: string): string | undefined {
    const hash = contentHash.trim().toLowerCase();
    if (!SHA256_HEX.test(hash)) return undefined;
    const filesRoot = path.resolve(path.dirname(realmPath), "files");
    const candidate = path.resolve(filesRoot, hash.slice(0, 1), hash.slice(0, 2), hash);
    const rel = path.relative(filesRoot, candidate);
    if (rel.length === 0 || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return candidate;
}

/** Reads exactly one stored `.osu` file and verifies its SHA-256 digest. */
function readVerifiedOsuFile(realmPath: string, contentHash: string): Buffer | undefined {
    const target = resolveStoredOsuPath(realmPath, contentHash);
    if (target === undefined) return undefined;
    let bytes: Buffer;
    try {
        bytes = fs.readFileSync(target);
    } catch {
        return undefined;
    }
    if (bytes.length === 0) return undefined;
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (digest !== contentHash.trim().toLowerCase()) {
        log.warn(`get_beatmap_detail: stored file digest mismatch for ${contentHash}`);
        return undefined;
    }
    return bytes;
}

function countsFromRosu(bytes: Buffer): OsuFileObjectCounts | undefined {
    const mod = rosuModule();
    if (mod === null) return undefined;
    let map: InstanceType<RosuModule["Beatmap"]> | undefined;
    try {
        map = new mod.Beatmap(bytes);
        const circles = map.nCircles;
        const sliders = map.nSliders;
        const spinners = map.nSpinners;
        const stackLeniency = map.stackLeniency;
        if (![circles, sliders, spinners].every((n) => Number.isFinite(n) && n >= 0)) return undefined;
        return {
            circles,
            sliders,
            spinners,
            stackLeniency: Number.isFinite(stackLeniency) ? stackLeniency : undefined,
        };
    } catch (err) {
        log.warn(`get_beatmap_detail: rosu-pp parse failed, using text parser: ${String(err)}`);
        return undefined;
    } finally {
        map?.free();
    }
}

/**
 * Exact object counts for one stored `.osu`. rosu-pp is authoritative; the pure
 * text parser covers a missing or broken wasm module. Undefined means the counts
 * are unavailable — callers must not substitute total/end-time counts.
 */
function readStoredObjectCounts(realmPath: string, contentHash: string): OsuFileObjectCounts | undefined {
    const bytes = readVerifiedOsuFile(realmPath, contentHash);
    if (bytes === undefined) return undefined;
    return countsFromRosu(bytes) ?? parseOsuObjectCounts(bytes.toString("utf8")) ?? undefined;
}

/** `BeatmapOnlineStatus.LocallyModified`; set on a set that lost one difficulty. */
const LOCALLY_MODIFIED_STATUS = -4;

function sameStringList(values: unknown, expected: string[]): boolean {
    if (!Array.isArray(values) && typeof (values as { length?: unknown })?.length !== "number") return false;
    const list = values as ArrayLike<unknown>;
    if (list.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
        if (list[i] !== expected[i]) return false;
    }
    return true;
}

/** Normalized Beatmap DTO. Pure Realm field access — never touches the filesystem. */
function normalizeBeatmap(b: any) {
    const d = b.Difficulty;
    const m = b.Metadata;
    return {
        OnlineID: b.OnlineID,
        BeatmapSet: b.BeatmapSet ? { OnlineID: b.BeatmapSet.OnlineID } : undefined,
        DifficultyName: b.DifficultyName,
        Hash: b.Hash,
        MD5Hash: b.MD5Hash,
        OnlineMD5Hash: b.OnlineMD5Hash,
        Status: b.Status,
        Length: b.Length,
        StarRating: b.StarRating,
        LastPlayed: b.LastPlayed ? new Date(b.LastPlayed) : undefined,
        Ruleset: b.Ruleset ? { OnlineID: b.Ruleset.OnlineID } : undefined,
        Difficulty: d
            ? {
                  DrainRate: d.DrainRate,
                  CircleSize: d.CircleSize,
                  OverallDifficulty: d.OverallDifficulty,
                  ApproachRate: d.ApproachRate,
                  SliderMultiplier: d.SliderMultiplier,
              }
            : undefined,
        Metadata: m
            ? {
                  Title: m.Title,
                  TitleUnicode: m.TitleUnicode,
                  Artist: m.Artist,
                  ArtistUnicode: m.ArtistUnicode,
                  Source: m.Source,
                  Tags: m.Tags,
                  Author: m.Author ? { Username: m.Author.Username } : undefined,
              }
            : undefined,
    };
}

/** Full one-map DTO for the dedicated detail read (paged reads must not use this). */
function normalizeBeatmapDetail(b: any, counts: OsuFileObjectCounts | undefined) {
    return {
        ...normalizeBeatmap(b),
        BPM: b.BPM,
        TotalObjectCount: b.TotalObjectCount,
        EndTimeObjectCount: b.EndTimeObjectCount,
        CircleCount: counts?.circles,
        SliderCount: counts?.sliders,
        SpinnerCount: counts?.spinners,
        StackLeniency: counts?.stackLeniency,
    };
}

async function handle(msg: any): Promise<unknown> {
    switch (msg.type) {
        case "init": {
            if (_realm !== undefined) {
                _realm.close();
            }
            log.info(`Opening Realm: ${msg.path}`);
            const _t0 = Date.now();
            _realm = new Realm({
                path: msg.path,
                disableFormatUpgrade: false,
                schema: undefined,
                schemaVersion: undefined,
            } satisfies Realm.Configuration & {
                openSyncedRealmLocally?: boolean;
            } as any);
            _realmPath = typeof msg.path === "string" ? msg.path : undefined;
            log.info(`Realm opened in ${Date.now() - _t0}ms`);
            return null;
        }

        case "close": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            _realm.close();
            _realm = undefined;
            _realmPath = undefined;
            return null;
        }

        case "start_watch": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const scores = _realm.objects("Score").filtered("DeletePending == false");
            scores.addListener((_, changes) => {
                if (changes.insertions.length > 0 || changes.deletions.length > 0) {
                    parentPort.postMessage({ notification: "scores_changed" });
                }
            });
            log.info("Realm change listener started for Score collection (insertions/deletions only)");
            return null;
        }

        case "get_schemas": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            return _realm.schema;
        }

        case "get_schema_by_name": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            return _realm.schema.find((s) => s.name === msg.name);
        }

        case "get_objects": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const results = _realm.objects(msg.objType);
            return results.slice(msg.offset, msg.offset + msg.limit).map((obj) => obj.toJSON());
        }

        case "get_collections": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const collections = _realm.objects("BeatmapCollection");
            const result = readWithOffset(collections, msg.offset, msg.limit);
            result.data = result.data.map((obj: Realm.Results) => obj.toJSON());
            return result;
        }

        case "get_scores": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const scores = _realm.objects("Score").sorted("Date", true);
            const result = readWithOffset(scores, msg.offset, msg.limit);
            result.data = result.data.map((obj: Realm.Results) => obj.toJSON());
            return result;
        }

        case "get_beatmaps": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const beatmaps = _realm.objects("Beatmap");
            const result = readWithOffset(beatmaps, msg.offset, msg.limit);
            result.data = result.data.map((obj: Realm.Results) => obj.toJSON());
            return result;
        }

        case "set_collections": {
            const realm = _realm;
            if (realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }

            const desired = new Map<string, string[]>();
            for (const entry of Array.isArray(msg.collections) ? msg.collections : []) {
                const name = typeof entry?.name === "string" ? entry.name.trim() : "";
                if (name.length === 0) continue;
                const maps = Array.isArray(entry?.maps)
                    ? entry.maps.filter((hash: unknown): hash is string => typeof hash === "string" && hash.length > 0)
                    : [];
                desired.set(name, Array.from(new Set(maps)));
            }

            const existingByName = new Map<string, any>();
            for (const col of realm.objects("BeatmapCollection")) {
                const name = typeof (col as any).Name === "string" ? (col as any).Name : "";
                if (name.length > 0) existingByName.set(name, col);
            }

            let created = 0;
            let updated = 0;
            let removed = 0;
            realm.write(() => {
                for (const [name, hashes] of desired) {
                    const col = existingByName.get(name) as any;
                    if (col) {
                        if (!sameStringList(col.BeatmapMD5Hashes, hashes)) {
                            col.BeatmapMD5Hashes.splice(0, col.BeatmapMD5Hashes.length, ...hashes);
                            col.LastModified = new Date();
                            updated += 1;
                        }
                        existingByName.delete(name);
                        continue;
                    }
                    realm.create("BeatmapCollection", {
                        ID: new Realm.BSON.UUID(),
                        Name: name,
                        BeatmapMD5Hashes: hashes,
                        LastModified: new Date(),
                    });
                    created += 1;
                }
                for (const [, col] of existingByName) {
                    realm.delete(col);
                    removed += 1;
                }
            });

            log.info(`set_collections: total=${desired.size} created=${created} updated=${updated} removed=${removed}`);
            return { created, updated, removed, total: desired.size };
        }

        case "delete_beatmap_difficulties": {
            const realm = _realm;
            if (realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }

            const results: Array<Record<string, unknown>> = [];
            for (const hash of stringList(msg.hashes)) {
                const beatmap = realm.objects("Beatmap").filtered(`MD5Hash == ${q(hash)}`)[0] as any;
                if (!beatmap) {
                    results.push({ hash, ok: false, reason: "not_found" });
                    continue;
                }
                const set = beatmap.BeatmapSet;
                if (!set) {
                    results.push({ hash, ok: false, reason: "set_missing" });
                    continue;
                }
                if (set.Protected === true) {
                    results.push({ hash, ok: false, reason: "protected" });
                    continue;
                }
                if (set.DeletePending === true) {
                    results.push({ hash, ok: true, mode: "set", reason: "already_pending" });
                    continue;
                }

                let siblingCount = 0;
                for (const sibling of set.Beatmaps) {
                    if (sibling.MD5Hash !== hash) siblingCount += 1;
                }

                if (siblingCount === 0) {
                    realm.write(() => {
                        set.DeletePending = true;
                    });
                    results.push({ hash, ok: true, mode: "set" });
                    continue;
                }

                const contentHash = typeof beatmap.Hash === "string" ? beatmap.Hash : "";
                let usage: any;
                if (contentHash.length > 0) {
                    for (const candidate of set.Files) {
                        if (candidate?.File?.Hash === contentHash) {
                            usage = candidate;
                            break;
                        }
                    }
                }
                const usageIndex = usage ? set.Files.indexOf(usage) : -1;
                const beatmapIndex = set.Beatmaps.indexOf(beatmap);
                if (usageIndex < 0) {
                    log.warn(`delete_beatmap_difficulties: file reference missing for ${hash}`);
                    results.push({ hash, ok: false, reason: "file_reference_missing" });
                    continue;
                }
                let nextHash: string;
                try {
                    const realmPath = _realmPath;
                    if (!realmPath) throw new Error("Lazer Realm path is unavailable.");
                    const remaining = Array.from(set.Files as Iterable<LazerHashableFile>).filter(
                        (_, index) => index !== usageIndex,
                    );
                    nextHash = computeLazerSetHash(remaining, set.Hash, (digest) =>
                        readVerifiedOsuFile(realmPath, digest),
                    );
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    log.warn(`delete_beatmap_difficulties: hash recalculation failed for ${hash}: ${reason}`);
                    results.push({ hash, ok: false, reason });
                    continue;
                }

                realm.write(() => {
                    // Mirrors `ModelManager.DeleteFile`: only the reference is dropped.
                    // The stored file stays content-addressed and is reclaimed by
                    // osu!lazer's `RealmFileStore.Cleanup()` on its next startup.
                    if (usage && usageIndex >= 0) set.Files.remove(usageIndex);
                    if (beatmapIndex >= 0) set.Beatmaps.remove(beatmapIndex);
                    if (beatmap.Metadata) realm.delete(beatmap.Metadata);
                    realm.delete(beatmap);
                    set.Hash = nextHash;
                    set.StatusInt = LOCALLY_MODIFIED_STATUS;
                });
                results.push({ hash, ok: true, mode: "difficulty" });
            }
            return results;
        }

        case "query_beatmaps": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            const spec = msg.spec as any;
            const queryStr = buildLazerBeatmapQuery(spec);
            log.debug(`query_beatmaps: ${queryStr}`);
            const beatmaps = _realm.objects("Beatmap").filtered(queryStr);

            if (spec.returnSetIds) {
                const ids = new Set<number>();
                for (const b of beatmaps as unknown as any[]) {
                    const onlineId = b.BeatmapSet?.OnlineID;
                    if (onlineId !== undefined && onlineId !== null) ids.add(onlineId);
                }
                const result = Array.from(ids);
                log.debug(`query_beatmaps returnSetIds count=${result.length} ${Date.now() - _t0}ms`);
                return { data: result, total: result.length };
            }

            const offset = Math.max(0, Math.floor(finiteNumber(msg.offset) ?? 0));
            const limit = Math.max(1, Math.floor(finiteNumber(msg.limit) ?? 500));
            const page = readWithOffset(beatmaps, offset, limit);

            if (spec.returnLightweight) {
                const data = page.data.map((b: any) => {
                    const d = b.Difficulty;
                    const m = b.Metadata;
                    return {
                        beatmapId: b.OnlineID ?? 0,
                        beatmapSetId: b.BeatmapSet?.OnlineID ?? 0,
                        md5Hash: b.MD5Hash ?? b.Hash ?? b.OnlineMD5Hash ?? "",
                        difficultyName: b.DifficultyName ?? "",
                        rankedStatus: b.Status ?? 0,
                        drainSeconds: b.Length ?? 0,
                        starRating: b.StarRating ?? 0,
                        lastPlayed: b.LastPlayed ? new Date(b.LastPlayed).toISOString() : undefined,
                        unplayed: !b.LastPlayed,
                        mode: b.Ruleset?.OnlineID ?? 0,
                        title: m?.Title ?? "",
                        artist: m?.Artist ?? "",
                        creatorName: m?.Author?.Username ?? "",
                        tags: m?.Tags ?? "",
                        ar: d?.ApproachRate ?? 0,
                        cs: d?.CircleSize ?? 0,
                        hp: d?.DrainRate ?? 0,
                        od: d?.OverallDifficulty ?? 0,
                        sliderMultiplier: d?.SliderMultiplier ?? 0,
                    };
                });
                log.debug(`query_beatmaps lightweight count=${data.length}/${page.total} ${Date.now() - _t0}ms`);
                return {
                    data,
                    total: page.total,
                    offset: page.offset,
                    next_offset: page.next_offset,
                    limit: page.limit,
                };
            }

            // Paged all-map reads land here: metadata only, never any stored-file access.
            const data = page.data.map((b: any) => normalizeBeatmap(b));
            log.debug(`query_beatmaps count=${data.length}/${page.total} ${Date.now() - _t0}ms`);
            return { data, total: page.total, offset: page.offset, next_offset: page.next_offset, limit: page.limit };
        }

        case "get_beatmap_detail": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            // Snapshot the storage root before the synchronous read below; init/close
            // cannot interleave because this case never awaits.
            const realmPath = _realmPath;
            const md5Hash = typeof msg.md5Hash === "string" ? msg.md5Hash.trim() : "";
            const beatmapId = finiteNumber(msg.beatmapId);
            const filters: string[] = [];
            if (md5Hash.length > 0) filters.push(`(MD5Hash == ${q(md5Hash)} OR Hash == ${q(md5Hash)})`);
            if (beatmapId !== undefined && beatmapId > 0) filters.push(`OnlineID == ${Math.floor(beatmapId)}`);
            if (filters.length === 0) return null;

            let found: any;
            for (const filter of filters) {
                found = _realm.objects("Beatmap").filtered(filter)[0];
                if (found) break;
            }
            if (!found) {
                log.debug(`get_beatmap_detail no match md5=${md5Hash} id=${beatmapId ?? "-"} ${Date.now() - _t0}ms`);
                return null;
            }

            let counts: OsuFileObjectCounts | undefined;
            const contentHash = typeof found.Hash === "string" ? found.Hash : "";
            if (realmPath !== undefined && realmPath.length > 0 && contentHash.length > 0) {
                try {
                    counts = readStoredObjectCounts(realmPath, contentHash);
                } catch (err) {
                    log.warn(`get_beatmap_detail object counts unavailable: ${String(err)}`);
                }
            }
            const detail = normalizeBeatmapDetail(found, counts);
            log.debug(
                `get_beatmap_detail md5=${detail.MD5Hash ?? ""} counts=${counts ? "parsed" : "unavailable"} ${Date.now() - _t0}ms`,
            );
            return detail;
        }

        case "count_beatmaps": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            const spec = msg.spec as any;
            const queryStr = buildLazerBeatmapQuery(spec);
            const count = _realm.objects("Beatmap").filtered(queryStr).length;
            log.debug(`count_beatmaps: ${queryStr} count=${count} ${Date.now() - _t0}ms`);
            return { count };
        }

        case "query_scores_by_hashes": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            const hashes = stringList(msg.hashes);
            if (!hashes || hashes.length === 0) return { data: [], total: 0 };
            const hashList = hashes.map(q).join(",");
            const scores = _realm
                .objects("Score")
                .filtered(
                    `DeletePending == false AND (BeatmapInfo.MD5Hash IN {${hashList}} OR BeatmapHash IN {${hashList}})`,
                )
                .sorted("Date", true);
            const stableDedupKeys: string[] | undefined = msg.stableDedupKeys;
            const dedupSet = stableDedupKeys ? new Set(stableDedupKeys) : undefined;
            const returnOsuScore = msg.returnOsuScore === true;
            const data = [];
            for (const s of scores as unknown as any[]) {
                if (dedupSet && s.IsLegacyScore) {
                    const hash = s.BeatmapInfo?.MD5Hash ?? s.BeatmapHash ?? "";
                    const totalScore = s.LegacyTotalScore ?? s.TotalScore;
                    const dedupKey = `${hash}-${totalScore}-${new Date(s.Date).getTime()}-${s.MaxCombo}`;
                    if (dedupSet.has(dedupKey)) continue;
                }
                if (returnOsuScore) {
                    const rulesetId = s.Ruleset?.OnlineID ?? 0;
                    const hits = parseLazerStatistics(
                        typeof s.Statistics === "string" ? s.Statistics : JSON.stringify(s.Statistics),
                        rulesetId,
                    );
                    data.push({
                        md5Hash: s.BeatmapInfo?.MD5Hash ?? s.BeatmapHash ?? "",
                        userName: s.User?.Username ?? "",
                        ...hits,
                        totalScore: s.TotalScore,
                        maxCombo: s.MaxCombo,
                        perfect: s.Combo === s.MaxCombo && s.MaxCombo > 0,
                        date: new Date(s.Date),
                    });
                    continue;
                }
                data.push({
                    IsLegacyScore: s.IsLegacyScore,
                    Mods: typeof s.Mods === "string" ? s.Mods : JSON.stringify(s.Mods),
                    Statistics: typeof s.Statistics === "string" ? s.Statistics : JSON.stringify(s.Statistics),
                    MaximumStatistics:
                        typeof s.MaximumStatistics === "string"
                            ? s.MaximumStatistics
                            : JSON.stringify(s.MaximumStatistics),
                    TotalScore: s.TotalScore,
                    LegacyTotalScore: s.LegacyTotalScore,
                    TotalScoreVersion: s.TotalScoreVersion,
                    MaxCombo: s.MaxCombo,
                    Combo: s.Combo,
                    Accuracy: s.Accuracy,
                    Date: new Date(s.Date),
                    PP: s.PP,
                    LegacyOnlineID: s.LegacyOnlineID,
                    BeatmapHash: s.BeatmapHash,
                    Ruleset: s.Ruleset ? { OnlineID: s.Ruleset.OnlineID } : undefined,
                    User: s.User ? { Username: s.User.Username } : undefined,
                    BeatmapInfo: s.BeatmapInfo
                        ? { MD5Hash: s.BeatmapInfo.MD5Hash, Hash: s.BeatmapInfo.Hash }
                        : undefined,
                });
            }
            log.debug(
                `query_scores_by_hashes hashes=${hashes.length} count=${data.length} deduped=${scores.length - data.length} ${Date.now() - _t0}ms`,
            );
            return { data, total: data.length };
        }

        case "query_scores_by_user": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            const userName: string = msg.userName;
            const dateFrom: number | undefined = msg.dateFrom;
            const dateTo: number | undefined = msg.dateTo;
            if (!userName) return { data: [], total: 0 };
            const parts: string[] = [`DeletePending == false`, `User.Username == ${q(userName)}`];
            const args: unknown[] = [];
            if (dateFrom != null) {
                parts.push(`Date >= $0`);
                args.push(new Date(dateFrom));
            }
            if (dateTo != null) {
                parts.push(`Date <= $${args.length}`);
                args.push(new Date(dateTo));
            }
            const queryStr = parts.join(" AND ");
            log.debug(`query_scores_by_user: ${queryStr}`);
            const scores = _realm
                .objects("Score")
                .filtered(queryStr, ...args)
                .sorted("Date", true);
            const raw = readWithOffset(scores, msg.offset, msg.limit);
            const data = [];
            for (const s of raw.data as unknown as any[]) {
                data.push({
                    IsLegacyScore: s.IsLegacyScore,
                    Mods: typeof s.Mods === "string" ? s.Mods : JSON.stringify(s.Mods),
                    Statistics: typeof s.Statistics === "string" ? s.Statistics : JSON.stringify(s.Statistics),
                    MaximumStatistics:
                        typeof s.MaximumStatistics === "string"
                            ? s.MaximumStatistics
                            : JSON.stringify(s.MaximumStatistics),
                    TotalScore: s.TotalScore,
                    LegacyTotalScore: s.LegacyTotalScore,
                    TotalScoreVersion: s.TotalScoreVersion,
                    MaxCombo: s.MaxCombo,
                    Combo: s.Combo,
                    Accuracy: s.Accuracy,
                    Date: new Date(s.Date),
                    PP: s.PP,
                    Rank: s.Rank,
                    LegacyOnlineID: s.LegacyOnlineID,
                    BeatmapHash: s.BeatmapHash,
                    Ruleset: s.Ruleset ? { OnlineID: s.Ruleset.OnlineID } : undefined,
                    User: s.User ? { Username: s.User.Username } : undefined,
                    BeatmapInfo: s.BeatmapInfo
                        ? { MD5Hash: s.BeatmapInfo.MD5Hash, Hash: s.BeatmapInfo.Hash }
                        : undefined,
                });
            }
            log.debug(`query_scores_by_user user=${userName} count=${data.length}/${raw.total} ${Date.now() - _t0}ms`);
            return { data, total: raw.total, offset: raw.offset, next_offset: raw.next_offset, limit: raw.limit };
        }

        case "query_lazer_users": {
            if (_realm === undefined) {
                throw new Error("LazerReader has not been initialized.");
            }
            const _t0 = Date.now();
            const scores = _realm.objects("Score").filtered("DeletePending == false");
            const userSet = new Set<string>();
            for (const s of scores as unknown as any[]) {
                const name = s.User?.Username;
                if (name) userSet.add(name);
            }
            const data = Array.from(userSet).sort();
            log.debug(`query_lazer_users count=${data.length} ${Date.now() - _t0}ms`);
            return { data, total: data.length };
        }

        default:
            throw new Error(`Unknown message type: ${msg.type}`);
    }
}

parentPort.on("message", (event) => {
    const msg = event.data as any;
    if (msg.id < 0) {
        void handle(msg);
        return;
    }
    Promise.resolve()
        .then(() => handle(msg))
        .then((result) => parentPort.postMessage({ id: msg.id, result }))
        .catch((err) => parentPort.postMessage({ id: msg.id, error: String(err) }));
});
