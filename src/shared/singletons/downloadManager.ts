import { BrowserWindow, dialog, session, shell } from "electron";
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
import {
    build_cache_entry,
    get_browser_headers,
    is_official_osu_host,
    is_private_ip,
    match_task,
    sanitize_filename,
    task_hostname,
    uuid,
} from "./download/downloadUtils";
import { RateLimiter } from "./download/rateLimiter";

const log = createLogger("DownloadManager");

export type DLEventType =
    | "task_updated"
    | "task_removed"
    | "session_expired"
    | "session_ready"
    | "auth_required"
    | "login_result";

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
    private _userApprovedHosts: Set<string> = new Set();
    private _pendingApprovals: Map<string, Promise<boolean>> = new Map();
    private _inFlightEnqueues: Map<string, Promise<DownloadTask>> = new Map();
    private _inFlightRetries: Set<string> = new Set();
    private _cache: Map<string, CachedDownload> = new Map();
    private _pausedTasks: Set<string> = new Set();
    private _partialProgress: Map<string, { chunkOffsets?: number[]; singleOffset?: number }> = new Map();
    private _lastMaxCapacityTime: number = 0;

    private _rateLimiter: RateLimiter;
    private _engine: DownloadEngine;

    constructor() {
        super();
        this._rateLimiter = new RateLimiter(() => ({
            concurrency: this._get_concurrency(),
            pre_min_limit: this._get_pre_min_requests_limit(),
        }));

        const ctx: DownloadEngineContext = {
            get_concurrency: () => this._get_concurrency(),
            get_speed_limit_bps: () => this._get_speed_limit_bps(),
            get_min_chunk_size: () => this._get_min_chunk_size(),
            get_max_chunk_size: () => this._get_max_chunk_size(),
            get_dns_proxy_enabled: () => this._get_dns_proxy_enabled(),
            get_mirror_url: () => this.get_mirror_url(),
            get_save_dir: () => this._get_save_dir(),
            get_osu_session: () => this._get_osu_session(),
            emit_task_updated: (task: DownloadTask) => this._emit_task_updated(task),
        };
        this._engine = new DownloadEngine(this._rateLimiter, ctx);
    }

    private _config(): Config {
        return Config.getInstance;
    }

    async init(): Promise<void> {
        await this._load_cache();
    }

    private _get_save_dir(): string {
        const configured = this._config().get(ConfigKey.DL_SAVE_DIR);
        if (configured && typeof configured === "string") {
            const resolved = path.resolve(configured);
            try {
                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
                    return path.dirname(resolved);
                }
            } catch {
                // fall through to use resolved path as directory
            }
            return resolved;
        }
        return path.join(os.homedir(), "Downloads");
    }

    private _get_workers(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_WORKERS)) || 2);
    }

    private _get_mirror_workers(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_MIRROR_WORKERS)) || 1);
    }

    private _get_speed_limit_bps(): number {
        const mb = Number(this._config().get(ConfigKey.DL_SPEED_LIMIT_MBPS)) || 0;
        return mb > 0 ? Math.round(mb * 1024 * 1024) : 0;
    }

    private _get_concurrency(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_CONCURRENCY)) || 10);
    }

    private _get_pre_min_requests_limit(): number {
        return Math.max(1, Number(this._config().get(ConfigKey.DL_PRE_MIN_REQUESTS_LIMIT)) || 48);
    }

    private _get_delay_ms(): number {
        return Math.max(0, Number(this._config().get(ConfigKey.DL_DELAY_MS)) || 0);
    }

    private _get_min_chunk_size(): number {
        return Math.max(1024, Number(this._config().get(ConfigKey.DL_MIN_CHUNK_SIZE)) || 3145728);
    }

    private _get_max_chunk_size(): number {
        const val = Number(this._config().get(ConfigKey.DL_MAX_CHUNK_SIZE)) || 5242880;
        return Math.max(1024, val);
    }

    get_mirror_url(): string {
        return (this._config().get(ConfigKey.DL_MIRROR_URL) as string) || "";
    }

    private async _get_osu_session(): Promise<string> {
        const cookies = await session.defaultSession.cookies.get({
            url: "https://osu.ppy.sh",
            name: "osu_session",
        });
        return cookies.length > 0 ? cookies[0].value : "";
    }

    private _get_dns_proxy_enabled(): boolean {
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

    private _emit_task_updated(task: DownloadTask): void {
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
        return path.join(this._get_save_dir(), sanitize_filename(filename));
    }

    get_all_tasks(): DownloadTask[] {
        return Array.from(this._tasks.values()).sort((a, b) => b.addedAt - a.addedAt);
    }

    get_active_tasks(): DownloadTask[] {
        return Array.from(this._tasks.values()).filter((t) => t.status === "downloading" || t.status === "queued");
    }

    private async _ensure_host_approved(urlString: string): Promise<boolean> {
        let parsed: URL;
        try {
            parsed = new URL(urlString);
        } catch {
            return false;
        }
        const host = parsed.hostname;
        const protocol = parsed.protocol.toLowerCase();
        if (protocol !== "http:" && protocol !== "https:") return false;
        if (this._userApprovedHosts.has(host)) return true;
        if (protocol === "https:" && is_official_osu_host(host)) return true;

        const pending = this._pendingApprovals.get(host);
        if (pending) return pending;

        const promise = this._show_host_approval_dialog(urlString, host, protocol);
        this._pendingApprovals.set(host, promise);
        try {
            const approved = await promise;
            if (approved) this._userApprovedHosts.add(host);
            return approved;
        } finally {
            this._pendingApprovals.delete(host);
        }
    }

    private async _show_host_approval_dialog(urlString: string, host: string, protocol: string): Promise<boolean> {
        const reasons: string[] = [];
        if (protocol !== "https:") reasons.push("non-HTTPS");
        if (!is_official_osu_host(host)) reasons.push("non-official domain");
        if (is_private_ip(host)) reasons.push("private/local address");
        const reasonText = reasons.length > 0 ? ` (${reasons.join(", ")})` : "";

        const isPrivate = is_private_ip(host);
        const buttons = isPrivate ? ["Block", "Allow Private/Local Host"] : ["Allow", "Block"];
        const allowIndex = isPrivate ? 1 : 0;

        const windows = BrowserWindow.getAllWindows();
        const options = {
            type: "warning" as const,
            buttons,
            defaultId: 0,
            cancelId: 0,
            title: "Untrusted download source",
            message: `Allow download from this source?${reasonText}`,
            detail: urlString,
        };
        const { response } =
            windows.length > 0
                ? await dialog.showMessageBox(windows[0], options)
                : await dialog.showMessageBox(options);
        return response === allowIndex;
    }

    async enqueue(req: EnqueueRequest): Promise<DownloadTask> {
        const key = req.beatmapsetId != null ? String(req.beatmapsetId) : req.url;
        const pending = this._inFlightEnqueues.get(key);
        if (pending) return pending;

        const promise = this._enqueueInternal(req).finally(() => {
            this._inFlightEnqueues.delete(key);
        });
        this._inFlightEnqueues.set(key, promise);
        return promise;
    }

    private async _enqueueInternal(req: EnqueueRequest): Promise<DownloadTask> {
        const saveDir = this._get_save_dir();
        const filename = sanitize_filename(req.filename);
        const savePath = path.join(saveDir, filename);

        const approved = await this._ensure_host_approved(req.url);
        if (!approved) {
            const task: DownloadTask = {
                id: uuid(),
                source: req.source,
                url: req.url,
                filename,
                beatmapsetId: req.beatmapsetId,
                missingSource: req.missingSource,
                savePath,
                status: "error",
                progress: 0,
                speedBps: 0,
                totalBytes: 0,
                receivedBytes: 0,
                error: "Download blocked by user",
                addedAt: Date.now(),
            };
            this._tasks.set(task.id, task);
            this._emit_task_updated(task);
            return task;
        }

        for (const [cachedId, cached] of this._cache) {
            if (match_task(req, cached)) {
                const existingTask = this._tasks.get(cachedId);
                if (existingTask) {
                    return existingTask;
                }
            }
        }

        for (const [, t] of this._tasks) {
            if (match_task(req, t) && ["queued", "downloading", "held"].includes(t.status)) {
                return t;
            }
        }

        const toDelete: string[] = [];
        for (const [id, t] of this._tasks) {
            if (match_task(req, t) && (t.status === "error" || t.status === "cancelled" || t.status === "missing")) {
                toDelete.push(id);
            }
        }
        for (const id of toDelete) {
            this._tasks.delete(id);
            this._cache.delete(id);
        }

        const hostname = task_hostname(req);
        const isBlocked = this._blockedHosts.has(hostname);
        const needsSession = req.source === "osu-official" || is_official_osu_host(hostname);
        const hasSession = (await this._get_osu_session()).length > 0;
        const shouldHold = isBlocked || (needsSession && !hasSession);

        const task: DownloadTask = {
            id: uuid(),
            source: req.source,
            url: req.url,
            filename,
            beatmapsetId: req.beatmapsetId,
            missingSource: req.missingSource,
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
        this._emit_task_updated(task);

        if (shouldHold) {
            this._heldQueue.push(task.id);
            log.info(`Task ${task.id} held (domain blocked or needs login): ${hostname}`);
            this._emit({ type: "auth_required", payload: { hostname } });
        } else if (task.source === "mirror") {
            this._mirrorQueue.push(task.id);
            this._drain_mirror_queue();
        } else {
            this._queue.push(task.id);
            this._drain_queue();
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
            this._cleanup_temp_files(task.savePath);
            this._emit_task_updated(task);
        } else if (task.status === "downloading") {
            task.status = "cancelled";
            this._pausedTasks.delete(id);
            this._partialProgress.delete(id);
            this._emit_task_updated(task);
            const worker = this._activeWorkers.get(id) ?? this._activeMirrorWorkers.get(id);
            worker?.abort.abort();
        } else if (task.status === "held") {
            task.status = "cancelled";
            this._heldQueue = this._heldQueue.filter((q) => q !== id);
            this._emit_task_updated(task);
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
            this._emit_task_updated(task);
        } else if (task.status === "downloading") {
            this._pausedTasks.add(id);
            const worker = this._activeWorkers.get(id) ?? this._activeMirrorWorkers.get(id);
            worker?.abort.abort();
        }
    }

    resume(id: string): void {
        const task = this._tasks.get(id);
        if (task?.status !== "paused") return;
        task.status = "queued";
        task.speedBps = 0;
        task.error = undefined;
        this._pausedTasks.delete(id);
        this._emit_task_updated(task);
        if (task.source === "mirror") {
            this._mirrorQueue.unshift(task.id);
            this._drain_mirror_queue();
        } else {
            this._queue.unshift(task.id);
            this._drain_queue();
        }
    }

    retry(id: string): void {
        if (this._inFlightRetries.has(id)) return;
        const task = this._tasks.get(id);
        if (!task || (task.status !== "error" && task.status !== "cancelled" && task.status !== "missing")) return;

        this._inFlightRetries.add(id);
        // Records left over from the old move-based install may still point into
        // osu! Songs/ (outside the download directory); a re-download must land
        // in the configured download directory.
        const saveDir = this._get_save_dir();
        const savePrefix = path.normalize(saveDir + path.sep).toLowerCase();
        if (!path.resolve(task.savePath).toLowerCase().startsWith(savePrefix)) {
            task.savePath = path.join(saveDir, task.filename);
        }
        (async () => {
            const approved = await this._ensure_host_approved(task.url);
            if (!approved) {
                task.status = "error";
                task.error = "Download blocked by user";
                this._emit_task_updated(task);
                return;
            }

            const hostname = new URL(task.url).hostname;
            const isBlocked = this._blockedHosts.has(hostname);
            const needsSession = task.source === "osu-official" || is_official_osu_host(hostname);
            const hasSession = (await this._get_osu_session()).length > 0;

            if (isBlocked || (needsSession && !hasSession)) {
                task.status = "held";
                task.error = undefined;
                task.finishedAt = undefined;
                this._heldQueue.push(id);
                this._emit_task_updated(task);
                this._emit({ type: "auth_required", payload: { hostname } });
                return;
            }

            task.status = "queued";
            task.progress = 0;
            task.speedBps = 0;
            task.receivedBytes = 0;
            task.error = undefined;
            task.finishedAt = undefined;
            this._cache.delete(id);
            this._save_cache();
            this._emit_task_updated(task);

            if (task.source === "mirror") {
                this._mirrorQueue.push(task.id);
                this._drain_mirror_queue();
            } else {
                this._queue.push(task.id);
                this._drain_queue();
            }
        })()
            .catch((err) => {
                log.error("retry failed", err);
                task.status = "error";
                task.error = err.message;
                this._emit_task_updated(task);
            })
            .finally(() => {
                this._inFlightRetries.delete(id);
            });
    }

    clear_history(statuses?: DLStatus[]): void {
        const targets: DLStatus[] = statuses ?? ["done", "error", "cancelled", "missing"];
        const toDelete: string[] = [];
        for (const [id, task] of this._tasks) {
            if (targets.includes(task.status)) {
                toDelete.push(id);
            }
        }
        for (const id of toDelete) {
            this._tasks.delete(id);
            this._cache.delete(id);
        }
        this._save_cache();
    }

    remove_task(id: string): void {
        this._tasks.delete(id);
        this._cache.delete(id);
        this._save_cache();
        this._emit({ type: "task_removed", task: { id } as DownloadTask });
    }

    verify_missing_files(): number {
        let changed = 0;
        const saveDir = this._get_save_dir();
        const savePrefix = path.normalize(saveDir + path.sep).toLowerCase();
        for (const task of this._tasks.values()) {
            if (task.status !== "done") continue;
            // Legacy records may still point into osu! Songs/ (from the old
            // move-based install). Repoint them at the download directory; if
            // nothing is there, the record falls through to "missing" below.
            if (!path.resolve(task.savePath).toLowerCase().startsWith(savePrefix)) {
                task.savePath = path.join(saveDir, task.filename);
                changed++;
                this._emit_task_updated(task);
            }
            if (fs.existsSync(task.savePath)) continue;
            task.status = "missing";
            task.progress = 0;
            task.speedBps = 0;
            task.totalBytes = 0;
            task.receivedBytes = 0;
            changed++;
            this._emit_task_updated(task);
        }
        if (changed > 0) {
            this._save_cache();
            log.info(`Verified download files: corrected/marked ${changed} record(s)`);
        }
        return changed;
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
        this._save_cache();
        return { success: true };
    }

    reveal_file(filePath: string): { success: boolean; reason?: "outside_save_dir" | "not_found" | "error" } {
        const saveDir = this._get_save_dir();
        const resolvedFile = path.resolve(filePath);
        const prefix = path.normalize(saveDir + path.sep).toLowerCase();
        if (!resolvedFile.toLowerCase().startsWith(prefix)) {
            return { success: false, reason: "outside_save_dir" };
        }
        if (!fs.existsSync(resolvedFile)) {
            return { success: false, reason: "not_found" };
        }
        try {
            shell.showItemInFolder(resolvedFile);
            return { success: true };
        } catch {
            return { success: false, reason: "error" };
        }
    }

    open_save_dir(): void {
        shell.openPath(this._get_save_dir());
    }

    get_rate_status(): Array<{ hostname: string; count: number; limit: number }> {
        return this._rateLimiter.get_rate_status();
    }

    private _drain_pool(
        queue: string[],
        workers: Map<string, ActiveWorker>,
        maxWorkers: number,
        drainFn: () => void,
    ): void {
        const delayMs = this._get_delay_ms();
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
            this._start_worker(task, workers);
        }

        if (workers.size >= maxWorkers && queue.length > 0 && delayMs > 0) {
            this._lastMaxCapacityTime = Date.now();
        }
    }

    private _drain_queue(): void {
        this._drain_pool(this._queue, this._activeWorkers, this._get_workers(), () => this._drain_queue());
    }

    private _drain_mirror_queue(): void {
        this._drain_pool(this._mirrorQueue, this._activeMirrorWorkers, this._get_mirror_workers(), () =>
            this._drain_mirror_queue(),
        );
    }

    private _block_domain_and_hold_tasks(hostname: string): void {
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
                    this._emit_task_updated(t);
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

    private _pause_queued_downloads(reason: string): void {
        let paused = 0;
        const pauseQueue = (queue: string[]) => {
            for (const id of queue) {
                const task = this._tasks.get(id);
                if (!task || task.status !== "queued") continue;
                task.status = "paused";
                task.speedBps = 0;
                this._pausedTasks.add(id);
                this._emit_task_updated(task);
                paused += 1;
            }
            queue.length = 0;
        };
        pauseQueue(this._queue);
        pauseQueue(this._mirrorQueue);
        if (paused > 0) log.warn(`Paused ${paused} queued downloads after ${reason}`);
    }

    private async _release_held_tasks(): Promise<void> {
        if (this._heldQueue.length === 0) return;

        const released: string[] = [];
        const remaining: string[] = [];

        const hasSession = (await this._get_osu_session()).length > 0;

        for (const id of this._heldQueue) {
            const task = this._tasks.get(id);
            if (!task) continue;

            const hostname = new URL(task.url).hostname;
            const isBlocked = this._blockedHosts.has(hostname);
            const needsSession = task.source === "osu-official" || is_official_osu_host(hostname);

            if (!isBlocked && (!needsSession || hasSession)) {
                task.status = "queued";
                task.error = undefined;
                this._emit_task_updated(task);
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
            this._drain_queue();
            this._drain_mirror_queue();
        }
    }

    private _start_worker(task: DownloadTask, pool: Map<string, ActiveWorker>): void {
        const abort = new AbortController();
        pool.set(task.id, { task, abort });
        task.status = "downloading";
        this._emit_task_updated(task);

        this._engine
            .download(task, abort.signal)
            .then(() => {
                task.status = "done";
                task.progress = 100;
                task.finishedAt = Date.now();
                this._cache.set(task.id, build_cache_entry(task, "done", task.finishedAt));
                this._save_cache();
                this._emit_task_updated(task);
            })
            .catch((err: Error) => {
                if (abort.signal.aborted) {
                    if (this._pausedTasks.has(task.id)) {
                        task.status = "paused";
                        this._pausedTasks.delete(task.id);
                        this._record_partial_progress(task);
                    } else {
                        task.status = "cancelled";
                        task.finishedAt = Date.now();
                        this._partialProgress.delete(task.id);
                        this._cleanup_temp_files(task.savePath);
                        this._cache.set(task.id, build_cache_entry(task, "cancelled", task.finishedAt));
                        this._save_cache();
                    }
                } else {
                    task.status = "error";
                    task.error = err.message;
                    task.finishedAt = Date.now();
                    log.warn(`Download failed: ${task.url} :: ${err.message}`);
                    if (/^HTTP 401\b/.test(err.message)) {
                        const hostname = task_hostname(task);
                        this._block_domain_and_hold_tasks(hostname);
                    } else if (/^HTTP 403\b/.test(err.message) || /^CF[_ ]/.test(err.message)) {
                        // 403 is not fixed by logging in again (Cloudflare block or
                        // a permission problem), so pause the queue instead of
                        // letting every remaining task fail one by one.
                        this._pause_queued_downloads(
                            err.message.startsWith("HTTP 403") ? "an HTTP 403 response" : "a Cloudflare challenge",
                        );
                    }
                    this._cleanup_temp_files(task.savePath);
                    this._cache.set(task.id, build_cache_entry(task, "error", task.finishedAt, err.message));
                    this._save_cache();
                }
                if (!task.finishedAt) task.finishedAt = Date.now();
                this._emit_task_updated(task);
            })
            .finally(() => {
                pool.delete(task.id);
                if (pool === this._activeWorkers) this._drain_queue();
                else this._drain_mirror_queue();
            });
    }

    private _record_partial_progress(task: DownloadTask): void {
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

    private _cleanup_temp_files(savePath: string): void {
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

    private async _load_cache(): Promise<void> {
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
                        missingSource: item.missingSource ?? undefined,
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

    private async _save_cache(): Promise<void> {
        try {
            const { saveJsonV2 } = await import("../../utils/file");
            const toSave: CachedDownload[] = [...this._cache.values()];
            await saveJsonV2(ServiceCode.Cache, null, "downloader_cached.json", toSave);
        } catch (e) {
            log.warn("Failed to save download cache:", e);
        }
    }

    close_login_window_for_shutdown(): void {
        const loginWindow = this._loginWindow;
        if (!loginWindow || loginWindow.isDestroyed()) return;
        this._loginWindowReady = false;
        loginWindow.destroy();
    }

    async open_login_window(onDone: (success: boolean) => void): Promise<void> {
        this._loginSuccess = false;
        this._loginOnDone = onDone;

        if (this._loginWindow && !this._loginWindow.isDestroyed()) {
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
                    headers: get_browser_headers(ses.getUserAgent(), { "Sec-Fetch-Site": "same-origin" }),
                    redirect: "follow",
                });
                await (resp.body?.cancel() ?? Promise.resolve()).catch(() => {});
                if (resp.status === 200) {
                    await this._handle_login_success(ses);
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
            await this._handle_login_success(ses);
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

    private async _handle_login_success(ses: Electron.Session): Promise<void> {
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

            await this._release_held_tasks();

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
