import * as dns from "dns";
import { BrowserWindow, session, shell } from "electron";
import * as fs from "fs";
import * as https from "https";
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

const log = createLogger("DownloadManager");

function uuid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, "_")
        .split("")
        .map((c) => (c.charCodeAt(0) < 32 ? "_" : c))
        .join("")
        .trim();
}

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
    private _hostSlots: Map<string, { active: number; pending: Array<() => void> }> = new Map();
    private _cache: Map<string, CachedDownload> = new Map();
    private _hostTokenBuckets: Map<
        string,
        { tokens: number; lastRefill: number; queue: Array<() => void>; draining: boolean }
    > = new Map();
    private _lastMaxCapacityTime: number = 0;
    private _pausedTasks: Set<string> = new Set();
    private _partialProgress: Map<string, { chunkOffsets?: number[]; singleOffset?: number }> = new Map();
    private _dnsCache: { ip: string; expires: number } | null = null;
    private static readonly DNS_CACHE_TTL_MS = 5 * 60 * 1000;

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

    private _applyFilenameFromContentDisposition(task: DownloadTask, contentDisposition: string): void {
        const cdMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?(?:"([^"]+)"|([^;\r\n]+))/i);
        const rawFilename = (cdMatch?.[1] ?? cdMatch?.[2] ?? "").trim();
        if (!rawFilename) return;
        try {
            const headerFilename = sanitizeFilename(decodeURIComponent(rawFilename));
            if (headerFilename && headerFilename !== task.filename) {
                const newSavePath = path.join(this._getSaveDir(), headerFilename);
                task.filename = headerFilename;
                task.savePath = newSavePath;
                this._emitTaskUpdated(task);
            }
        } catch {}
    }

    private _getChromeHeaders(extra?: Record<string, string>): Record<string, string> {
        return {
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
            "Sec-Fetch-Site": "same-site",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            ...extra,
        };
    }

    private _createSpeedLimiter(limitBps: number) {
        if (limitBps <= 0) return null;
        const state = { tokens: limitBps, lastRefill: Date.now() };
        return {
            throttle: async (bytes: number): Promise<void> => {
                const now = Date.now();
                const elapsed = (now - state.lastRefill) / 1000;
                state.tokens = Math.min(limitBps, state.tokens + elapsed * limitBps);
                state.lastRefill = now;
                if (state.tokens < bytes) {
                    const waitMs = Math.ceil(((bytes - state.tokens) / limitBps) * 1000);
                    await new Promise((r) => setTimeout(r, waitMs));
                }
                state.tokens -= Math.min(state.tokens, bytes);
            },
        };
    }

    private _createProgressTracker(task: DownloadTask, totalBytes: number, emitIntervalMs = 500) {
        let lastCalc = Date.now();
        let lastBytes = task.receivedBytes;
        return {
            onBytes: (bytes: number): void => {
                task.receivedBytes = bytes;
                task.progress = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
                const now = Date.now();
                if (now - lastCalc >= emitIntervalMs) {
                    const elapsed = (now - lastCalc) / 1000;
                    task.speedBps = Math.round((bytes - lastBytes) / elapsed);
                    lastCalc = now;
                    lastBytes = bytes;
                    this._emitTaskUpdated(task);
                }
            },
        };
    }

    private _validateDownloadResponse(statusCode: number | null, contentType?: string): void {
        if (statusCode === 403) throw new Error("CF_CHALLENGE");
        if (contentType?.includes("text/html") && statusCode !== 200) throw new Error("CF_CHALLENGE");
        if (!statusCode || statusCode >= 400) throw new Error(`HTTP ${statusCode}`);
    }

    private _matchTask(
        a: { url: string; beatmapsetId?: string | number | null },
        b: { url: string; beatmapsetId?: string | number | null },
    ): boolean {
        return (
            a.url === b.url || (a.beatmapsetId != null && b.beatmapsetId != null && a.beatmapsetId === b.beatmapsetId)
        );
    }

    private _buildCacheEntry(
        task: DownloadTask,
        status: CachedDownload["status"],
        finishedAt: number,
        error?: string,
    ): CachedDownload {
        return {
            id: task.id,
            filename: task.filename,
            url: task.url,
            savePath: task.savePath,
            downloadedAt: task.addedAt,
            beatmapsetId: task.beatmapsetId ?? null,
            source: task.source,
            status,
            error: error ?? null,
            finishedAt,
        };
    }

    private _buildHttpsRequestOptions(
        url: string,
        method: string,
        headers: Record<string, string>,
        dnsProxyIp?: string,
        servername?: string,
    ): https.RequestOptions {
        const reqUrl = new URL(url);
        return {
            hostname: dnsProxyIp || reqUrl.hostname,
            port: reqUrl.port || 443,
            path: reqUrl.pathname + reqUrl.search,
            method,
            headers: {
                ...headers,
                ...(dnsProxyIp ? { Host: reqUrl.hostname } : {}),
            },
            ...(servername ? { servername } : {}),
        } as https.RequestOptions;
    }

    private _taskHostname(task: DownloadTask | { url: string }): string {
        return new URL(task.url).hostname;
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

    private _getOrCreateTokenBucket(hostname: string) {
        let bucket = this._hostTokenBuckets.get(hostname);
        if (!bucket) {
            const limit = this._getPreMinRequestsLimit();
            bucket = { tokens: limit, lastRefill: Date.now(), queue: [], draining: false };
            this._hostTokenBuckets.set(hostname, bucket);
        }
        return bucket;
    }

    private _refillTokenBucket(bucket: {
        tokens: number;
        lastRefill: number;
        queue: Array<() => void>;
        draining: boolean;
    }): void {
        const limit = this._getPreMinRequestsLimit();
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        const refillRate = limit / 60000;
        bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
        bucket.lastRefill = now;
    }

    private _drainTokenBucket(
        hostname: string,
        bucket: { tokens: number; lastRefill: number; queue: Array<() => void>; draining: boolean },
    ): void {
        if (bucket.draining) return;
        if (bucket.queue.length === 0) return;

        this._refillTokenBucket(bucket);

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            const resolve = bucket.queue.shift();
            if (!resolve) return;
            resolve();
            // Schedule next drain for when the next token will be ready
            const limit = this._getPreMinRequestsLimit();
            const msPerToken = 60000 / limit;
            bucket.draining = true;
            setTimeout(() => {
                bucket.draining = false;
                this._drainTokenBucket(hostname, bucket);
            }, msPerToken);
        } else {
            // Wait until exactly one token is available
            const limit = this._getPreMinRequestsLimit();
            const msPerToken = 60000 / limit;
            const waitMs = (1 - bucket.tokens) * msPerToken;
            bucket.draining = true;
            setTimeout(() => {
                bucket.draining = false;
                this._drainTokenBucket(hostname, bucket);
            }, waitMs);
        }
    }

    private _acquireRateLimit(hostname: string): Promise<void> {
        const bucket = this._getOrCreateTokenBucket(hostname);
        this._refillTokenBucket(bucket);

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            bucket.queue.push(resolve);
            this._drainTokenBucket(hostname, bucket);
        });
    }

    private _acquireHostSlot(hostname: string): Promise<void> {
        const limit = this._getConcurrency();
        let slot = this._hostSlots.get(hostname);
        if (!slot) {
            slot = { active: 0, pending: [] };
            this._hostSlots.set(hostname, slot);
        }
        const s = slot;
        if (s.active < limit) {
            s.active++;
            return Promise.resolve();
        }
        return new Promise((resolve) => s.pending.push(resolve));
    }

    private _releaseHostSlot(hostname: string): void {
        const slot = this._hostSlots.get(hostname);
        if (!slot) return;
        const next = slot.pending.shift();
        if (next) {
            next();
        } else {
            slot.active = Math.max(0, slot.active - 1);
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
        // Get session directly from browser session, not from saved config
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

        // Check cache and active tasks for duplicates by URL or beatmapsetId
        for (const [cachedId, cached] of this._cache) {
            if (this._matchTask(req, cached)) {
                const existingTask = this._tasks.get(cachedId);
                if (existingTask) {
                    return existingTask;
                }
            }
        }

        // Also check in-flight tasks (queued/downloading/held) that haven't been cached yet
        for (const [, t] of this._tasks) {
            if (this._matchTask(req, t) && ["queued", "downloading", "held"].includes(t.status)) {
                return t;
            }
        }

        // Remove old error/cancelled/missing tasks with same URL or beatmapsetId
        for (const [id, t] of this._tasks) {
            if (
                this._matchTask(req, t) &&
                (t.status === "error" || t.status === "cancelled" || t.status === "missing")
            ) {
                this._tasks.delete(id);
                this._cache.delete(id);
            }
        }

        const hostname = this._taskHostname(req);

        // Check if domain is blocked (needs login)
        const isBlocked = this._blockedHosts.has(hostname);

        // Proactive check: osu-official needs session
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
            // Ignore unlink errors
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
        const limit = this._getPreMinRequestsLimit();
        const result: Array<{ hostname: string; count: number; limit: number }> = [];
        for (const [hostname, bucket] of this._hostTokenBuckets) {
            const used = Math.round(limit - bucket.tokens);
            if (used > 0 || bucket.queue.length > 0) {
                result.push({ hostname, count: Math.max(0, used), limit });
            }
        }
        return result;
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

        // Move all queued tasks from this domain to held
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

        // Re-queue released tasks
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

        this._doDownload(task, abort.signal)
            .then(() => {
                task.status = "done";
                task.progress = 100;
                task.finishedAt = Date.now();
                // Save to cache
                this._cache.set(task.id, this._buildCacheEntry(task, "done", task.finishedAt));
                this._saveCache();
                this._emitTaskUpdated(task);
            })
            .catch((err: Error) => {
                if (abort.signal.aborted) {
                    if (this._pausedTasks.has(task.id)) {
                        task.status = "paused";
                        this._pausedTasks.delete(task.id);
                        // Preserve partial files for resume; record offsets
                        this._recordPartialProgress(task);
                    } else {
                        task.status = "cancelled";
                        task.finishedAt = Date.now();
                        this._partialProgress.delete(task.id);
                        this._cleanupTempFiles(task.savePath);
                        this._cache.set(task.id, this._buildCacheEntry(task, "cancelled", task.finishedAt));
                        this._saveCache();
                    }
                } else {
                    task.status = "error";
                    task.error = err.message;
                    task.finishedAt = Date.now();
                    if (err.message.includes("401")) {
                        const hostname = this._taskHostname(task);
                        this._blockDomainAndHoldTasks(hostname);
                    }
                    // Cleanup temp files on error
                    this._cleanupTempFiles(task.savePath);
                    this._cache.set(task.id, this._buildCacheEntry(task, "error", task.finishedAt, err.message));
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
            // Ignore stat errors
        }
    }

    private _cleanupTempFiles(savePath: string): void {
        try {
            // Clean up .tmp file
            const tmpPath = `${savePath}.tmp`;
            if (fs.existsSync(tmpPath)) {
                fs.unlinkSync(tmpPath);
            }
            // Clean up .part files
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
            // Ignore cleanup errors
        }
    }

    /**
     * Calculate chunk ranges for concurrent download.
     * Ported from Rust logic.
     */
    private _calculateChunks(totalSize: number): Array<[number, number]> {
        const concurrency = this._getConcurrency();
        const minChunkSize = this._getMinChunkSize();
        const maxChunkSize = this._getMaxChunkSize();

        let chunkSize = Math.ceil(totalSize / concurrency);

        if (minChunkSize > 0) {
            if (totalSize <= minChunkSize) {
                return [[0, totalSize - 1]];
            }
            if (chunkSize < minChunkSize) {
                chunkSize = minChunkSize;
            }
        }

        if (maxChunkSize > 0 && chunkSize > maxChunkSize) {
            chunkSize = maxChunkSize;
        }

        const chunks: Array<[number, number]> = [];
        let start = 0;

        while (start < totalSize) {
            const end = Math.min(start + chunkSize, totalSize) - 1;
            chunks.push([start, end]);
            start = end + 1;
        }

        return chunks;
    }

    private async _downloadViaSessFetch(task: DownloadTask, signal: AbortSignal, speedLimitBps: number): Promise<void> {
        const tempPath = `${task.savePath}.tmp`;

        const headers = this._getChromeHeaders();

        const hostname = this._taskHostname(task);

        await this._acquireRateLimit(hostname);

        const headResponse = await session.defaultSession.fetch(task.url, {
            headers,
            method: "HEAD",
            redirect: "follow",
        });

        const contentDisposition = headResponse.headers.get("content-disposition") || "";
        this._applyFilenameFromContentDisposition(task, contentDisposition);

        const acceptRanges = headResponse.headers.get("accept-ranges") || "";
        const totalSize = parseInt(headResponse.headers.get("content-length") ?? "0", 10);
        const supportsRanges = acceptRanges.includes("bytes") && totalSize > 0;

        this._validateDownloadResponse(headResponse.status, headResponse.headers.get("content-type") || "");

        task.totalBytes = totalSize;

        const concurrency = this._getConcurrency();
        if (supportsRanges && concurrency > 1) {
            return this._downloadChunks(task, signal, speedLimitBps, headers, totalSize);
        }

        return this._downloadSingleStream(task, signal, speedLimitBps, headers, tempPath);
    }

    private async _downloadChunks(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        totalSize: number,
    ): Promise<void> {
        const url = task.url;
        const chunkFetchFn = async ({
            range,
            alreadyDownloaded,
            chunkTempPath,
            chunkSpeedLimit,
            signal: chunkSignal,
            onData,
        }: {
            range: [number, number];
            alreadyDownloaded: number;
            chunkTempPath: string;
            chunkSpeedLimit: number;
            signal: AbortSignal;
            onData: (data: Buffer) => void;
        }): Promise<void> => {
            const [start, end] = range;
            const resumeFrom = start + alreadyDownloaded;
            const chunkHeaders = { ...headers, Range: `bytes=${resumeFrom}-${end}` };

            const response = await session.defaultSession.fetch(url, {
                headers: chunkHeaders,
                redirect: "follow",
            });

            if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const fileStream =
                alreadyDownloaded > 0
                    ? fs.createWriteStream(chunkTempPath, { flags: "a" })
                    : fs.createWriteStream(chunkTempPath);
            const limiter = this._createSpeedLimiter(chunkSpeedLimit);

            await new Promise<void>((resolve, reject) => {
                const abortHandler = () => {
                    reader.cancel();
                    fileStream.destroy();
                    reject(new Error("aborted"));
                };

                chunkSignal.addEventListener("abort", abortHandler);

                const pump = async (): Promise<void> => {
                    try {
                        while (true) {
                            if (chunkSignal.aborted) {
                                abortHandler();
                                return;
                            }

                            const { done, value } = await reader.read();
                            if (done) break;

                            const data = value as Uint8Array;

                            if (limiter) {
                                await limiter.throttle(data.length);
                            }

                            fileStream.write(Buffer.from(data));
                            onData(Buffer.from(data));
                        }

                        fileStream.end(() => {
                            chunkSignal.removeEventListener("abort", abortHandler);
                            resolve();
                        });
                    } catch (e) {
                        chunkSignal.removeEventListener("abort", abortHandler);
                        fileStream.destroy();
                        reject(e);
                    }
                };

                pump();
            });
        };

        return this._downloadChunksCommon(task, signal, speedLimitBps, totalSize, chunkFetchFn);
    }

    /**
     * Download file using concurrent chunks with Node.js https (DNS proxy path).
     */
    private async _downloadChunksNodeHttps(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        totalSize: number,
        dnsProxyIp: string,
        servername: string | undefined,
        finalUrl: string,
    ): Promise<void> {
        const chunkFetchFn = async ({
            range,
            alreadyDownloaded,
            chunkTempPath,
            chunkSpeedLimit,
            signal: chunkSignal,
            onData,
        }: {
            range: [number, number];
            alreadyDownloaded: number;
            chunkTempPath: string;
            chunkSpeedLimit: number;
            signal: AbortSignal;
            onData: (data: Buffer) => void;
        }): Promise<void> => {
            const [start, end] = range;
            const resumeFrom = start + alreadyDownloaded;
            const chunkHeaders = { ...headers, Range: `bytes=${resumeFrom}-${end}` };

            await new Promise<void>((resolve, reject) => {
                const options = this._buildHttpsRequestOptions(finalUrl, "GET", chunkHeaders, dnsProxyIp, servername);

                const req = https.request(options, (res) => {
                    this._validateDownloadResponse(res.statusCode ?? null);

                    const fileStream =
                        alreadyDownloaded > 0
                            ? fs.createWriteStream(chunkTempPath, { flags: "a" })
                            : fs.createWriteStream(chunkTempPath);
                    const limiter = this._createSpeedLimiter(chunkSpeedLimit);

                    const abortHandler = () => {
                        req.destroy();
                        fileStream.destroy();
                        reject(new Error("aborted"));
                    };
                    chunkSignal.addEventListener("abort", abortHandler);

                    res.on("data", async (chunk: Buffer) => {
                        if (limiter) {
                            res.pause();
                            await limiter.throttle(chunk.length);
                            if (chunkSignal.aborted) return;
                            res.resume();
                        }

                        fileStream.write(chunk);
                        onData(chunk);
                    });

                    res.on("end", () => {
                        fileStream.end(() => {
                            chunkSignal.removeEventListener("abort", abortHandler);
                            resolve();
                        });
                    });

                    res.on("error", (e) => {
                        chunkSignal.removeEventListener("abort", abortHandler);
                        fileStream.destroy();
                        reject(e);
                    });

                    fileStream.on("error", (e) => {
                        chunkSignal.removeEventListener("abort", abortHandler);
                        res.destroy();
                        reject(e);
                    });
                });

                req.on("error", (e) => reject(e));
                req.end();
            });
        };

        return this._downloadChunksCommon(task, signal, speedLimitBps, totalSize, chunkFetchFn);
    }

    /**
     * Shared chunk download orchestration.
     */
    private async _downloadChunksCommon(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        totalSize: number,
        chunkFetchFn: (params: {
            range: [number, number];
            alreadyDownloaded: number;
            chunkTempPath: string;
            chunkSpeedLimit: number;
            signal: AbortSignal;
            onData: (data: Buffer) => void;
        }) => Promise<void>,
    ): Promise<void> {
        const concurrency = this._getConcurrency();
        const hostname = this._taskHostname(task);
        const chunks = this._calculateChunks(totalSize);
        const chunkTempPaths = chunks.map((_, i) => `${task.savePath}.part${i}`);

        const savedPartial = this._partialProgress.get(task.id);
        const savedChunkOffsets = savedPartial?.chunkOffsets;
        this._partialProgress.delete(task.id);

        task.chunkCount = chunks.length;
        task.activeChunkCount = 0;
        this._emitTaskUpdated(task);

        const chunkProgress: number[] = chunks.map((_, i) =>
            savedChunkOffsets && i < savedChunkOffsets.length ? savedChunkOffsets[i] : 0,
        );
        let totalReceived = chunkProgress.reduce((a, b) => a + b, 0);

        const tracker = this._createProgressTracker(task, totalSize);

        const chunkSpeedLimit =
            speedLimitBps > 0 ? Math.floor(speedLimitBps / Math.min(chunks.length, concurrency)) : 0;

        const downloadChunk = async (chunkIndex: number, [start, end]: [number, number]): Promise<void> => {
            if (signal.aborted) throw new Error("aborted");

            const alreadyDownloaded = savedChunkOffsets?.[chunkIndex] ?? 0;
            const expectedChunkSize = end - start + 1;
            if (alreadyDownloaded >= expectedChunkSize) return;

            await this._acquireRateLimit(hostname);
            if (signal.aborted) throw new Error("aborted");

            await this._acquireHostSlot(hostname);
            if (signal.aborted) throw new Error("aborted");

            task.activeChunkCount = (task.activeChunkCount ?? 0) + 1;
            this._emitTaskUpdated(task);

            try {
                await chunkFetchFn({
                    range: [start, end],
                    alreadyDownloaded,
                    chunkTempPath: chunkTempPaths[chunkIndex],
                    chunkSpeedLimit,
                    signal,
                    onData: (data: Buffer) => {
                        chunkProgress[chunkIndex] += data.length;
                        totalReceived += data.length;
                        tracker.onBytes(totalReceived);
                    },
                });
            } finally {
                this._releaseHostSlot(hostname);
                task.activeChunkCount = Math.max(0, (task.activeChunkCount ?? 1) - 1);
                this._emitTaskUpdated(task);
            }
        };

        try {
            await Promise.all(chunks.map((range, i) => downloadChunk(i, range)));

            const finalStream = fs.createWriteStream(task.savePath);
            for (const chunkPath of chunkTempPaths) {
                const chunkData = fs.readFileSync(chunkPath);
                finalStream.write(chunkData);
                fs.unlinkSync(chunkPath);
            }
            await new Promise<void>((resolve, reject) => {
                finalStream.end((err?: Error | null) => (err ? reject(err) : resolve()));
            });

            if (totalReceived !== totalSize) {
                try {
                    fs.unlinkSync(task.savePath);
                } catch {
                    /* ignore */
                }
                throw new Error(`Size mismatch: expected ${totalSize}, got ${totalReceived}`);
            }

            task.progress = 100;
            task.chunkCount = undefined;
            task.activeChunkCount = undefined;
            this._emitTaskUpdated(task);
        } catch (e) {
            if (!signal.aborted || !this._pausedTasks.has(task.id)) {
                for (const chunkPath of chunkTempPaths) {
                    try {
                        fs.unlinkSync(chunkPath);
                    } catch {
                        /* ignore */
                    }
                }
            }
            task.chunkCount = undefined;
            task.activeChunkCount = undefined;
            throw e;
        }
    }

    /**
     * Single-stream download fallback.
     */
    private async _downloadSingleStream(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        tempPath: string,
    ): Promise<void> {
        const hostname = new URL(task.url).hostname;

        // Check for a partial .tmp file from a previous paused download
        const savedPartial = this._partialProgress.get(task.id);
        const resumeOffset = savedPartial?.singleOffset ?? 0;
        this._partialProgress.delete(task.id);

        const fetchHeaders: Record<string, string> = { ...headers };
        if (resumeOffset > 0) {
            fetchHeaders.Range = `bytes=${resumeOffset}-`;
        }

        // Apply rate limit before download
        await this._acquireRateLimit(hostname);

        const response = await session.defaultSession.fetch(task.url, {
            headers: fetchHeaders,
            redirect: "follow",
        });

        // Check for CF challenge or auth failure
        const contentType = response.headers.get("content-type") || "";
        const finalUrl = response.url;

        if (response.status === 403) {
            response.body?.cancel();
            throw new Error("CF_CHALLENGE");
        }

        if (contentType.includes("text/html") && response.status !== 200) {
            response.body?.cancel();
            throw new Error("CF_CHALLENGE");
        }

        // Auth failure: redirected to beatmapset page without /download
        if (
            finalUrl.includes("osu.ppy.sh/beatmapsets") &&
            !finalUrl.includes("/download") &&
            !finalUrl.includes("osz")
        ) {
            response.body?.cancel();
            throw new Error("HTTP 401");
        }

        if (!response.ok) {
            response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
        }

        // Stream to file with speed limiting
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        // Append to existing partial file if resuming
        const fileStream =
            resumeOffset > 0 ? fs.createWriteStream(tempPath, { flags: "a" }) : fs.createWriteStream(tempPath);
        let received = resumeOffset;
        let lastSpeedCalc = Date.now();
        let lastSpeedBytes = resumeOffset;

        const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
        const total = contentLength > 0 ? contentLength + resumeOffset : 0;
        task.totalBytes = total;

        const tokenBucket = speedLimitBps > 0 ? { tokens: speedLimitBps, lastRefill: Date.now() } : null;

        return new Promise((resolve, reject) => {
            const abortHandler = () => {
                reader.cancel();
                fileStream.destroy();
                reject(new Error("aborted"));
            };

            signal.addEventListener("abort", abortHandler);

            const pump = async (): Promise<void> => {
                try {
                    while (true) {
                        if (signal.aborted) {
                            abortHandler();
                            return;
                        }

                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = value as Uint8Array;

                        // Speed limiting
                        if (tokenBucket) {
                            const now = Date.now();
                            const elapsed = (now - tokenBucket.lastRefill) / 1000;
                            tokenBucket.tokens = Math.min(speedLimitBps, tokenBucket.tokens + elapsed * speedLimitBps);
                            tokenBucket.lastRefill = now;

                            if (tokenBucket.tokens < chunk.length) {
                                const waitMs = Math.ceil(((chunk.length - tokenBucket.tokens) / speedLimitBps) * 1000);
                                await new Promise((r) => setTimeout(r, waitMs));
                            }
                            tokenBucket.tokens -= Math.min(tokenBucket.tokens, chunk.length);
                        }

                        fileStream.write(Buffer.from(chunk));
                        received += chunk.length;
                        task.receivedBytes = received;
                        task.progress = total > 0 ? Math.round((received / total) * 100) : 0;

                        const now = Date.now();
                        if (now - lastSpeedCalc >= 500) {
                            const elapsed = (now - lastSpeedCalc) / 1000;
                            task.speedBps = Math.round((received - lastSpeedBytes) / elapsed);
                            lastSpeedCalc = now;
                            lastSpeedBytes = received;
                            this._emitTaskUpdated(task);
                        }
                    }

                    fileStream.end(() => {
                        signal.removeEventListener("abort", abortHandler);
                        try {
                            fs.renameSync(tempPath, task.savePath);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });
                } catch (e) {
                    signal.removeEventListener("abort", abortHandler);
                    fileStream.destroy();
                    try {
                        fs.unlinkSync(tempPath);
                    } catch {
                        /* ignore */
                    }
                    reject(e);
                }
            };

            pump();
        });
    }

    /**
     * Phase 2: Show a visible BrowserWindow to solve CF challenge.
     * The browser's real Chromium engine will pass CF automatically.
     */
    private async _solveCFChallenge(url: string, signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            const win = new BrowserWindow({
                width: 900,
                height: 700,
                title: "Cloudflare 驗證中…",
                webPreferences: {
                    session: session.defaultSession,
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            let resolved = false;

            const cleanup = (fn: () => void) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                win.destroy();
                fn();
            };

            // Timeout after 2 minutes (manual captcha may take time)
            const timer = setTimeout(() => {
                cleanup(() => reject(new Error("CF challenge timeout")));
            }, 120_000);

            // Listen for abort
            const abortHandler = () => {
                cleanup(() => reject(new Error("aborted")));
            };
            signal.addEventListener("abort", abortHandler);

            // Detect CF resolved: navigation to download URL or non-CF page
            win.webContents.on("did-navigate", async (_event, navUrl) => {
                // If we navigated to a mirror download URL (bm*.ppy.sh), CF is solved
                if (navUrl.includes("ppy.sh") && (navUrl.includes("/d/") || navUrl.includes(".osz"))) {
                    // Give cookies a moment to persist
                    await new Promise((r) => setTimeout(r, 500));
                    cleanup(() => resolve());
                }
            });

            // Alternative: check if page loads without CF markers
            win.webContents.on("did-finish-load", async () => {
                const url = win.webContents.getURL();
                // If we're still on osu.ppy.sh after load, check if it's the challenge page
                if (url.includes("osu.ppy.sh")) {
                    // Try to detect CF challenge iframe or page
                    try {
                        const hasChallenge = await win.webContents.executeJavaScript(`
                            document.querySelector('iframe[src*="challenges"]') !== null ||
                            document.querySelector('#cf-turnstile') !== null ||
                            document.title.includes('Just a moment')
                        `);
                        if (!hasChallenge) {
                            // No challenge detected, likely resolved
                            await new Promise((r) => setTimeout(r, 500));
                            cleanup(() => resolve());
                        }
                    } catch {
                        /* ignore JS errors */
                    }
                }
            });

            win.on("closed", () => {
                signal.removeEventListener("abort", abortHandler);
                cleanup(() => reject(new Error("CF window closed by user")));
            });

            win.loadURL(url);
        });
    }

    private _resolveSpeedtestIp(_hostname: string): Promise<string | null> {
        const now = Date.now();
        if (this._dnsCache && this._dnsCache.expires > now) {
            return Promise.resolve(this._dnsCache.ip);
        }
        return new Promise((resolve) => {
            dns.resolve4("www.speedtest.net.cdn.cloudflare.net", (err, addresses) => {
                if (err || !addresses?.length) {
                    log.warn(`speedtest-dns-proxy resolve failed: ${err?.message}`);
                    resolve(null);
                } else {
                    const ip = addresses[0];
                    this._dnsCache = { ip, expires: now + DownloadManager.DNS_CACHE_TTL_MS };
                    resolve(ip);
                }
            });
        });
    }

    private async _doDownload(task: DownloadTask, signal: AbortSignal): Promise<void> {
        const speedLimitBps = this._getSpeedLimitBps();
        const useDnsProxy = this._getDnsProxyEnabled();
        log.info(`useDnsProxy: ${useDnsProxy}`);

        const parsedUrl = new URL(task.url);
        const isPpyShDomain = parsedUrl.hostname.includes("ppy.sh");

        if (isPpyShDomain && useDnsProxy) {
            try {
                await this._downloadViaNodeHttps(task, signal, speedLimitBps, true);
            } catch (err) {
                if ((err as Error).message === "CF_CHALLENGE") {
                    log.info("CF challenge detected (dns-proxy path), falling back to browser session...");
                    await this._solveCFChallenge(task.url, signal);
                    await this._downloadViaSessFetch(task, signal, speedLimitBps);
                } else {
                    throw err;
                }
            }
            return;
        }

        if (isPpyShDomain) {
            try {
                await this._downloadViaSessFetch(task, signal, speedLimitBps);
            } catch (err) {
                if ((err as Error).message === "CF_CHALLENGE") {
                    log.info("CF challenge detected, opening browser window to solve...");
                    await this._solveCFChallenge(task.url, signal);
                    await this._downloadViaSessFetch(task, signal, speedLimitBps);
                } else {
                    throw err;
                }
            }
            return;
        }

        await this._downloadViaNodeHttps(task, signal, speedLimitBps, false);
    }

    private async _downloadViaNodeHttps(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        isPpySh: boolean,
    ): Promise<void> {
        const parsedUrl = new URL(task.url);

        let headers: Record<string, string>;
        let dnsProxyIp: string | undefined;
        let servername: string | undefined;

        if (isPpySh) {
            const cookies = await session.defaultSession.cookies.get({ url: task.url });
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
            headers = this._getChromeHeaders({ ...(cookieHeader ? { Cookie: cookieHeader } : {}) });
            const ip = await this._resolveSpeedtestIp(parsedUrl.hostname);
            if (ip) {
                log.info(`speedtest-dns-proxy: ${parsedUrl.hostname} > ${ip}`);
                dnsProxyIp = ip;
                servername = parsedUrl.hostname;
            } else {
                log.error(`speedtest-dns-proxy: failed to resolve speed host.`);
            }
        } else {
            headers = {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                Referer: "https://osu.ppy.sh/",
            };
        }

        await this._acquireRateLimit(this._taskHostname(task));

        if (isPpySh && dnsProxyIp) {
            const rangeInfo = await this._checkRangeSupportNodeHttps(task.url, headers, dnsProxyIp, servername, signal);
            task.totalBytes = rangeInfo.totalSize;
            this._applyFilenameFromContentDisposition(task, rangeInfo.contentDisposition);
            const concurrency = this._getConcurrency();
            if (rangeInfo.supportsRanges && rangeInfo.totalSize > 0 && concurrency > 1) {
                log.info(`speedtest-dns-proxy: chunked download (${rangeInfo.totalSize} bytes, ${concurrency} chunks)`);
                return this._downloadChunksNodeHttps(
                    task,
                    signal,
                    speedLimitBps,
                    headers,
                    rangeInfo.totalSize,
                    dnsProxyIp,
                    servername,
                    rangeInfo.finalUrl,
                );
            }
        }

        return this._downloadSingleStreamNodeHttps(task, signal, speedLimitBps, headers, dnsProxyIp, servername);
    }

    private async _checkRangeSupportNodeHttps(
        url: string,
        headers: Record<string, string>,
        dnsProxyIp: string,
        servername: string | undefined,
        signal: AbortSignal,
    ): Promise<{ supportsRanges: boolean; totalSize: number; finalUrl: string; contentDisposition: string }> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                reject(new Error("aborted"));
                return;
            }
            const options = this._buildHttpsRequestOptions(url, "HEAD", headers, dnsProxyIp, servername);
            const req = https.request(options, (res) => {
                if (
                    res.statusCode &&
                    (res.statusCode === 301 ||
                        res.statusCode === 302 ||
                        res.statusCode === 303 ||
                        res.statusCode === 307 ||
                        res.statusCode === 308)
                ) {
                    const location = res.headers.location;
                    res.resume();
                    if (location) {
                        this._checkRangeSupportNodeHttps(location, headers, dnsProxyIp, servername, signal).then(
                            resolve,
                            reject,
                        );
                    } else {
                        reject(new Error("Redirect without location"));
                    }
                    return;
                }
                this._validateDownloadResponse(res.statusCode ?? null);
                const acceptRanges = res.headers["accept-ranges"] || "";
                const totalSize = parseInt(res.headers["content-length"] ?? "0", 10);
                const contentDisposition = res.headers["content-disposition"] || "";
                res.resume();
                resolve({
                    supportsRanges: acceptRanges.includes("bytes") && totalSize > 0,
                    totalSize,
                    finalUrl: url,
                    contentDisposition,
                });
            });
            req.on("error", (e) => reject(e));
            signal.addEventListener("abort", () => {
                req.destroy();
                reject(new Error("aborted"));
            });
            req.end();
        });
    }

    private async _downloadSingleStreamNodeHttps(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        dnsProxyIp: string | undefined,
        servername: string | undefined,
    ): Promise<void> {
        const tempPath = `${task.savePath}.tmp`;

        await new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
                reject(new Error("aborted"));
                return;
            }

            const makeRequest = (url: string, redirectCount = 0): void => {
                if (redirectCount > 5) {
                    reject(new Error("Too many redirects"));
                    return;
                }
                const options = this._buildHttpsRequestOptions(url, "GET", headers, dnsProxyIp, servername);
                const req = https.request(options, (res) => {
                    if (
                        res.statusCode === 301 ||
                        res.statusCode === 302 ||
                        res.statusCode === 303 ||
                        res.statusCode === 307 ||
                        res.statusCode === 308
                    ) {
                        const location = res.headers.location;
                        res.resume();
                        if (location) {
                            makeRequest(location, redirectCount + 1);
                            return;
                        }
                        reject(new Error("Redirect without location"));
                        return;
                    }
                    if (res.statusCode === 401 || res.statusCode === 403) {
                        res.resume();
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    this._validateDownloadResponse(res.statusCode ?? null);

                    const total = parseInt(res.headers["content-length"] ?? "0", 10);
                    task.totalBytes = total;

                    const fileStream = fs.createWriteStream(tempPath);
                    const limiter = this._createSpeedLimiter(speedLimitBps);
                    const tracker = this._createProgressTracker(task, total);

                    signal.addEventListener("abort", () => {
                        req.destroy();
                        fileStream.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {}
                        reject(new Error("aborted"));
                    });

                    res.on("data", async (chunk: Buffer) => {
                        tracker.onBytes(task.receivedBytes + chunk.length);

                        if (limiter) {
                            res.pause();
                            await limiter.throttle(chunk.length);
                            if (signal.aborted) return;
                            res.resume();
                        }

                        fileStream.write(chunk);
                    });

                    res.on("end", () => {
                        fileStream.end(() => {
                            if (signal.aborted) return;
                            try {
                                fs.renameSync(tempPath, task.savePath);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });

                    res.on("error", (e) => {
                        fileStream.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
                        reject(e);
                    });

                    fileStream.on("error", (e) => {
                        res.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
                        reject(e);
                    });
                });

                req.on("error", (e) => {
                    try {
                        fs.unlinkSync(tempPath);
                    } catch {
                        /* ignore */
                    }
                    reject(e);
                });

                req.end();
            };

            makeRequest(task.url);
        });
    }

    async open_login_window(onDone: (success: boolean) => void): Promise<void> {
        this._loginSuccess = false;
        this._loginOnDone = onDone;

        // Reuse the existing window (hidden) to preserve TLS session and cf_clearance cookie
        if (this._loginWindow && !this._loginWindow.isDestroyed()) {
            const ses = this._loginWindow.webContents.session;
            // Re-register POST /session detector so new login attempt is detected
            // (handler was removed after previous successful login)
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

        // Use default session (no partition) - shares cf_clearance with beatmap popup windows
        this._loginWindow = new BrowserWindow({
            width: 820,
            height: 640,
            title: "Login to osu!",
            show: false,
            webPreferences: {
                nodeIntegration: false,
                // Use default contextIsolation: true (no preload) to match beatmap popup behavior
            },
        });

        const ses = this._loginWindow.webContents.session;

        // Detect already-logged-in state after page finishes loading
        // (no POST /session fires when already logged in)
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

        // Detect login form submission via POST /session (handles new login attempts)
        ses.webRequest.onCompleted({ urls: ["https://osu.ppy.sh/session*"] }, async (details) => {
            if (details.statusCode === 403) return;
            if (this._loginSuccess) return;
            await this._handleLoginSuccess(ses);
        });

        await this._loginWindow.loadURL("https://osu.ppy.sh/home");
        this._loginWindow.show();

        this._loginWindow.on("close", (e) => {
            // If user closes window without logging in, hide it instead of destroying
            // so TLS session survives for next attempt
            if (this._loginWindowReady) {
                e.preventDefault();
                this._loginWindow?.hide();
            }
        });

        this._loginWindow.on("closed", () => {
            // Cleanup: remove webRequest handler to prevent leaks
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
        if (this._loginSuccess) return; // Dedup guard: prevent double-trigger

        try {
            const cookies = await ses.cookies.get({ url: "https://osu.ppy.sh", name: "osu_session" });
            if (!cookies.length) {
                log.warn("Login success detected but osu_session cookie not found");
                return;
            }

            // Note: We no longer save the cookie to config. The session is maintained
            // by the Electron session itself, and we access cookies directly via
            // session.defaultSession.cookies.get() when needed.
            log.info("osu_session confirmed in browser session");

            this._loginSuccess = true;
            this._loginWindowReady = true;

            // Clear blocked hosts for ppy.sh domains
            this._blockedHosts.clear();

            // Hide instead of close to preserve TLS session + cf_clearance for next login
            this._loginWindow?.hide();

            // Release held tasks and resume downloads
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
