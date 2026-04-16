import * as fs from "fs";
import {
    StableBeatmapDetail,
    StableBeatmapFilter,
    StableCollection,
    StableCollectionData,
} from "../../defines/stable_structs";
import { IOsuCollection } from "../../defines/types";
import { backupFileBySha256, pathJoin, pBackupData, saveFile } from "../../utils/file";
import { readWithOffset } from "../../utils/reader";
import { readNullableString, writeNullableString } from "../../utils/string";
import SingletonBase from "./base";

const Parser = require("binary-parser").Parser;

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
        const ticksTo1970 = 621355968000000000n; // 1970-01-01
        const ticksPerMillisecond = 10000n;
        const jsTimestamp = Number((ticks - ticksTo1970) / ticksPerMillisecond);
        return new Date(jsTimestamp);
    },
};

const bool_collector: any = {
    formatter: (value: number) => value === 1,
};

enum PathType {
    Osu,
    OsuBackup,
    OsuTest = 5,
    Collection = 10,
    CollectionBackup = 11,
    Scores = 20,
    ScoresBackup = 21,
    Presence = 30,
}

export default class StableReader extends SingletonBase {
    private base_path?: string;
    private _collections?: StableCollection;
    private _osu_db?: any;
    private _scores?: any;
    private _watchers: fs.FSWatcher[] = [];
    private _watchDebounceTimer?: NodeJS.Timeout;
    private _lastWatchNotifyTime = 0;

    init(fpath: string) {
        if (this.base_path === fpath && this._osu_db !== undefined) {
            return;
        }
        this.stopWatch();
        this.base_path = fpath;
        this._collections = undefined;
        this._osu_db = undefined;
        this._scores = undefined;
        console.debug(`StableReader init: ${fpath}`);
    }

    invalidateCache() {
        this._osu_db = undefined;
        this._collections = undefined;
        this._scores = undefined;
    }

    watchFiles(onChanged: () => void) {
        this.updateWatch();
        this.stopWatch();
        if (!this.base_path) return;
        const dir = this.base_path;
        const watchedFiles = new Set(["osu!.db", "collection.db", "scores.db"]);
        const debounced = () => {
            if (this._watchDebounceTimer) clearTimeout(this._watchDebounceTimer);
            this._watchDebounceTimer = setTimeout(() => {
                const now = Date.now();
                if (now - this._lastWatchNotifyTime < 5000) {
                    return;
                }
                this._lastWatchNotifyTime = now;
                this.invalidateCache();
                onChanged();
            }, 1500);
        };
        try {
            const watcher = fs.watch(dir, { persistent: false }, (_, filename) => {
                if (filename && watchedFiles.has(filename)) debounced();
            });
            this._watchers.push(watcher);
        } catch {}
    }

    stopWatch() {
        if (this._watchDebounceTimer) {
            clearTimeout(this._watchDebounceTimer);
            this._watchDebounceTimer = undefined;
        }
        for (const w of this._watchers) {
            try {
                w.close();
            } catch {}
        }
        this._watchers = [];
    }

    private updateWatch() {
        // TODO: optimize this
    }

    get_path(tpath: PathType) {
        if (this.base_path === undefined) {
            throw new Error("StableReader has not been initialized.");
        }
        switch (tpath) {
            case PathType.Osu:
                return pathJoin(this.base_path, "osu!.db");
            case PathType.OsuTest:
                return pathJoin(this.base_path, "_osu!.db");
            case PathType.Collection:
                return pathJoin(this.base_path, "collection.db");
            case PathType.Scores:
                return pathJoin(this.base_path, "scores.db");
            case PathType.CollectionBackup:
                return pathJoin(pBackupData, "collection.db");
        }
        throw new Error(`Invalid path type: ${tpath}`);
    }

    async beatmaps(offset: number = 0, limit: number = 10) {
        if (this._osu_db !== undefined) {
            return readWithOffset(this._osu_db.beatmaps, offset, limit);
        }

        const dp = this.get_path(PathType.Osu);
        const exists = fs.existsSync(dp);
        if (!exists) {
            console.log(`osu file does not exist: ${dp}`);
            return readWithOffset([], offset, limit);
        }
        console.time("Read osu!.db2");
        const buf = await fs.promises.readFile(dp);
        console.timeEnd("Read osu!.db2");

        console.time("Parse osu!.db");
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
                    formatter: (buffer: Buffer) => {
                        if (version >= 20250108) {
                            return buffer.readFloatLE(0);
                        } else {
                            return buffer.readDoubleLE(0);
                        }
                    },
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
            .nest("stdStarRatings", {
                type: parser_sr,
            })
            .nest("taikoStarRatings", {
                type: parser_sr,
            })
            .nest("ctbStarRatings", {
                type: parser_sr,
            })
            .nest("maniaStarRatings", {
                type: parser_sr,
            })
            .uint32le("drainSeconds")
            .uint32le("totalMilliseconds")
            .uint32le("previewMilliseconds")
            .uint32le("numTimingPoints")
            .array("timingPoints", {
                length: "numTimingPoints",
                type: parser_tp,
            })
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
            .array("beatmaps", {
                length: "beatmapCount",
                type: parser_beatmap_info,
            })
            .uint32le("userType");

        this._osu_db = parser.parse(buf);
        console.log(`Total beatmaps: ${this._osu_db.beatmaps.length}`);
        console.timeEnd("Parse osu!.db");
        //this._osu_db.beatmaps = this._osu_db.beatmaps.slice(0, 10);
        return readWithOffset(this._osu_db.beatmaps, offset, limit);
    }

    async queryBeatmaps(filter: StableBeatmapFilter, offset: number = 0, limit: number = 0) {
        if (this._osu_db === undefined) {
            await this.beatmaps(0, 1);
        }
        if (this._osu_db === undefined) {
            return readWithOffset([], offset, Math.max(limit, 1));
        }
        let filtered: any[] = this._osu_db.beatmaps.filter((m: any) => m.beatmapId !== 0);

        if (filter.title) {
            const q = filter.title.toLowerCase();
            filtered = filtered.filter(
                (m: any) =>
                    (m.songTitle ?? "").toLowerCase().includes(q) ||
                    (m.songTitleUnicode ?? "").toLowerCase().includes(q),
            );
        }

        if (filter.rankStatuses?.length) {
            const set = new Set(filter.rankStatuses);
            filtered = filtered.filter((m: any) => set.has(m.rankedStatus));
        }

        if (filter.starRatingMin !== undefined || filter.starRatingMax !== undefined) {
            const min = filter.starRatingMin ?? 0;
            const max = filter.starRatingMax ?? Number.MAX_VALUE;
            filtered = filtered.filter((m: any) => {
                const sr = m.stdStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0;
                return sr >= min && sr <= max;
            });
        }

        if (filter.modes?.length) {
            const set = new Set(filter.modes);
            filtered = filtered.filter((m: any) => set.has(m.mode));
        }

        if (filter.includedHashes !== undefined) {
            const set = new Set(filter.includedHashes);
            filtered = filtered.filter((m: any) => set.has(m.md5Hash));
        }

        if (filter.excludedHashes !== undefined) {
            const set = new Set(filter.excludedHashes);
            filtered = filtered.filter((m: any) => !set.has(m.md5Hash));
        }

        const effectiveLimit = limit > 0 ? limit : filtered.length;
        const slim = filtered.map((m: any) => ({
            beatmapId: m.beatmapId,
            beatmapSetId: m.beatmapSetId,
            md5Hash: m.md5Hash,
            rankedStatus: m.rankedStatus,
            mode: m.mode,
            starRating: m.stdStarRatings?.starRatings?.find((s: any) => s.mods === 0)?.starRating ?? 0,
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
            lastPlayedTime: m.lastPlayedTime,
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
        return readWithOffset(slim, offset, effectiveLimit);
    }

    countBeatmaps(): number {
        return this._osu_db?.beatmaps?.filter((m: any) => m.beatmapId !== 0).length ?? 0;
    }

    async getStableBeatmapDetail(md5Hash: string): Promise<StableBeatmapDetail | null> {
        if (this._osu_db === undefined) {
            await this.beatmaps(0, 1);
        }
        if (!this._osu_db) return null;
        const m = this._osu_db.beatmaps.find((b: any) => b.md5Hash === md5Hash);
        if (!m) return null;
        return { md5Hash: m.md5Hash, path: m.path, audioFileName: m.audioFileName, osuFileName: m.osuFileName };
    }

    async getBeatmapIndex(offset: number = 0, limit: number = 0) {
        if (this._osu_db === undefined) {
            await this.beatmaps(0, 1);
        }
        if (this._osu_db === undefined) {
            return readWithOffset([], offset, Math.max(limit, 1));
        }
        const index = this._osu_db.beatmaps
            .filter((m: any) => m.beatmapId !== 0)
            .map((m: any) => ({
                md5Hash: m.md5Hash,
                beatmapSetId: m.beatmapSetId,
                beatmapId: m.beatmapId,
            }));
        const effectiveLimit = limit > 0 ? limit : index.length;
        return readWithOffset(index, offset, effectiveLimit);
    }

    async collections(offset: number = 0, limit: number = 10) {
        if (this._collections !== undefined) {
            return readWithOffset(this._collections.collections, offset, limit);
        }

        const dp = this.get_path(PathType.Collection);
        const buf = await fs.promises.readFile(dp);

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

        this._collections = parser.parse(buf);
        return readWithOffset(this._collections?.collections ?? [], offset, limit);
    }

    set_collections(collections: IOsuCollection[]) {
        if (this.base_path === undefined) {
            throw new Error("StableReader has not been initialized.");
        }
        if (this._collections === undefined) {
            throw new Error("StableReader's collections has not been initialized.");
        }
        const _collections: StableCollectionData[] = collections.map((collection: IOsuCollection) => {
            return {
                name: collection.name,
                mapCount: collection.maps.length,
                maps: collection.maps.map((map: string) => {
                    return {
                        checksum: map,
                    };
                }),
            };
        });
        this._collections = {
            version: this._collections.version,
            collectionCount: _collections.length,
            collections: _collections,
        };
        const buffers: Buffer[] = [];
        const header = Buffer.alloc(8);
        header.writeInt32LE(this._collections.version, 0);
        header.writeInt32LE(this._collections.collectionCount, 4);
        buffers.push(header);

        for (const col of this._collections.collections) {
            // name
            buffers.push(writeNullableString(col.name));

            // mapCount
            const mapCountBuf = Buffer.alloc(4);
            mapCountBuf.writeInt32LE(col.maps.length, 0);
            buffers.push(mapCountBuf);

            // maps
            console.log(col.maps);

            for (const map of col.maps) {
                buffers.push(writeNullableString(map.checksum));
            }
        }
        const buf = Buffer.concat(buffers);

        // backup
        backupFileBySha256(this.get_path(PathType.Collection), this.get_path(PathType.CollectionBackup));

        // write
        saveFile(buf, this.get_path(PathType.Collection));
        return 1;
    }

    async scores(offset: number = 0, limit: number = 10) {
        if (this._scores !== undefined) {
            return readWithOffset(this._scores.beatmaps, offset, limit);
        }

        const dp = this.get_path(PathType.Scores);
        const buf = await fs.promises.readFile(dp);

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
            .array("scores", {
                length: "scoreCount",
                type: parser_score,
            });
        const parser = new Parser().uint32le("version").uint32le("beatmapCount").array("beatmaps", {
            length: "beatmapCount",
            type: parser_beatmap,
        });

        this._scores = parser.parse(buf);
        console.log(
            `Score Version: ${this._scores.version}, Beatmap Count: ${this._scores.beatmapCount}, Score Count: ${this._scores.beatmapCount > 0 ? this._scores.beatmaps.map((beatmap: any) => beatmap.scoreCount).reduce((a: number, b: number) => a + b) : 0}`,
        );

        return readWithOffset(this._scores.beatmaps, offset, limit);
    }
}
