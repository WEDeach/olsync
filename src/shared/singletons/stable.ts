import * as crypto from "crypto";
import type { UtilityProcess } from "electron";
import { utilityProcess } from "electron";
import * as fs from "fs";
import * as path from "path";
import { StableBeatmapDetail, StableBeatmapFilter } from "../../defines/stable_structs";
import { IOsuCollection } from "../../defines/types";
import { pathJoin, pBackupData } from "../../utils/file";
import SingletonBase from "./base";

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
    private _watchers: fs.FSWatcher[] = [];
    private _watchTimers: Map<string, NodeJS.Timeout> = new Map();
    private _watchStats: Map<string, { mtimeMs: number; size: number; md5?: string }> = new Map();
    private _utilProc: UtilityProcess | null = null;
    private _pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
    private _nextMsgId = 0;

    private _ensure_proc() {
        if (this._utilProc) return;
        const procPath = path.join(__dirname, "stableProcess.js");
        this._utilProc = utilityProcess.fork(procPath);
        this._utilProc.on("message", (msg: any) => {
            const p = this._pending.get(msg.id);
            if (!p) return;
            this._pending.delete(msg.id);
            msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
        });
        this._utilProc.on("exit", (code) => {
            for (const [, p] of this._pending) {
                p.reject(new Error(`Stable process exited: ${code}`));
            }
            this._pending.clear();
            this._utilProc = null;
        });
    }

    private _send<T = unknown>(type: string, data?: object): Promise<T> {
        this._ensure_proc();
        const id = this._nextMsgId++;
        return new Promise<T>((resolve, reject) => {
            this._pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
            this._utilProc?.postMessage({ id, type, ...data });
        });
    }

    private _post(type: string, data?: object) {
        this._ensure_proc();
        this._utilProc?.postMessage({ id: -1, type, ...data });
    }

    init(fpath: string) {
        if (this.base_path === fpath && this._utilProc) return;
        this.stop_watch();
        this.base_path = fpath;
        this._post("init", { basePath: fpath });
        console.debug(`StableReader init: ${fpath}`);
    }

    invalidate_cache() {
        this._post("invalidate_beatmaps");
        this._post("invalidate_scores");
        this._post("invalidate_collections");
    }

    watch_files(
        onBeatmapsChanged: () => void,
        onScoresChanged: () => void,
        onCollectionsChanged: () => void,
        isMd5CheckEnabled: () => boolean,
    ) {
        this.update_watch();
        this.stop_watch();
        if (!this.base_path) return;
        const dir = this.base_path;
        const fileHandlers: Record<string, { invalidate: () => void; notify: () => void }> = {
            "osu!.db": {
                invalidate: () => {
                    this._post("invalidate_beatmaps");
                },
                notify: onBeatmapsChanged,
            },
            "scores.db": {
                invalidate: () => {
                    this._post("invalidate_scores");
                },
                notify: onScoresChanged,
            },
            "collection.db": {
                invalidate: () => {
                    this._post("invalidate_collections");
                },
                notify: onCollectionsChanged,
            },
        };
        const watchedFiles = new Set(Object.keys(fileHandlers));
        this._watchStats.clear();
        for (const filename of watchedFiles) {
            this._refreshWatchStats(dir, filename);
        }
        console.log("[READER] start watchFiles");
        if (isMd5CheckEnabled()) {
            void (async () => {
                for (const filename of watchedFiles) {
                    try {
                        const newMd5 = await this._calculate_md5(pathJoin(dir, filename));
                        const prev = this._watchStats.get(filename);
                        if (prev && prev.md5 === undefined) prev.md5 = newMd5;
                    } catch {}
                }
            })();
        }
        const prevStatsForLog = new Map<string, { mtimeMs: number; size: number; md5?: string }>();
        const debounce = (
            filename: string,
            prevSnapshot: { mtimeMs: number; size: number; md5?: string } | undefined,
        ) => {
            const existing = this._watchTimers.get(filename);
            if (!existing) {
                prevStatsForLog.set(filename, prevSnapshot ?? { mtimeMs: 0, size: 0 });
            }
            if (existing) clearTimeout(existing);
            const timer = setTimeout(async () => {
                this._watchTimers.delete(filename);
                const handler = fileHandlers[filename];
                if (handler) {
                    const prevForLog = prevStatsForLog.get(filename);
                    prevStatsForLog.delete(filename);
                    const newStats = this._watchStats.get(filename);
                    let logSuffix = "";
                    if (isMd5CheckEnabled()) {
                        const md5Result = await this._has_watch_file_md5_changed(dir, filename);
                        if (!md5Result.changed) return;
                        logSuffix = `, md5: ${md5Result.oldMd5 ?? "?"} > ${md5Result.newMd5}`;
                    }
                    const deltaMtime = prevForLog && newStats ? newStats.mtimeMs - prevForLog.mtimeMs : null;
                    const deltaSize = prevForLog && newStats ? newStats.size - prevForLog.size : null;
                    let logMsg = `[READER] notify ${filename} changed`;
                    if (deltaMtime !== null && deltaSize !== null) {
                        logMsg += `. mtime: ${deltaMtime >= 0 ? "+" : ""}${Math.round(deltaMtime)}, size: ${deltaSize >= 0 ? "+" : ""}${deltaSize}`;
                    }
                    logMsg += logSuffix;
                    handler.invalidate();
                    console.log(logMsg);
                    handler.notify();
                }
            }, 1500);
            this._watchTimers.set(filename, timer);
        };
        try {
            const watcher = fs.watch(dir, { persistent: false }, (_, filename) => {
                if (!filename || !watchedFiles.has(filename)) return;
                const prevSnapshot = this._watchStats.get(filename);
                if (!this._hasWatchFileChanged(dir, filename)) return;
                debounce(filename, prevSnapshot ? { ...prevSnapshot } : undefined);
            });
            this._watchers.push(watcher);
        } catch {}
    }

    stop_watch() {
        for (const [, timer] of this._watchTimers) {
            clearTimeout(timer);
        }
        this._watchTimers.clear();
        for (const w of this._watchers) {
            try {
                w.close();
            } catch {}
        }
        this._watchers = [];
    }

    private _refreshWatchStats(dir: string, filename: string) {
        const filePath = pathJoin(dir, filename);
        try {
            const stats = fs.statSync(filePath);
            this._watchStats.set(filename, { mtimeMs: stats.mtimeMs, size: stats.size });
        } catch {
            this._watchStats.delete(filename);
        }
    }

    private _hasWatchFileChanged(dir: string, filename: string) {
        const filePath = pathJoin(dir, filename);
        try {
            const stats = fs.statSync(filePath);
            const prev = this._watchStats.get(filename);
            const next = { mtimeMs: stats.mtimeMs, size: stats.size, md5: prev?.md5 };
            const changed = !prev || prev.mtimeMs !== next.mtimeMs || prev.size !== next.size;
            if (changed) {
                this._watchStats.set(filename, next);
            }
            return changed;
        } catch {
            if (this._watchStats.has(filename)) {
                this._watchStats.delete(filename);
                return true;
            }
            return false;
        }
    }

    private update_watch() {
        // TODO: optimize this
    }

    private async _has_watch_file_md5_changed(
        dir: string,
        filename: string,
    ): Promise<{ changed: boolean; oldMd5?: string; newMd5: string }> {
        const filePath = pathJoin(dir, filename);
        const errorResult = { changed: true, oldMd5: undefined, newMd5: "?" };
        try {
            const newMd5 = await this._calculate_md5(filePath);
            const prev = this._watchStats.get(filename);
            const oldMd5 = prev?.md5;
            if (oldMd5 === newMd5) return { changed: false, oldMd5, newMd5 };
            if (prev) {
                prev.md5 = newMd5;
            } else {
                this._watchStats.set(filename, { mtimeMs: 0, size: 0, md5: newMd5 });
            }
            return { changed: true, oldMd5, newMd5 };
        } catch {
            return errorResult;
        }
    }

    private _calculate_md5(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("md5");
            const stream = fs.createReadStream(filePath);
            stream.on("data", (data) => hash.update(data));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
        });
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
        return this._send("beatmaps", { offset, limit });
    }

    async query_beatmaps(filter: StableBeatmapFilter, offset: number = 0, limit: number = 0) {
        return this._send("query_beatmaps", { filter, offset, limit });
    }

    count_beatmaps(): Promise<number> {
        return this._send<number>("count_beatmaps");
    }

    async get_beatmap_detail(md5Hash: string): Promise<StableBeatmapDetail | null> {
        return this._send<StableBeatmapDetail | null>("get_beatmap_detail", { md5Hash });
    }

    get_base_path(): string | undefined {
        return this.base_path;
    }

    async get_beatmap_index(offset: number = 0, limit: number = 0) {
        return this._send("get_beatmap_index", { offset, limit });
    }

    async collections(offset: number = 0, limit: number = 10) {
        return this._send("collections", { offset, limit });
    }

    set_collections(collections: IOsuCollection[]): Promise<number> {
        const collectionPath = this.get_path(PathType.Collection);
        const backupPath = this.get_path(PathType.CollectionBackup);
        return this._send<number>("set_collections", { collections, collectionPath, backupPath });
    }

    async scores(offset: number = 0, limit: number = 10) {
        return this._send("scores", { offset, limit });
    }
}
