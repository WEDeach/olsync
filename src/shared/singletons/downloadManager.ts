import { BrowserWindow, session, shell } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    AuthRequiredPayload,
    CachedDownload,
    DLStatus,
    DownloadTask,
    EnqueueRequest,
} from "../../defines/download_types";
import { createLogger } from "../../utils/logger";
import { ConfigKey } from "../../utils/typed/config";
import { ServiceCode } from "../../utils/typed/file";
import SingletonBase from "./base";
import Config from "./config";
import { DownloadEngine, DownloadEngineContext } from "./download/downloadEngine";
import { buildCacheEntry, matchTask, sanitizeFilename, taskHostname, uuid } from "./download/downloadUtils";
import { RateLimiter } from "./download/rateLimiter";

const log = createLogger("DownloadManager");

export type DLEventType = "task_updated" | "session_expired" | "session_ready" | "auth_required" | "login_result";

export interface DLEvent {
    type: DLEventType;
    task?: DownloadTask;
    username?: string;
    payload?: AuthRequiredPayload | { success: boolean };
}

export type DLListener = (event: DLEvent) => void;

interface ActiveWorker {
    task: DownloadTask;
    abort: AbortController;
}

export default class DownloadManager extends SingletonBase {
    private _tasks: Map<string, DownloadTask> = new Map();
    private _queue: string[] = [];
    private _mirrorQueue: string[] = [];
    private _heldQueue: string[] = [];
    private _activeWorkers: Map<string, ActiveWorker> = new Map();
    private _activeMirrorWorkers: Map<string, ActiveWorker> = new Map();
    private _listeners: Set<DLListener> = new Set();
    private _loginWindow: BrowserWindow | null = null;
    private _loginSuccess: boolean = false;
    private _loginWindowReady: boolean = false;
    private _loginOnDone: ((success: boolean) => void) | null = null;
    private _blockedHosts: Set<string> = new Set();
    private _cache: Map<string, CachedDownload> = new Map();
    private _pausedTasks: Set<string> = new Set();
    private _partialProgress: Map<string, { chunkOffsets?: number[]; singleOffset?: number }> = new Map();
    private _lastMaxCapacityTime: number = 0;

    private _rateLimiter: RateLimiter;
    private _engine: DownloadEngine;

    constructor() {
        super();
        this._rateLimiter = new RateLimiter(() => ({
            concurrency: this._getConcurrency(),
            pre_min_limit: this._getPreMinRequestsLimit(),
        }));

        const ctx: DownloadEngineContext = {
            get_concurrency: () => this._getConcurrency(),
            get_speed_limit_bps: () => this._getSpeedLimitBps(),
            get_min_chunk_size: () => this._getMinChunkSize(),
            get_max_chunk_size: () => this._getMaxChunkSize(),
            get_dns_proxy_enabled: () => this._getDnsProxyEnabled(),
            get_mirror_url: () => this.get_mirror_url(),
            get_save_dir: () => this._getSaveDir(),
            get_osu_session: () => this._getOsuSession(),
            emit_task_updated: (task: DownloadTask) => this._emitTaskUpdated(task),
        };
        this._engine = new DownloadEngine(this._rateLimiter, ctx);
    }

    private _config(): Config {
        return Config.getInstance as Config;
    }

    async init(): Promise<void> {
        await this._loadCache();
    }

    private _getSaveDir(): string {
        const configured = this._config().get(ConfigKey.DL_SAVE_DIR);
        if (configured && typeof configured === "string") return configured;
        return path.join(os.homedir(), "Downloads");
    }

    private _getWorkers(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_WORKERS)) || 2);
    }

    private _getMirrorWorkers(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_MIRROR_WORKERS)) || 1);
    }

    private _getSpeedLimitBps(): number {
        const mb = Number(this._config().get(ConfigKey.DL_SPEED_LIMIT_MBPS)) || 0;
        return mb > 0 ? Math.round(mb * 1024 * 1024) : 0;
    }

    private _getConcurrency(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_CONCURRENCY)) || 10);
    }

    private _getPreMinRequestsLimit(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_PRE_MIN_REQUESTS_LIMIT)) || 48);
    }

    private _getDelayMs(): number {
        return Math.max(0, Number(this._config().get(ConfigKey.DL_DELAY_MS)) || 0);
    }

    private _getMinChunkSize(): number {
        return Math.max(1024, Number(this._config().get(ConfigKey.DL_MIN_CHUNK_SIZE)) || 3145728);
    }

    private _getMaxChunkSize(): number {
        const val = Number(this._config().get(ConfigKey.DL_MAX_CHUNK_SIZE)) || 5242880;
        return Math.max(1024, val);
    }

    get_mirror_url(): string {
        return (this._config().get(ConfigKey.DL_MIRROR_URL) as string) || "";
    }

    private async _getOsuSession(): Promise<string> {
        const cookies = await session.defaultSession.cookies.get({
            url: "https://osu.ppy.sh",
            name: "osu_session",
        });
        return cookies.length > 0 ? cookies[0].value : "";
    }

    private _getDnsProxyEnabled(): boolean {
        return Boolean(this._config().get(ConfigKey.EXPERIMENT_SPEEDTEST_DNS_PROXY));
    }

    private _emit(event: DLEvent): void {
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch {
                /* ignore */
            }
        }
    }

    private _emitTaskUpdated(task: DownloadTask): void {
        this._emit({ type: "task_updated", task: { ...task } });
    }

    add_listener(listener: DLListener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    find_active_task(url: string): DownloadTask | undefined {
        const active: DLStatus[] = ["queued", "downloading", "held"];
        for (const task of this._tasks.values()) {
            if (task.url === url && active.includes(task.status)) return task;
        }
        return undefined;
    }

    get_expected_save_path(filename: string): string {
        return path.join(this._getSaveDir(), sanitizeFilename(filename));
    }

    get_all_tasks(): DownloadTask[] {
        return Array.from(this._tasks.values()).sort((a, b) => b.addedAt - a.addedAt);
    }

    get_active_tasks(): DownloadTask[] {
        return Array.from(this._tasks.values()).filter((t) => t.status === "downloading" || t.status === "queued");
    }

    enqueue(req: EnqueueRequest): DownloadTask {
        const saveDir = this._getSaveDir();
        const filename = sanitizeFilename(req.filename);
        const savePath = path.join(saveDir, filename);

        for (const [cachedId, cached] of this._cache) {
            if (matchTask(req, cached)) {
                const existingTask = this._tasks.get(cachedId);
                if (existingTask) {
                    return existingTask;
                }
            }
        }

        for (const [, t] of this._tasks) {
            if (matchTask(req, t) && ["queued", "downloading", "held"].includes(t.status)) {
                return t;
            }
        }

        for (const [id, t] of this._tasks) {
            if (
                matchTask(req, t) &&
                (t.status === "error" || t.status === "cancelled" || t.status === "missing")
            ) {
                this._tasks.delete(id);
                this._cache.delete(id);
            }
        }

        const hostname = taskHostname(req);
        const isBlocked = this._blockedHosts.has(hostname);
        const needsSession = req.source === "osu-official" || hostname.includes("ppy.sh");
        const hasSession = !!this._getOsuSession();
        const shouldHold = isBlocked || (needsSession && !hasSession);

        const task: DownloadTask = {
            id: uuid(),
            source: req.source,
            url: req.url,
            filename,
            beatmapsetId: req.beatmapsetId,
            savePath,
            status: shouldHold ? "held" : "queued",
            progress: 0,
            speedBps: 0,
            totalBytes: 0,
            receivedBytes: 0,
            addedAt: Date.now(),
        };

        fs.mkdirSync(saveDir, { recursive: true });
        this._tasks.set(task.id, task);
        this._emitTaskUpdated(task);

        if (shouldHold) {
            this._heldQueue.push(task.id);
            log.info(`Task ${task.id} held (domain blocked or needs login): ${hostname}`);
            this._emit({ type: "auth_required", payload: { hostname } });
        } else if (task.source === "mirror") {
            this._mirrorQueue.push(task.id);
            this._drainMirrorQueue();
        } else {
            this._queue.push(task.id);
            this._drainQueue();
        }

        return task;
    }

    cancel(id: string): void {
        const task = this._tasks.get(id);
        if (!task) return;
        if (task.status === "queued" || task.status === "paused") {
            task.status = "cancelled";
            this._queue = this._queue.filter((q) => q !== id);
            this._mirrorQueue = this._mirrorQueue.filter((q) => q !== id);
            this._pausedTasks.delete(id);
            this._partialProgress.delete(id);
            this._cleanupTempFiles(task.savePath);
            this._emitTaskUpdated(task);
        } else if (task.status === "downloading") {
            task.status = "cancelled";
            this._pausedTasks.delete(id);
            this._partialProgress.delete(id);
            this._emitTaskUpdated(task);
            const worker = this._activeWorkers.get(id) ?? this._activeMirrorWorkers.get(id);
            worker?.abort.abort();
        } else if (task.status === "held") {
            task.status = "cancelled";
            this._heldQueue = this._heldQueue.filter((q) => q !== id);
            this._emitTaskUpdated(task);
        }
    }

    pause(id: string): void {
        const task = this._tasks.get(id);
        if (!task) return;
        if (task.status === "queued") {
            task.status = "paused";
            this._queue = this._queue.filter((q) => q !== id);
            this._mirrorQueue = this._mirrorQueue.filter((q) => q !== id);
            this._pausedTasks.add(id);
            this._emitTaskUpdated(task);
        } else if (task.status === "downloading") {
            this._pausedTasks.add(id);
            const worker = this._activeWorkers.get(id) ?? this._activeMirrorWorkers.get(id);
            worker?.abort.abort();
        }
    }

    resume(id: string): void {
        const task = this._tasks.get(id);
        if (!task || task.status !== "paused") return;
        task.status = "queued";
        task.speedBps = 0;
        task.error = undefined;
        this._pausedTasks.delete(id);
        this._emitTaskUpdated(task);
        if (task.source === "mirror") {
            this._mirrorQueue.unshift(task.id);
            this._drainMirrorQueue();
        } else {
            this._queue.unshift(task.id);
            this._drainQueue();
        }
    }

    retry(id: string): void {
        const task = this._tasks.get(id);
        if (!task || (task.status !== "error" && task.status !== "cancelled" && task.status !== "missing")) return;
        task.status = "queued";
        task.progress = 0;
        task.speedBps = 0;
        task.receivedBytes = 0;
        task.error = undefined;
        task.finishedAt = undefined;
        this._cache.delete(id);
        this._saveCache();
        this._emitTaskUpdated(task);

        if (task.source === "mirror") {
            this._mirrorQueue.push(task.id);
            this._drainMirrorQueue();
        } else {
            this._queue.push(task.id);
            this._drainQueue();
        }
    }

    clear_history(statuses?: DLStatus[]): void {
        const targets: DLStatus[] = statuses ?? ["done", "error", "cancelled", "missing"];
        for (const [id, task] of this._tasks) {
            if (targets.includes(task.status)) {
                this._tasks.delete(id);
                this._cache.delete(id);
            }
        }
        this._saveCache();
    }

    remove_task(id: string): void {
        this._tasks.delete(id);
        this._cache.delete(id);
        this._saveCache();
    }

    delete_file(id: string): { success: boolean } {
        const task = this._tasks.get(id);
        if (!task) return { success: false };
        try {
            if (fs.existsSync(task.savePath)) fs.unlinkSync(task.savePath);
        } catch {
            /* ignore */
        }
        this._tasks.delete(id);
        this._cache.delete(id);
        this._saveCache();
        return { success: true };
    }

    reveal_file(filePath: string): void {
        shell.showItemInFolder(filePath);
    }

    open_save_dir(): void {
        shell.openPath(this._getSaveDir());
    }

    get_rate_status(): Array<{ hostname: string; count: number; limit: number }> {
        return this._rateLimiter.get_rate_status();
    }

    private _drainPool(
        queue: string[],
        workers: Map<string, ActiveWorker>,
        maxWorkers: number,
        drainFn: () => void,
    ): void {
        const delayMs = this._getDelayMs();
        if (this._lastMaxCapacityTime > 0 && delayMs > 0) {
            const waitUntil = this._lastMaxCapacityTime + delayMs;
            const now = Date.now();
            if (now < waitUntil) {
                setTimeout(drainFn, waitUntil - now);
                return;
            }
            this._lastMaxCapacityTime = 0;
        }

        while (workers.size < maxWorkers && queue.length > 0) {
            const id = queue.shift();
            if (!id) continue;
            const task = this._tasks.get(id);
            if (!task || task.status === "cancelled") continue;
            this._startWorker(task, workers);
        }

        if (workers.size >= maxWorkers && queue.length > 0 && delayMs > 0) {
            this._lastMaxCapacityTime = Date.now();
        }
    }

    private _drainQueue(): void {
        this._drainPool(this._queue, this._activeWorkers, this._getWorkers(), () => this._drainQueue());
    }

    private _drainMirrorQueue(): void {
        this._drainPool(this._mirrorQueue, this._activeMirrorWorkers, this._getMirrorWorkers(), () =>
            this._drainMirrorQueue(),
        );
    }

    private _blockDomainAndHoldTasks(hostname: string): void {
        this._blockedHosts.add(hostname);
        log.info(`Domain blocked due to auth failure: ${hostname}`);

        const holdFromQueue = (queue: string[]) => {
            const remaining: string[] = [];
            for (const id of queue) {
                const t = this._tasks.get(id);
                if (!t) continue;
                const urlHost = new URL(t.url).hostname;
                if (urlHost === hostname || urlHost.endsWith(`.${hostname}`)) {
                    t.status = "held";
                    this._heldQueue.push(id);
                    this._emitTaskUpdated(t);
                    log.info(`Task ${id} moved to held (domain blocked): ${hostname}`);
                } else {
                    remaining.push(id);
                }
            }
            queue.length = 0;
            queue.push(...remaining);
        };

        holdFromQueue(this._queue);
        holdFromQueue(this._mirrorQueue);

        this._emit({ type: "auth_required", payload: { hostname } });
    }

    private _releaseHeldTasks(): void {
        if (this._heldQueue.length === 0) return;

        const released: string[] = [];
        const remaining: string[] = [];

        for (const id of this._heldQueue) {
            const task = this._tasks.get(id);
            if (!task) continue;

            const hostname = new URL(task.url).hostname;
            const isBlocked = this._blockedHosts.has(hostname);
            const needsSession = task.source === "osu-official" || hostname.includes("ppy.sh");
            const hasSession = !!this._getOsuSession();

            if (!isBlocked && (!needsSession || hasSession)) {
                task.status = "queued";
                task.error = undefined;
                this._emitTaskUpdated(task);
                released.push(id);
            } else {
                remaining.push(id);
            }
        }

        this._heldQueue = remaining;

        for (const id of released) {
            const task = this._tasks.get(id);
            if (!task) continue;
            if (task.source === "mirror") {
                this._mirrorQueue.push(id);
            } else {
                this._queue.push(id);
            }
        }

        if (released.length > 0) {
            log.info(`Released ${released.length} held tasks after login`);
            this._drainQueue();
            this._drainMirrorQueue();
        }
    }

    private _startWorker(task: DownloadTask, pool: Map<string, ActiveWorker>): void {
        const abort = new AbortController();
        pool.set(task.id, { task, abort });
        task.status = "downloading";
        this._emitTaskUpdated(task);

        this._engine
            .download(task, abort.signal)
            .then(() => {
                task.status = "done";
                task.progress = 100;
                task.finishedAt = Date.now();
                this._cache.set(task.id, buildCacheEntry(task, "done", task.finishedAt));
                this._saveCache();
                this._emitTaskUpdated(task);
            })
            .catch((err: Error) => {
                if (abort.signal.aborted) {
                    if (this._pausedTasks.has(task.id)) {
                        task.status = "paused";
                        this._pausedTasks.delete(task.id);
                        this._recordPartialProgress(task);
                    } else {
                        task.status = "cancelled";
                        task.finishedAt = Date.now();
                        this._partialProgress.delete(task.id);
                        this._cleanupTempFiles(task.savePath);
                        this._cache.set(task.id, buildCacheEntry(task, "cancelled", task.finishedAt));
                        this._saveCache();
                    }
                } else {
                    task.status = "error";
                    task.error = err.message;
                    task.finishedAt = Date.now();
                    if (err.message.includes("401")) {
                        const hostname = taskHostname(task);
                        this._blockDomainAndHoldTasks(hostname);
                    }
                    this._cleanupTempFiles(task.savePath);
                    this._cache.set(task.id, buildCacheEntry(task, "error", task.finishedAt, err.message));
                    this._saveCache();
                }
                if (!task.finishedAt) task.finishedAt = Date.now();
                this._emitTaskUpdated(task);
            })
            .finally(() => {
                pool.delete(task.id);
                if (pool === this._activeWorkers) this._drainQueue();
                else this._drainMirrorQueue();
            });
    }

    private _recordPartialProgress(task: DownloadTask): void {
        try {
            const tmpPath = `${task.savePath}.tmp`;
            if (fs.existsSync(tmpPath)) {
                const size = fs.statSync(tmpPath).size;
                this._partialProgress.set(task.id, { singleOffset: size });
                task.receivedBytes = size;
                return;
            }
            const chunkOffsets: number[] = [];
            let i = 0;
            while (true) {
                const partPath = `${task.savePath}.part${i}`;
                if (fs.existsSync(partPath)) {
                    chunkOffsets.push(fs.statSync(partPath).size);
                    i++;
                } else {
                    break;
                }
            }
            if (chunkOffsets.length > 0) {
                this._partialProgress.set(task.id, { chunkOffsets });
                task.receivedBytes = chunkOffsets.reduce((a, b) => a + b, 0);
            }
        } catch {
            /* ignore */
        }
    }

    private _cleanupTempFiles(savePath: string): void {
        try {
            const tmpPath = `${savePath}.tmp`;
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
            let i = 0;
            while (true) {
                const partPath = `${savePath}.part${i}`;
                if (fs.existsSync(partPath)) {
                    fs.unlinkSync(partPath);
                    i++;
                } else {
                    break;
                }
            }
        } catch {
            /* ignore */
        }
    }

    private async _loadCache(): Promise<void> {
        try {
            const { readJsonV2 } = await import("../../utils/file");
            const data = await readJsonV2<CachedDownload[]>(ServiceCode.Cache, null, "downloader_cached.json");
            if (data && Array.isArray(data)) {
                for (const item of data) {
                    this._cache.set(item.id, item);
                    const exists = fs.existsSync(item.savePath);
                    let status: DownloadTask["status"];
                    if (item.status === "error" || item.status === "cancelled") {
                        status = item.status;
                    } else {
                        status = exists ? "done" : "missing";
                    }
                    const task: DownloadTask = {
                        id: item.id,
                        source: item.source,
                        url: item.url,
                        filename: item.filename,
                        beatmapsetId: item.beatmapsetId ?? undefined,
                        savePath: item.savePath,
                        status,
                        progress: status === "done" ? 100 : 0,
                        speedBps: 0,
                        totalBytes: exists ? fs.statSync(item.savePath).size : 0,
                        receivedBytes: exists ? fs.statSync(item.savePath).size : 0,
                        error: item.error ?? undefined,
                        addedAt: item.downloadedAt,
                        finishedAt: item.finishedAt ?? item.downloadedAt,
                    };
                    this._tasks.set(task.id, task);
                }
                log.info(`Loaded ${data.length} cached downloads`);
            }
        } catch (e) {
            log.warn("Failed to load download cache:", e);
        }
    }

    private async _saveCache(): Promise<void> {
        try {
            const { saveJsonV2 } = await import("../../utils/file");
            const toSave: CachedDownload[] = [...this._cache.values()];
            await saveJsonV2(ServiceCode.Cache, null, "downloader_cached.json", toSave);
        } catch (e) {
            log.warn("Failed to save download cache:", e);
        }
    }

    async open_login_window(onDone: (success: boolean) => void): Promise<void> {
        this._loginSuccess = false;
        this._loginOnDone = onDone;

        if (this._loginWindow && !this._loginWindow.isDestroyed()) {
            const ses = this._loginWindow.webContents.session;
            ses.webRequest.onCompleted({ urls: ["https://osu.ppy.sh/session*"] }, async (details) => {
                if (details.statusCode === 403) return;
                if (this._loginSuccess) return;
                await this._handleLoginSuccess(ses);
            });
            await this._loginWindow.loadURL("https://osu.ppy.sh/home");
            this._loginWindow.show();
            this._loginWindow.focus();
            return;
        }

        this._loginWindow = new BrowserWindow({
            width: 820,
            height: 640,
            title: "Login to osu!",
            show: false,
            webPreferences: {
                nodeIntegration: false,
            },
        });

        const ses = this._loginWindow.webContents.session;

        this._loginWindow.webContents.on("did-finish-load", async () => {
            if (this._loginSuccess) return;
            try {
                const resp = await ses.fetch("https://osu.ppy.sh/notifications", {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
                        "Accept-Encoding": "gzip, deflate, br",
                        Referer: "https://osu.ppy.sh/",
                        "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": "Windows",
                        "Sec-Fetch-Dest": "document",
                        "Sec-Fetch-Mode": "navigate",
                        "Sec-Fetch-Site": "same-origin",
                        "Sec-Fetch-User": "?1",
                        "Upgrade-Insecure-Requests": "1",
                    },
                    redirect: "follow",
                });
                resp.body?.cancel();
                if (resp.status === 200) {
                    await this._handleLoginSuccess(ses);
                } else {
                    log.info(`checked with account edit page: ${resp.status}`);
                }
            } catch {
                /* ignore fetch errors */
            }
        });

        ses.webRequest.onCompleted({ urls: ["https://osu.ppy.sh/session*"] }, async (details) => {
            if (details.statusCode === 403) return;
            if (this._loginSuccess) return;
            await this._handleLoginSuccess(ses);
        });

        await this._loginWindow.loadURL("https://osu.ppy.sh/home");
        this._loginWindow.show();

        this._loginWindow.on("close", (e) => {
            if (this._loginWindowReady) {
                e.preventDefault();
                this._loginWindow?.hide();
            }
        });

        this._loginWindow.on("closed", () => {
            try {
                ses.webRequest.onCompleted(null);
            } catch {
                /* ignore cleanup errors */
            }
            this._loginWindow = null;
            this._loginWindowReady = false;
            if (!this._loginSuccess) {
                const failCb = this._loginOnDone;
                this._loginOnDone = null;
                failCb?.(false);
                this._emit({ type: "login_result", payload: { success: false } });
            }
        });
    }

    private async _handleLoginSuccess(ses: Electron.Session): Promise<void> {
        if (this._loginSuccess) return;

        try {
            const cookies = await ses.cookies.get({ url: "https://osu.ppy.sh", name: "osu_session" });
            if (!cookies.length) {
                log.warn("Login success detected but osu_session cookie not found");
                return;
            }

            log.info("osu_session confirmed in browser session");

            this._loginSuccess = true;
            this._loginWindowReady = true;

            this._blockedHosts.clear();

            this._loginWindow?.hide();

            this._releaseHeldTasks();

            const successCb = this._loginOnDone;
            this._loginOnDone = null;
            successCb?.(true);
            this._emit({ type: "login_result", payload: { success: true } });
            this._emit({ type: "session_ready" });
        } catch (e) {
            log.error("Failed to handle login success:", e);
        }
    }
}
