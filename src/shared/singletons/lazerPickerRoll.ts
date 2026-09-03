/**
 * Backend lazer picker roll. The candidate pool is fetched from the lazer
 * Realm (lightweight fields only) and evaluated here in the main process;
 * the renderer only ever receives counts, preview rows and the picked map.
 */
import type { LazerConditionScore, LazerRollRequest, LazerRollResponse } from "../../defines/lazer_picker";
import type { LazerLightweightBeatmap } from "../../defines/lazer_structs";
import { createLogger } from "../../utils/logger";
import type { OsuBeatmap, OsuScore } from "../../utils/osu";
import SharedManager from "../sharedManager";
import { lazerBeatmapToOsuBeatmap, lazerLightweightToOsuBeatmap } from "../utils/osuConvert";
import { buildWeightedPool, checkWishlist, get_effective_sr, pickRandomWeighted } from "../utils/pickerLogic";

const log = createLogger("LazerPickerRoll");

const POOL_PAGE_SIZE = 2000;
const SCORE_CHUNK_SIZE = 2000;
const SCORE_PAGE_SIZE = 2000;

const SCORE_RECORD = "score_record";
const COLLECTION = "collection";

/**
 * Pool cache keyed by the filter spec. Filters change rarely, while history /
 * online tags change on every roll — the cached pool + scores make repeated
 * count/preview/roll evaluations cheap (in-memory only). A different spec
 * replaces the cache entry.
 */
interface PoolCacheEntry {
    specKey: string;
    pool: LazerLightweightBeatmap[];
    maps: OsuBeatmap[];
    scoresByHash: Map<string, OsuScore[]>;
    scoresFetched: boolean;
    collectionMaps: Map<string, Set<string>>;
    collectionsFetched: boolean;
}

let poolCache: PoolCacheEntry | null = null;

function canonicalSpecKey(spec: LazerRollRequest["spec"]): string {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(spec).sort()) {
        sorted[k] = (spec as Record<string, unknown>)[k];
    }
    return JSON.stringify(sorted);
}

function weightUsesScore(entry: LazerRollRequest["weights"][number]): boolean {
    return entry.enabled !== false && entry.type === SCORE_RECORD;
}

function wishlistUsesScore(entry: LazerRollRequest["wishlist"][number]): boolean {
    return entry.enabled !== false && entry.conditions.some((c) => c.type === SCORE_RECORD);
}

function wishlistUsesCollection(entry: LazerRollRequest["wishlist"][number]): boolean {
    return entry.enabled !== false && entry.conditions.some((c) => c.type === COLLECTION);
}

async function fetchLightweightPool(spec: LazerRollRequest["spec"]): Promise<LazerLightweightBeatmap[]> {
    const reader = SharedManager.lazerReader;
    const pool: LazerLightweightBeatmap[] = [];
    let offset = 0;
    while (true) {
        const page = await reader.query_beatmaps({ ...spec, returnLightweight: true }, offset, POOL_PAGE_SIZE);
        pool.push(...(page.data as LazerLightweightBeatmap[]));
        const next = page.next_offset;
        if (next == null || next <= offset || pool.length >= page.total) break;
        offset = next;
    }
    return pool;
}

async function fetchCollectionMaps(): Promise<Map<string, Set<string>>> {
    const reader = SharedManager.lazerReader;
    const collectionMaps = new Map<string, Set<string>>();
    let offset = 0;
    while (true) {
        const page = (await reader.get_collections(offset, 500)) as {
            data?: Array<{ Name?: string; BeatmapMD5Hashes?: string[] }>;
            next_offset?: number;
            total?: number;
        };
        const data = page.data ?? [];
        for (const col of data) {
            if (col?.Name) collectionMaps.set(col.Name, new Set(col.BeatmapMD5Hashes ?? []));
        }
        const next = page.next_offset;
        if (next == null || next <= offset || offset + data.length >= (page.total ?? 0)) break;
        offset = next;
    }
    return collectionMaps;
}

async function fetchScoresByHashes(hashes: string[]): Promise<Map<string, OsuScore[]>> {
    const map = new Map<string, OsuScore[]>();
    const unique = [...new Set(hashes.filter(Boolean))];
    for (let i = 0; i < unique.length; i += SCORE_CHUNK_SIZE) {
        const chunk = unique.slice(i, i + SCORE_CHUNK_SIZE);

        // Stable scores arrive already converted to OsuScore shape.
        let stable = (await SharedManager.stableReader.query_scores_by_hashes(chunk, undefined, 0, SCORE_PAGE_SIZE)) as
            | {
                  error?: unknown;
                  offset: number;
                  next_offset: number;
                  data?: Array<{ md5Hash?: string; scores?: OsuScore[] }>;
              }
            | undefined;
        while (stable && !("error" in stable)) {
            const data = stable.data ?? [];
            for (const d of data) {
                if (!d?.md5Hash || !d.scores || d.scores.length === 0) continue;
                const arr = map.get(d.md5Hash);
                if (arr) arr.push(...d.scores);
                else map.set(d.md5Hash, [...d.scores]);
            }
            const next = stable.next_offset;
            if (next == null || next <= stable.offset || data.length === 0) break;
            stable = (await SharedManager.stableReader.query_scores_by_hashes(
                chunk,
                undefined,
                next,
                SCORE_PAGE_SIZE,
            )) as typeof stable;
        }

        // Lazer scores: the worker returns the minimal OsuScore shape (returnOsuScore).
        const lazer = await SharedManager.lazerReader.query_scores_by_hashes(chunk, undefined, true);
        for (const s of (lazer.data as LazerConditionScore[]) ?? []) {
            if (!s?.md5Hash) continue;
            const arr = map.get(s.md5Hash);
            if (arr) arr.push(s as unknown as OsuScore);
            else map.set(s.md5Hash, [s as unknown as OsuScore]);
        }
    }
    return map;
}

export async function rollLazerBeatmap(req: LazerRollRequest): Promise<LazerRollResponse> {
    const reader = SharedManager.lazerReader;
    const needsScores = req.weights.some(weightUsesScore) || req.wishlist.some(wishlistUsesScore);
    const needsCollections =
        req.weights.some((w) => w.enabled !== false && w.type === COLLECTION) ||
        req.wishlist.some(wishlistUsesCollection);
    const needsPool =
        req.weights.length > 0 ||
        req.wishlist.length > 0 ||
        req.srSubFilter !== undefined ||
        needsScores ||
        needsCollections;

    if (!needsPool) {
        const { count } = await reader.count_beatmaps(req.spec);
        return { poolCount: count, count };
    }

    const key = canonicalSpecKey(req.spec);
    let entry = poolCache && poolCache.specKey === key ? poolCache : null;
    if (!entry) {
        const _t0 = Date.now();
        const pool = await fetchLightweightPool(req.spec);
        const maps = pool.map(lazerLightweightToOsuBeatmap);
        log.info(`roll lazer pool=${pool.length} in ${Date.now() - _t0}ms`);
        entry = {
            specKey: key,
            pool,
            maps,
            scoresByHash: new Map<string, OsuScore[]>(),
            scoresFetched: false,
            collectionMaps: new Map<string, Set<string>>(),
            collectionsFetched: false,
        };
        poolCache = entry;
    }
    if (needsScores && !entry.scoresFetched) {
        entry.scoresByHash = await fetchScoresByHashes(entry.maps.map((m) => m.md5Hash));
        entry.scoresFetched = true;
    }
    if (needsCollections && !entry.collectionsFetched) {
        entry.collectionMaps = await fetchCollectionMaps();
        entry.collectionsFetched = true;
    }

    // Star rating sub-filter (Greater/Equal/Less) needs client-side semantics
    // (effective SR + rounding) that Realm cannot express exactly. Filter a
    // copy — never mutate the cached pool.
    let maps = entry.maps;
    if (req.srSubFilter) {
        const modeSet = new Set(req.spec.modes ?? []);
        const { op, target } = req.srSubFilter;
        const decimalPart = String(target).split(".")[1];
        const factor = decimalPart ? 10 ** decimalPart.length : 1;
        maps = maps.filter((m) => {
            const rounded = Math.round(get_effective_sr(m, modeSet) * factor) / factor;
            if (op === "equal") return rounded === target;
            if (op === "less") return rounded <= target;
            return rounded >= target;
        });
    }

    const scoresByHash = entry.scoresByHash;
    const collectionMaps = entry.collectionMaps;
    const onlineTagsCache = req.onlineTags && req.onlineTags.length > 0 ? new Map(req.onlineTags) : undefined;

    const advanced = { weights: req.weights, wishlist: req.wishlist };
    const wishlistCandidates = checkWishlist(
        maps,
        advanced,
        scoresByHash,
        collectionMaps,
        req.history,
        onlineTagsCache,
    );
    const wishlistPool =
        wishlistCandidates.length > 0
            ? buildWeightedPool(
                  wishlistCandidates,
                  advanced,
                  collectionMaps,
                  scoresByHash,
                  req.history,
                  onlineTagsCache,
              ).filter((p) => p.weight > 0)
            : [];
    const weighted =
        wishlistPool.length > 0
            ? wishlistPool
            : buildWeightedPool(maps, advanced, collectionMaps, scoresByHash, req.history, onlineTagsCache);
    const positive = weighted.filter((p) => p.weight > 0);

    const response: LazerRollResponse = {
        poolCount: maps.length,
        count: positive.length,
    };

    if (req.mode === "preview") {
        const total = positive.reduce((s, p) => s + p.weight, 0);
        const limit = Math.max(1, req.previewLimit ?? 500);
        const rawByHash = new Map(entry.pool.map((l) => [l.md5Hash, l]));
        response.rows = positive
            .map((p) => ({
                beatmap: rawByHash.get(p.map.md5Hash) ?? (p.map as unknown as LazerLightweightBeatmap),
                weight: p.weight,
                probability: total > 0 ? (p.weight / total) * 100 : 0,
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, limit);
        return response;
    }

    if (req.mode === "roll") {
        const picked = pickRandomWeighted(positive.length > 0 ? positive : weighted);
        if (picked) {
            // Dedicated one-map read: the only path allowed to parse the stored
            // `.osu`. A failure here must not invalidate the roll counts.
            const detail = await reader
                .get_beatmap_detail({
                    md5Hash: picked.md5Hash || undefined,
                    beatmapId: picked.beatmapId > 0 ? picked.beatmapId : undefined,
                })
                .catch((err: unknown) => {
                    log.warn(`roll detail fetch failed for ${picked.md5Hash}: ${String(err)}`);
                    return null;
                });
            if (detail) {
                response.picked = lazerBeatmapToOsuBeatmap(detail);
            }
        }
        return response;
    }

    return response;
}
