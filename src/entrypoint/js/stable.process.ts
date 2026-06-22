import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { StableBeatmapFilter, StableCollection, StableCollectionData } from "../../defines/stable_structs";
import type { IOsuCollection } from "../../defines/types";
import { createLogger } from "../../utils/logger";
import { readWithOffset } from "../../utils/reader";
import { readNullableString, writeNullableString } from "../../utils/string";

const Parser = require("binary-parser").Parser;

const log = createLogger("StableProcess");

function backup_file_by_sha256(in_path: string, out_path: string) {
    const data = fs.readFileSync(in_path);
    const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 8);
    const info = path.parse(out_path);
    const p_out = path.join(info.dir, `${info.name}.${hash}${info.ext}`);
    fs.mkdirSync(path.dirname(p_out), { recursive: true });
    fs.writeFileSync(p_out, data);
}

function save_file(data: Buffer, out_path: string) {
    fs.mkdirSync(path.dirname(out_path), { recursive: true });
    fs.writeFileSync(out_path, data);
}

const parentPort: {
    on(event: "message", listener: (event: { data: unknown }) => void): void;
    postMessage(message: unknown): void;
} = (process as any).parentPort;

const nullable_string_collector: any = {
    readUntil: function (_item: any, buffer: Buffer) {
        if (this._readUntil === undefined) {
            const result = readNullableString(buffer);
            this._readUntil = result.newOffset;
            this._offset = 0;
        } else {
            this._offset++;
        }
        return this._offset === this._readUntil;
    },
    formatter: function (buffer: Buffer) {
        this._readUntil = undefined;
        return readNullableString(buffer).value;
    },
};

const date_collector: any = {
    formatter: (ticks: bigint) => {
        if (ticks === 0n) return null;
        const ticksTo1970 = 621355968000000000n;
        const ticksPerMillisecond = 10000n;
        const jsTimestamp = Number((ticks - ticksTo1970) / ticksPerMillisecond);
        return new Date(jsTimestamp);
    },
};

const bool_collector: any = {
    formatter: (value: number) => value === 1,
};

interface SlimBeatmap {
    beatmapId: number;
    beatmapSetId: number;
    md5Hash: string;
    rankedStatus: number;
    mode: number;
    srStd: number;
    srTaiko: number;
    srCtb: number;
    srMania: number;
    artist: string;
    artistUnicode: string;
    songTitle: string;
    songTitleUnicode: string;
    difficultyName: string;
    creatorName: string;
    osuStandardGrade: number;
    unplayed: boolean;
    tags: string;
    drainSeconds: number;
    lastPlayedTime: Date | null;
    ar: number;
    cs: number;
    hp: number;
    od: number;
    numCircles: number;
    numSliders: number;
    numSpinners: number;
    sliderMultiplier: number;
    stackLeniency: number;
    source: string;
}

interface DetailEntry {
    path: string;
    audioFileName: string;
    osuFileName: string;
}

let _basePath: string | undefined;
let _slim_beatmaps: SlimBeatmap[] | null = null;
let _detail_map: Map<string, DetailEntry> | null = null;
let _scores: any;
let _collections: StableCollection | undefined;
let _osu_db_loading: Promise<void> | null = null;
let _scores_loading: Promise<void> | null = null;
let _collections_loading: Promise<void> | null = null;

async function parse_osu_db(): Promise<void> {
    if (_slim_beatmaps !== null || !_basePath) return;
    if (_osu_db_loading) return _osu_db_loading;
    _osu_db_loading = _do_parse_osu_db().finally(() => {
        _osu_db_loading = null;
    });
    return _osu_db_loading;
}

async function _do_parse_osu_db(): Promise<void> {
    if (!_basePath) return;

    const dp = path.join(_basePath, "osu!.db");
    if (!fs.existsSync(dp)) {
        log.info(`osu file does not exist: ${dp}`);
        _slim_beatmaps = [];
        _detail_map = new Map();
        return;
    }

    const t0 = Date.now();
    log.info("Reading osu!.db...");
    const buf = await fs.promises.readFile(dp);
    log.info(`Read osu!.db done in ${Date.now() - t0}ms (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

    const t1 = Date.now();
    log.info("Parsing osu!.db...");
    const versionParser = new Parser().uint32le("version");
    const { version } = versionParser.parse(buf);

    const parser_tp = new Parser().doublele("bpm").doublele("offset").uint8("inherited", bool_collector);

    const parser_sr = new Parser().int32le("numStarRatings").array("starRatings", {
        length: "numStarRatings",
        type: new Parser()
            .uint8("objType1")
            .uint32le("mods")
            .uint8("objType2")
            .buffer("starRating", {
                length: () => (version >= 20250108 ? 4 : 8),
                formatter: (buffer: Buffer) => (version >= 20250108 ? buffer.readFloatLE(0) : buffer.readDoubleLE(0)),
            }),
    });

    const parser_beatmap_info = new Parser()
        .buffer("artist", nullable_string_collector)
        .buffer("artistUnicode", nullable_string_collector)
        .buffer("songTitle", nullable_string_collector)
        .buffer("songTitleUnicode", nullable_string_collector)
        .buffer("creatorName", nullable_string_collector)
        .buffer("difficultyName", nullable_string_collector)
        .buffer("audioFileName", nullable_string_collector)
        .buffer("md5Hash", nullable_string_collector)
        .buffer("osuFileName", nullable_string_collector)
        .int8("rankedStatus")
        .uint16le("numCircles")
        .uint16le("numSliders")
        .uint16le("numSpinners")
        .uint64le("lastModificationTime", date_collector)
        .floatle("ar")
        .floatle("cs")
        .floatle("hp")
        .floatle("od")
        .doublele("sliderMultiplier")
        .nest("stdStarRatings", { type: parser_sr })
        .nest("taikoStarRatings", { type: parser_sr })
        .nest("ctbStarRatings", { type: parser_sr })
        .nest("maniaStarRatings", { type: parser_sr })
        .uint32le("drainSeconds")
        .uint32le("totalMilliseconds")
        .uint32le("previewMilliseconds")
        .uint32le("numTimingPoints")
        .array("timingPoints", { length: "numTimingPoints", type: parser_tp })
        .uint32le("beatmapId")
        .uint32le("beatmapSetId")
        .uint32le("threadId")
        .uint8("osuStandardGrade")
        .uint8("taikoGrade")
        .uint8("ctbGrade")
        .uint8("maniaGrade")
        .uint16("localOffset")
        .floatle("stackLeniency")
        .uint8("mode")
        .buffer("source", nullable_string_collector)
        .buffer("tags", nullable_string_collector)
        .uint16("onlineOffset")
        .buffer("titleFont", nullable_string_collector)
        .uint8("unplayed", bool_collector)
        .uint64le("lastPlayedTime", date_collector)
        .uint8("isOsz2", bool_collector)
        .buffer("path", nullable_string_collector)
        .uint64le("lastOnlineCheckTime", date_collector)
        .uint8("disableCustomSound", bool_collector)
        .uint8("disableCustomSkin", bool_collector)
        .uint8("disableStoryboard", bool_collector)
        .uint8("disableVideo", bool_collector)
        .uint8("visualOverride", bool_collector)
        .uint32le("lastEditTime")
        .uint8("scrollSpeed");

    const parser = new Parser()
        .uint32le("version")
        .uint32le("folderCount")
        .uint8("accountUnlocked", bool_collector)
        .uint64le("unlockTime", date_collector)
        .buffer("userName", nullable_string_collector)
        .uint32le("beatmapCount")
        .array("beatmaps", { length: "beatmapCount", type: parser_beatmap_info })
        .uint32le("userType");

    const raw = parser.parse(buf);
    log.info(`Parse osu!.db done in ${Date.now() - t1}ms, total beatmaps: ${raw.beatmaps.length}`);

    _slim_beatmaps = (raw.beatmaps as any[])
        .filter((m) => m.beatmapId !== 0)
        .map((m) => ({
            beatmapId: m.beatmapId,
            beatmapSetId: m.beatmapSetId,
            md5Hash: m.md5Hash,
            rankedStatus: m.rankedStatus,
            mode: m.mode,
            srStd: m.stdStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0,
            srTaiko: m.taikoStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0,
            srCtb: m.ctbStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0,
            srMania: m.maniaStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0,
            artist: m.artist,
            artistUnicode: m.artistUnicode,
            songTitle: m.songTitle,
            songTitleUnicode: m.songTitleUnicode,
            difficultyName: m.difficultyName,
            creatorName: m.creatorName,
            osuStandardGrade: m.osuStandardGrade,
            unplayed: m.unplayed,
            tags: m.tags,
            drainSeconds: m.drainSeconds,
            lastPlayedTime: m.lastPlayedTime ?? null,
            ar: m.ar,
            cs: m.cs,
            hp: m.hp,
            od: m.od,
            numCircles: m.numCircles,
            numSliders: m.numSliders,
            numSpinners: m.numSpinners,
            sliderMultiplier: m.sliderMultiplier,
            stackLeniency: m.stackLeniency,
            source: m.source,
        }));

    _detail_map = new Map<string, DetailEntry>(
        (raw.beatmaps as any[]).map((m) => [
            m.md5Hash,
            { path: m.path, audioFileName: m.audioFileName, osuFileName: m.osuFileName },
        ]),
    );
}

async function parse_scores(): Promise<void> {
    if (_scores !== undefined || !_basePath) return;
    if (_scores_loading) return _scores_loading;
    _scores_loading = _do_parse_scores().finally(() => {
        _scores_loading = null;
    });
    return _scores_loading;
}

async function _do_parse_scores(): Promise<void> {
    if (!_basePath) return;

    const dp = path.join(_basePath, "scores.db");
    const t0 = Date.now();
    log.info("Reading scores.db...");
    const buf = await fs.promises.readFile(dp);
    log.info(`Read scores.db done in ${Date.now() - t0}ms (${(buf.length / 1024).toFixed(0)} KB)`);
    const t1 = Date.now();
    log.info("Parsing scores.db...");

    const parser_score = new Parser()
        .uint8("ruleset")
        .int32le("version")
        .buffer("md5Hash", nullable_string_collector)
        .buffer("userName", nullable_string_collector)
        .buffer("replyHash", nullable_string_collector)
        .uint16le("count300")
        .uint16le("count100")
        .uint16le("count50")
        .uint16le("countGeki")
        .uint16le("countKatu")
        .uint16le("countMiss")
        .int32le("totalScore")
        .uint16le("maxCombo")
        .uint8("perfect", bool_collector)
        .int32le("mods")
        .buffer("hpGraphString", nullable_string_collector)
        .uint64le("date", date_collector)
        .int32le("compressedReplay")
        .int64le("legacyOnlineID")
        .buffer("additionalModData", {
            length: function () {
                const TARGET_MOD = 0x800000;
                return (this.mods & TARGET_MOD) !== 0 ? 8 : 0;
            },
            formatter: (buffer: Buffer) => {
                if (buffer.length === 0) return null;
                return buffer.readDoubleLE(0);
            },
        });

    const parser_beatmap = new Parser()
        .buffer("md5Hash", nullable_string_collector)
        .uint32le("scoreCount")
        .array("scores", { length: "scoreCount", type: parser_score });

    const parser = new Parser().uint32le("version").uint32le("beatmapCount").array("beatmaps", {
        length: "beatmapCount",
        type: parser_beatmap,
    });

    _scores = parser.parse(buf);
    const scoreCount =
        _scores.beatmapCount > 0
            ? _scores.beatmaps.map((b: any) => b.scoreCount).reduce((a: number, b: number) => a + b)
            : 0;
    log.info(
        `Parse scores.db done in ${Date.now() - t1}ms, version: ${_scores.version}, beatmaps: ${_scores.beatmapCount}, scores: ${scoreCount}`,
    );
    for (const bm of _scores.beatmaps as any[]) {
        for (const s of bm.scores as any[]) {
            delete s.hpGraphString;
            delete s.replyHash;
        }
    }
}

async function parse_collections(): Promise<void> {
    if (_collections !== undefined || !_basePath) return;
    if (_collections_loading) return _collections_loading;
    _collections_loading = _do_parse_collections().finally(() => {
        _collections_loading = null;
    });
    return _collections_loading;
}

async function _do_parse_collections(): Promise<void> {
    if (!_basePath) return;

    const dp = path.join(_basePath, "collection.db");
    const t0 = Date.now();
    log.info("Reading collection.db...");
    const buf = await fs.promises.readFile(dp);
    log.info(`Read collection.db done in ${Date.now() - t0}ms`);
    const t1 = Date.now();

    const parser = new Parser()
        .uint32le("version")
        .uint32le("collectionCount")
        .array("collections", {
            length: "collectionCount",
            type: new Parser()
                .saveOffset("offset")
                .buffer("name", {
                    readUntil: function (_item: any, buffer: Buffer) {
                        if (this._readUntil === undefined) {
                            const result = readNullableString(buffer);
                            this._readUntil = result.newOffset;
                            this._offset = 0;
                        } else {
                            this._offset++;
                        }
                        return this._offset === this._readUntil;
                    },
                    formatter: function (buffer: Buffer) {
                        this._readUntil = undefined;
                        return readNullableString(buffer).value;
                    },
                })
                .uint32le("mapCount")
                .array("maps", {
                    length: "mapCount",
                    type: new Parser().buffer("checksum", {
                        readUntil: function (_item: any, buffer: Buffer) {
                            if (this._readUntil === undefined) {
                                const result = readNullableString(buffer);
                                this._readUntil = result.newOffset;
                                this._offset = 0;
                            } else {
                                this._offset++;
                            }
                            return this._offset === this._readUntil;
                        },
                        formatter: (buffer: Buffer) => readNullableString(buffer).value,
                    }),
                }),
        });

    _collections = parser.parse(buf);
    log.info(`Parse collection.db done in ${Date.now() - t1}ms, collections: ${_collections?.collectionCount ?? 0}`);
}

async function handle(msg: any): Promise<unknown> {
    switch (msg.type) {
        case "init": {
            if (_basePath !== msg.basePath) {
                _basePath = msg.basePath;
                _slim_beatmaps = null;
                _detail_map = null;
                _scores = undefined;
                _collections = undefined;
            }
            return null;
        }

        case "beatmaps": {
            await parse_osu_db();
            return readWithOffset(_slim_beatmaps ?? [], msg.offset, msg.limit);
        }

        case "query_beatmaps": {
            await parse_osu_db();
            if (!_slim_beatmaps) return readWithOffset([], msg.offset, Math.max(msg.limit, 1));

            const filter: StableBeatmapFilter = msg.filter ?? {};
            const titleQ = filter.title ? filter.title.toLowerCase() : null;
            const rankSet = filter.rankStatuses?.length ? new Set(filter.rankStatuses) : null;
            const modeSet = filter.modes?.length ? new Set(filter.modes) : null;
            const includedSet = filter.includedHashes !== undefined ? new Set(filter.includedHashes) : null;
            const excludedSet = filter.excludedHashes !== undefined ? new Set(filter.excludedHashes) : null;
            const srMin = filter.starRatingMin ?? null;
            const srMax = filter.starRatingMax ?? null;

            const filtered = _slim_beatmaps.filter((m) => {
                if (titleQ) {
                    const t = (m.songTitle ?? "").toLowerCase();
                    const tu = (m.songTitleUnicode ?? "").toLowerCase();
                    if (!t.includes(titleQ) && !tu.includes(titleQ)) return false;
                }
                if (rankSet && !rankSet.has(m.rankedStatus)) return false;
                if (srMin !== null || srMax !== null) {
                    const sr = m.mode === 1 ? m.srTaiko : m.mode === 2 ? m.srCtb : m.mode === 3 ? m.srMania : m.srStd;
                    if (srMin !== null && sr < srMin) return false;
                    if (srMax !== null && sr > srMax) return false;
                }
                if (modeSet && !modeSet.has(m.mode)) return false;
                if (includedSet && !includedSet.has(m.md5Hash)) return false;
                if (excludedSet?.has(m.md5Hash)) return false;
                return true;
            });

            const effectiveLimit = msg.limit > 0 ? msg.limit : filtered.length;
            return readWithOffset(filtered, msg.offset, effectiveLimit);
        }

        case "count_beatmaps": {
            await parse_osu_db();
            return _slim_beatmaps?.length ?? 0;
        }

        case "get_beatmap_detail": {
            await parse_osu_db();
            if (!_detail_map) return null;
            const d = _detail_map.get(msg.md5Hash);
            if (!d) return null;
            return { md5Hash: msg.md5Hash, ...d };
        }

        case "get_beatmap_index": {
            await parse_osu_db();
            if (!_slim_beatmaps) return readWithOffset([], msg.offset, Math.max(msg.limit, 1));
            const index = _slim_beatmaps.map((m) => ({
                md5Hash: m.md5Hash,
                beatmapSetId: m.beatmapSetId,
                beatmapId: m.beatmapId,
            }));
            const effectiveLimit = msg.limit > 0 ? msg.limit : index.length;
            return readWithOffset(index, msg.offset, effectiveLimit);
        }

        case "scores": {
            await parse_scores();
            return readWithOffset(_scores?.beatmaps ?? [], msg.offset, msg.limit);
        }

        case "collections": {
            await parse_collections();
            return readWithOffset(_collections?.collections ?? [], msg.offset, msg.limit);
        }

        case "set_collections": {
            await parse_collections();
            if (_collections === undefined) {
                throw new Error("StableReader's collections has not been initialized.");
            }

            const _colData: StableCollectionData[] = (msg.collections as IOsuCollection[]).map((col) => ({
                name: col.name,
                mapCount: col.maps.length,
                maps: col.maps.map((map: string) => ({ checksum: map })),
            }));

            _collections = {
                version: _collections.version,
                collectionCount: _colData.length,
                collections: _colData,
            };

            const buffers: Buffer[] = [];
            const header = Buffer.alloc(8);
            header.writeInt32LE(_collections.version, 0);
            header.writeInt32LE(_collections.collectionCount, 4);
            buffers.push(header);

            for (const col of _collections.collections) {
                buffers.push(writeNullableString(col.name));
                const mapCountBuf = Buffer.alloc(4);
                mapCountBuf.writeInt32LE(col.maps.length, 0);
                buffers.push(mapCountBuf);
                log.debug(col.maps);
                for (const map of col.maps) {
                    buffers.push(writeNullableString(map.checksum));
                }
            }

            const buf = Buffer.concat(buffers);
            backup_file_by_sha256(msg.collectionPath, msg.backupPath);
            save_file(buf, msg.collectionPath);
            return 1;
        }

        case "invalidate_beatmaps": {
            _slim_beatmaps = null;
            _detail_map = null;
            _osu_db_loading = null;
            return null;
        }

        case "invalidate_scores": {
            _scores = undefined;
            _scores_loading = null;
            return null;
        }

        case "invalidate_collections": {
            _collections = undefined;
            _collections_loading = null;
            return null;
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
