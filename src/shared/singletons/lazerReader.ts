import type { UtilityProcess } from "electron";
import { utilityProcess } from "electron";
import * as path from "path";
import { LazerBeatmap, LazerBeatmapDetailRequest } from "../../defines/lazer_structs";
import { IOsuCollection } from "../../defines/types";
import { createLogger } from "../../utils/logger";
import { DefaultObjectWithOffset } from "../../utils/reader";
import SingletonBase from "./base";

const log = createLogger("LazerReader");

export default class LazerReader extends SingletonBase {
    private _utilProc: UtilityProcess | null = null;
    private _pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
    private _nextMsgId = 0;
    private _onNotification: ((type: string) => void) | null = null;
    private _initPath: string | undefined;

    private _ensure_proc() {
        if (this._utilProc) return;
        const procPath = path.join(__dirname, "lazerProcess.js");
        this._utilProc = utilityProcess.fork(procPath, [], { stdio: "pipe" });
        this._utilProc.stdout?.on("data", (chunk: Buffer) => {
            process.stdout.write(chunk);
        });
        this._utilProc.stderr?.on("data", (chunk: Buffer) => {
            process.stderr.write(chunk);
        });
        this._utilProc.on("message", (msg: any) => {
            if (msg.notification) {
                this._onNotification?.(msg.notification);
                return;
            }
            const p = this._pending.get(msg.id);
            if (!p) return;
            this._pending.delete(msg.id);
            msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
        });
        this._utilProc.on("exit", (code) => {
            for (const [, p] of this._pending) {
                p.reject(new Error(`Lazer process exited: ${code}`));
            }
            this._pending.clear();
            this._utilProc = null;
            this._initPath = undefined;
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

    is_ready(): boolean {
        return this._initPath !== undefined;
    }

    get_init_path(): string | undefined {
        return this._initPath;
    }

    async init(fpath: string) {
        if (this._initPath === fpath) return;
        await this._send("init", { path: fpath });
        this._initPath = fpath;
        log.debug(`LazerReader init: ${fpath}`);
    }

    async startWatch(onNotification: (type: string) => void) {
        this._onNotification = onNotification;
        await this._send("start_watch", {});
    }

    async get_schemas() {
        return this._send("get_schemas");
    }

    async get_schema_by_name(name: string) {
        return this._send("get_schema_by_name", { name });
    }

    async get_objects(objType: string, limit: number = 10, offset: number = 0) {
        return this._send("get_objects", { objType, limit, offset });
    }

    async get_collections(offset: number = 0, limit: number = 10): Promise<DefaultObjectWithOffset> {
        return this._send<DefaultObjectWithOffset>("get_collections", { offset, limit });
    }

    async get_scores(offset: number = 0, limit: number = 10) {
        return this._send("get_scores", { offset, limit });
    }

    async get_beatmaps(offset: number = 0, limit: number = 10) {
        return this._send("get_beatmaps", { offset, limit });
    }

    async query_beatmaps(spec: object, offset: number = 0, limit: number = 500) {
        return this._send<{ data: any[]; total: number; offset: number; next_offset: number; limit: number }>(
            "query_beatmaps",
            {
                spec,
                offset,
                limit,
            },
        );
    }

    /**
     * Dedicated one-map read: full metadata plus exact circle/slider/spinner
     * counts parsed from the stored `.osu` when it is available. Returns null
     * only when no Realm beatmap matches the request.
     */
    async get_beatmap_detail(request: LazerBeatmapDetailRequest): Promise<LazerBeatmap | null> {
        return this._send<LazerBeatmap | null>("get_beatmap_detail", {
            md5Hash: request.md5Hash,
            beatmapId: request.beatmapId,
        });
    }

    async query_scores_by_hashes(hashes: string[], stableDedupKeys?: string[], returnOsuScore = false) {
        return this._send<{ data: any[]; total: number }>("query_scores_by_hashes", {
            hashes,
            stableDedupKeys,
            returnOsuScore,
        });
    }

    async count_beatmaps(spec: object) {
        return this._send<{ count: number }>("count_beatmaps", { spec });
    }

    async query_scores_by_user(
        userName: string,
        dateFrom?: number,
        dateTo?: number,
        stableDedupKeys?: string[],
        offset: number = 0,
        limit: number = 10,
    ) {
        return this._send<DefaultObjectWithOffset>("query_scores_by_user", {
            userName,
            dateFrom,
            dateTo,
            stableDedupKeys,
            offset,
            limit,
        });
    }

    async query_lazer_users() {
        return this._send<{ data: string[]; total: number }>("query_lazer_users", {});
    }

    async set_collections(collections: IOsuCollection[]) {
        return this._send<{
            created: number;
            updated: number;
            removed: number;
            total: number;
        }>("set_collections", { collections });
    }

    async delete_beatmap_difficulties(hashes: string[]) {
        return this._send<Array<{ hash: string; ok: boolean; mode?: "difficulty" | "set"; reason?: string }>>(
            "delete_beatmap_difficulties",
            { hashes },
        );
    }

    async close() {
        const result = await this._send("close");
        this._initPath = undefined;
        return result;
    }
}
