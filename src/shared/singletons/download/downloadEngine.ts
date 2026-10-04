import * as dns from "dns";
import { BrowserWindow, session } from "electron";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import { pipeline } from "stream/promises";
import { DownloadTask } from "../../../defines/download_types";
import { createLogger } from "../../../utils/logger";
import {
    apply_filename_from_content_disposition,
    build_request_options,
    classify_download_response,
    DownloadResponseDiagnostics,
    fetch_response_diagnostics,
    get_browser_headers,
    is_official_osu_host,
    is_private_ip,
    node_response_diagnostics,
    read_node_body_snippet,
    read_response_snippet,
    task_hostname,
    validate_download_response,
    wait_for_shared_promise,
} from "./downloadUtils";
import { RateLimiter } from "./rateLimiter";
import { create_progress_tracker, create_speed_limiter } from "./speedLimiter";

const log = createLogger("DownloadEngine");

export interface DownloadEngineContext {
    get_concurrency: () => number;
    get_speed_limit_bps: () => number;
    get_min_chunk_size: () => number;
    get_max_chunk_size: () => number;
    get_dns_proxy_enabled: () => boolean;
    get_mirror_url: () => string;
    get_save_dir: () => string;
    get_osu_session: () => Promise<string>;
    emit_task_updated: (task: DownloadTask) => void;
}

export class DownloadEngine {
    private _dnsCache: { ip: string; expires: number } | null = null;
    private _cfSolvePromise: Promise<void> | null = null;
    private static readonly DNS_CACHE_TTL_MS = 5 * 60 * 1000;

    constructor(
        private _rateLimiter: RateLimiter,
        private _ctx: DownloadEngineContext,
    ) {}

    private _browser_headers(extra?: Record<string, string>): Record<string, string> {
        return get_browser_headers(session.defaultSession.getUserAgent(), extra);
    }

    private async _head_diagnostics(
        url: string,
        status: number,
        contentType: string,
        diagnostics: DownloadResponseDiagnostics,
        signal: AbortSignal,
    ): Promise<DownloadResponseDiagnostics> {
        if (
            status !== 403 ||
            !contentType.toLowerCase().includes("text/html") ||
            !diagnostics.server?.toLowerCase().includes("cloudflare") ||
            diagnostics.cfMitigated?.toLowerCase().includes("challenge")
        ) {
            return diagnostics;
        }
        try {
            const response = await this._sessionFetch(
                url,
                { headers: this._browser_headers({ Range: "bytes=0-0" }), cache: "no-store" },
                AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            );
            const snippet = await read_response_snippet(response);
            const sampled = fetch_response_diagnostics(response, response.url || url, snippet);
            return {
                ...diagnostics,
                bodySnippet: snippet,
                cfMitigated: sampled.cfMitigated ?? diagnostics.cfMitigated,
            };
        } catch (error) {
            if (signal.aborted) throw new Error("aborted");
            log.warn(`CF response sampling failed: ${String(error)}`);
            return diagnostics;
        }
    }

    private _request(
        url: string,
        options: http.RequestOptions,
        callback: (res: http.IncomingMessage) => void,
    ): http.ClientRequest {
        const parsed = new URL(url);
        if (parsed.protocol === "http:") {
            return http.request(options, callback);
        }
        return https.request(options, callback);
    }

    private async _sessionFetch(
        url: string,
        init: { method?: string; headers?: Record<string, string>; cache?: RequestCache },
        signal: AbortSignal,
        maxRedirects = 5,
    ): Promise<Response> {
        let currentUrl = url;
        let method = init.method ?? "GET";
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
            const response = await session.defaultSession.fetch(currentUrl, {
                ...init,
                method,
                redirect: "manual",
                signal,
            });
            const location = response.headers.get("location");
            const isRedirect =
                response.status === 301 ||
                response.status === 302 ||
                response.status === 303 ||
                response.status === 307 ||
                response.status === 308;
            if (!isRedirect) {
                return response;
            }
            if (!location) {
                await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                throw new Error("Redirect without location");
            }
            if (redirectCount === maxRedirects) {
                await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                throw new Error("Too many redirects");
            }
            const nextUrl = new URL(location, currentUrl).href;
            const nextHost = new URL(nextUrl).hostname;
            if (!is_official_osu_host(nextHost)) {
                await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                throw new Error(`Redirect to non-official host: ${nextHost}`);
            }
            if (response.status === 303) {
                method = "GET";
            }
            await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
            currentUrl = nextUrl;
        }
        throw new Error("Too many redirects");
    }

    private _is_unauthorized_page(pageUrl: URL): boolean {
        if (!is_official_osu_host(pageUrl.hostname)) return false;
        const pathname = pageUrl.pathname;
        if (pathname.startsWith("/beatmapsets") && !pathname.includes("/download") && !pathname.includes(".osz")) {
            return true;
        }
        const loginPrefixes = ["/home", "/login", "/session", "/users/sign_in"];
        return loginPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    }

    private _build_node_request_url(task: DownloadTask, isOfficialHost: boolean): string {
        const parsed = new URL(task.url);
        if (isOfficialHost) parsed.protocol = "https:";
        return parsed.href;
    }

    async download(task: DownloadTask, signal: AbortSignal): Promise<void> {
        const speedLimitBps = this._ctx.get_speed_limit_bps();
        const useDnsProxy = this._ctx.get_dns_proxy_enabled();
        log.info(`useDnsProxy: ${useDnsProxy}`);

        const parsedUrl = new URL(task.url);
        const isOfficialHost = is_official_osu_host(parsedUrl.hostname);
        const requestUrl = isOfficialHost ? this._build_node_request_url(task, isOfficialHost) : task.url;

        if (isOfficialHost && useDnsProxy) {
            try {
                await this._download_via_node_https(task, signal, speedLimitBps, true);
            } catch (err) {
                if ((err as Error).message.startsWith("CF_CHALLENGE")) {
                    log.info("CF challenge detected (dns-proxy path), falling back to browser session...");
                    await this._solve_cf_challenge(requestUrl, signal);
                    await this._download_official(
                        () => this._download_via_sess_fetch(task, signal, speedLimitBps, requestUrl),
                        requestUrl,
                        signal,
                    );
                } else {
                    throw err;
                }
            }
            return;
        }

        if (isOfficialHost) {
            await this._download_official(
                () => this._download_via_sess_fetch(task, signal, speedLimitBps, requestUrl),
                requestUrl,
                signal,
            );
            return;
        }

        await this._download_via_node_https(task, signal, speedLimitBps, false);
    }

    private async _download_official(run: () => Promise<void>, requestUrl: string, signal: AbortSignal): Promise<void> {
        try {
            await run();
            return;
        } catch (err) {
            if (!(err as Error).message.startsWith("CF_CHALLENGE")) throw err;
            log.info("CF challenge detected, opening browser window to solve...");
            await this._solve_cf_challenge(requestUrl, signal);
        }
        await run();
    }

    private async _download_via_sess_fetch(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        url: string = task.url,
    ): Promise<void> {
        const tempPath = `${task.savePath}.tmp`;
        const headers = this._browser_headers();
        const hostname = task_hostname({ url });

        await this._rateLimiter.acquire_rate_limit(hostname);

        const headResponse = await this._sessionFetch(url, { headers, method: "HEAD", cache: "no-store" }, signal);

        const contentDisposition = headResponse.headers.get("content-disposition") || "";
        apply_filename_from_content_disposition(
            task,
            contentDisposition,
            () => this._ctx.get_save_dir(),
            (t) => this._ctx.emit_task_updated(t),
        );

        const acceptRanges = headResponse.headers.get("accept-ranges") || "";
        const totalSize = parseInt(headResponse.headers.get("content-length") ?? "0", 10);
        const supportsRanges = acceptRanges.includes("bytes") && totalSize > 0;

        let parsedHeadUrl: URL;
        try {
            parsedHeadUrl = new URL(headResponse.url);
        } catch {
            parsedHeadUrl = new URL(url);
        }
        if (headResponse.status !== 403 && this._is_unauthorized_page(parsedHeadUrl)) {
            await (headResponse.body?.cancel() ?? Promise.resolve()).catch(() => {});
            throw new Error("HTTP 401");
        }

        try {
            validate_download_response(
                headResponse.status,
                headResponse.headers.get("content-type") || "",
                parsedHeadUrl.hostname,
                await this._head_diagnostics(
                    parsedHeadUrl.href,
                    headResponse.status,
                    headResponse.headers.get("content-type") || "",
                    fetch_response_diagnostics(headResponse, parsedHeadUrl.href),
                    signal,
                ),
            );
        } catch (e) {
            await (headResponse.body?.cancel() ?? Promise.resolve()).catch(() => {});
            throw e;
        }

        task.totalBytes = totalSize;

        const concurrency = this._ctx.get_concurrency();
        if (supportsRanges && concurrency > 1) {
            return this._download_chunks(task, signal, speedLimitBps, headers, totalSize, url);
        }

        return this._download_single_stream(task, signal, speedLimitBps, headers, tempPath, url);
    }

    private async _download_chunks(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        totalSize: number,
        url: string = task.url,
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
            onData: (bytes: number) => void;
        }): Promise<void> => {
            const [start, end] = range;
            const resumeFrom = start + alreadyDownloaded;
            const chunkHeaders = { ...headers, Range: `bytes=${resumeFrom}-${end}` };

            const response = await this._sessionFetch(url, { headers: chunkHeaders, cache: "no-store" }, chunkSignal);

            const contentType = response.headers.get("content-type") || "";
            const snippet =
                response.status >= 400 || contentType.includes("text/html")
                    ? await read_response_snippet(response)
                    : "";
            try {
                validate_download_response(
                    response.status,
                    contentType,
                    new URL(url).hostname,
                    fetch_response_diagnostics(response, url, snippet),
                );
            } catch (e) {
                await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                throw e;
            }
            if (response.status !== 206) {
                await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                throw new Error(`Expected 206, got ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const fileStream =
                alreadyDownloaded > 0
                    ? fs.createWriteStream(chunkTempPath, { flags: "a" })
                    : fs.createWriteStream(chunkTempPath);
            const limiter = create_speed_limiter(chunkSpeedLimit);

            await new Promise<void>((resolve, reject) => {
                const abortHandler = () => {
                    reader.cancel().catch(() => {});
                    fileStream.destroy();
                    reject(new Error("aborted"));
                };

                chunkSignal.addEventListener("abort", abortHandler);

                fileStream.on("error", (e) => {
                    chunkSignal.removeEventListener("abort", abortHandler);
                    reader.cancel().catch(() => {});
                    fileStream.destroy();
                    reject(e);
                });

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

                            await this._write(fileStream, Buffer.from(data));
                            onData(data.length);
                        }

                        fileStream.end(() => {
                            reader.releaseLock();
                            chunkSignal.removeEventListener("abort", abortHandler);
                            resolve();
                        });
                    } catch (e) {
                        chunkSignal.removeEventListener("abort", abortHandler);
                        reader.cancel().catch(() => {});
                        fileStream.destroy();
                        reject(e);
                    }
                };

                pump();
            });
        };

        return this._download_chunks_common(task, signal, speedLimitBps, totalSize, chunkFetchFn);
    }

    private async _download_chunks_node_https(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        totalSize: number,
        dnsProxyIp: string,
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
            onData: (bytes: number) => void;
        }): Promise<void> => {
            const [start, end] = range;
            const resumeFrom = start + alreadyDownloaded;
            const chunkHeaders = { ...headers, Range: `bytes=${resumeFrom}-${end}` };

            await new Promise<void>((resolve, reject) => {
                const chunkHost = new URL(finalUrl).hostname;
                const requestHeaders: Record<string, string> = is_official_osu_host(chunkHost)
                    ? chunkHeaders
                    : Object.fromEntries(Object.entries(chunkHeaders).filter(([k]) => k.toLowerCase() !== "cookie"));
                const options = build_request_options(finalUrl, "GET", requestHeaders, dnsProxyIp);

                let currentReq: http.ClientRequest | null = null;
                let currentFileStream: fs.WriteStream | null = null;

                const cleanup = () => {
                    chunkSignal.removeEventListener("abort", abortHandler);
                };
                const abortHandler = () => {
                    currentReq?.destroy();
                    currentFileStream?.destroy();
                    try {
                        fs.unlinkSync(chunkTempPath);
                    } catch {
                        /* ignore */
                    }
                    cleanup();
                    reject(new Error("aborted"));
                };

                chunkSignal.addEventListener("abort", abortHandler);

                currentReq = this._request(finalUrl, options, (res) => {
                    const contentType = String(res.headers["content-type"] ?? "");
                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
                        void (async () => {
                            const snippet = await read_node_body_snippet(res);
                            try {
                                validate_download_response(
                                    res.statusCode ?? null,
                                    contentType,
                                    chunkHost,
                                    node_response_diagnostics(res, finalUrl, snippet),
                                );
                            } catch (e) {
                                cleanup();
                                reject(e as Error);
                            }
                        })();
                        return;
                    }
                    if (res.statusCode !== 206) {
                        res.resume();
                        cleanup();
                        reject(new Error(`Expected 206, got ${res.statusCode}`));
                        return;
                    }

                    currentFileStream =
                        alreadyDownloaded > 0
                            ? fs.createWriteStream(chunkTempPath, { flags: "a" })
                            : fs.createWriteStream(chunkTempPath);
                    const limiter = create_speed_limiter(chunkSpeedLimit);

                    res.on("data", async (chunk: Buffer) => {
                        try {
                            res.pause();
                            if (limiter) {
                                await limiter.throttle(chunk.length);
                                if (chunkSignal.aborted) return;
                            }

                            if (!currentFileStream) throw new Error("Missing file stream");
                            await this._write(currentFileStream, chunk);
                            onData(chunk.length);
                            res.resume();
                        } catch (e) {
                            cleanup();
                            try {
                                fs.unlinkSync(chunkTempPath);
                            } catch {
                                /* ignore */
                            }
                            currentFileStream?.destroy();
                            currentReq?.destroy();
                            reject(e as Error);
                        }
                    });

                    res.on("end", () => {
                        currentFileStream?.end(() => {
                            cleanup();
                            resolve();
                        });
                    });

                    res.on("error", (e) => {
                        cleanup();
                        currentFileStream?.destroy();
                        reject(e);
                    });

                    currentFileStream.on("error", (e) => {
                        cleanup();
                        res.destroy();
                        try {
                            fs.unlinkSync(chunkTempPath);
                        } catch {
                            /* ignore */
                        }
                        reject(e);
                    });
                });

                currentReq.on("error", (e) => {
                    cleanup();
                    try {
                        fs.unlinkSync(chunkTempPath);
                    } catch {
                        /* ignore */
                    }
                    reject(e);
                });

                currentReq.end();
            });
        };

        return this._download_chunks_common(task, signal, speedLimitBps, totalSize, chunkFetchFn);
    }

    private async _download_chunks_common(
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
            onData: (bytes: number) => void;
        }) => Promise<void>,
    ): Promise<void> {
        const concurrency = this._ctx.get_concurrency();
        const hostname = task_hostname(task);
        const chunks = this._calculate_chunks(totalSize);
        const chunkTempPaths = chunks.map((_, i) => `${task.savePath}.part${i}`);

        task.chunkCount = chunks.length;
        task.activeChunkCount = 0;
        this._ctx.emit_task_updated(task);

        const chunkProgress: number[] = chunks.map(() => 0);
        let totalReceived = 0;

        const tracker = create_progress_tracker(task, totalSize, (t) => this._ctx.emit_task_updated(t));

        const chunkSpeedLimit =
            speedLimitBps > 0 ? Math.floor(speedLimitBps / Math.min(chunks.length, concurrency)) : 0;

        const chunkController = new AbortController();
        const onOuterAbort = () => chunkController.abort();
        signal.addEventListener("abort", onOuterAbort, { once: true });

        const downloadChunk = async (chunkIndex: number, [start, end]: [number, number]): Promise<void> => {
            const chunkSignal = chunkController.signal;
            if (chunkSignal.aborted) throw new Error("aborted");

            const expectedChunkSize = end - start + 1;
            let alreadyDownloaded = 0;
            try {
                const stat = fs.statSync(chunkTempPaths[chunkIndex]);
                alreadyDownloaded = Math.min(stat.size, expectedChunkSize);
            } catch {
                /* missing partial chunk file */
            }
            chunkProgress[chunkIndex] = alreadyDownloaded;
            totalReceived += alreadyDownloaded;
            if (alreadyDownloaded >= expectedChunkSize) return;

            await this._rateLimiter.acquire_rate_limit(hostname);
            if (chunkSignal.aborted) throw new Error("aborted");

            await this._rateLimiter.acquire_host_slot(hostname);
            if (chunkSignal.aborted) throw new Error("aborted");

            task.activeChunkCount = (task.activeChunkCount ?? 0) + 1;
            this._ctx.emit_task_updated(task);

            try {
                await chunkFetchFn({
                    range: [start, end],
                    alreadyDownloaded,
                    chunkTempPath: chunkTempPaths[chunkIndex],
                    chunkSpeedLimit,
                    signal: chunkSignal,
                    onData: (bytes) => {
                        chunkProgress[chunkIndex] += bytes;
                        totalReceived += bytes;
                        tracker.onBytes(totalReceived);
                    },
                });
            } finally {
                this._rateLimiter.release_host_slot(hostname);
                task.activeChunkCount = Math.max(0, (task.activeChunkCount ?? 1) - 1);
                this._ctx.emit_task_updated(task);
            }
        };

        try {
            await Promise.all(chunks.map((range, i) => downloadChunk(i, range)));
        } catch (e) {
            chunkController.abort();
            if (!signal.aborted) {
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
        } finally {
            signal.removeEventListener("abort", onOuterAbort);
        }

        const actualTotal = chunkTempPaths.reduce((sum, p) => sum + fs.statSync(p).size, 0);
        if (actualTotal !== totalSize) {
            for (const chunkPath of chunkTempPaths) {
                try {
                    fs.unlinkSync(chunkPath);
                } catch {
                    /* ignore */
                }
            }
            task.chunkCount = undefined;
            task.activeChunkCount = undefined;
            throw new Error(`Size mismatch: expected ${totalSize}, got ${actualTotal}`);
        }

        const finalStream = fs.createWriteStream(task.savePath);
        try {
            for (const chunkPath of chunkTempPaths) {
                await pipeline(fs.createReadStream(chunkPath), finalStream, { end: false });
                fs.unlinkSync(chunkPath);
            }
            finalStream.end();
            await new Promise<void>((resolve, reject) => {
                finalStream.on("finish", resolve);
                finalStream.on("error", reject);
            });
        } catch (e) {
            finalStream.destroy();
            for (const chunkPath of chunkTempPaths) {
                try {
                    fs.unlinkSync(chunkPath);
                } catch {
                    /* ignore */
                }
            }
            task.chunkCount = undefined;
            task.activeChunkCount = undefined;
            throw e;
        }

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
        this._ctx.emit_task_updated(task);
    }

    private async _download_single_stream(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        tempPath: string,
        url: string = task.url,
    ): Promise<void> {
        const hostname = new URL(url).hostname;

        await this._rateLimiter.acquire_rate_limit(hostname);

        const response = await this._sessionFetch(url, { headers, cache: "no-store" }, signal);

        const contentType = response.headers.get("content-type") || "";
        const finalUrl = response.url;

        let parsedFinalUrl: URL;
        try {
            parsedFinalUrl = new URL(finalUrl);
        } catch {
            parsedFinalUrl = new URL(url);
        }
        if (response.status !== 403 && this._is_unauthorized_page(parsedFinalUrl)) {
            await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
            throw new Error("HTTP 401");
        }

        const snippet =
            response.status >= 400 || contentType.includes("text/html") ? await read_response_snippet(response) : "";
        try {
            validate_download_response(
                response.status,
                contentType,
                parsedFinalUrl.hostname,
                fetch_response_diagnostics(response, parsedFinalUrl.href, snippet),
            );
        } catch (e) {
            await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
            throw e;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const fileStream = fs.createWriteStream(tempPath);
        let received = 0;

        const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
        const contentEncoding = (response.headers.get("content-encoding") ?? "").toLowerCase();
        const total = contentLength > 0 && (!contentEncoding || contentEncoding === "identity") ? contentLength : 0;
        task.totalBytes = total;

        const limiter = create_speed_limiter(speedLimitBps);
        const tracker = create_progress_tracker(task, total, (t) => this._ctx.emit_task_updated(t));

        return new Promise((resolve, reject) => {
            const abortHandler = () => {
                reader.cancel().catch(() => {});
                fileStream.destroy();
                reject(new Error("aborted"));
            };

            signal.addEventListener("abort", abortHandler);

            fileStream.on("error", (e) => {
                signal.removeEventListener("abort", abortHandler);
                reader.cancel().catch(() => {});
                try {
                    fs.unlinkSync(tempPath);
                } catch {
                    /* ignore */
                }
                reject(e);
            });

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

                        if (limiter) {
                            await limiter.throttle(chunk.length);
                        }

                        await this._write(fileStream, Buffer.from(chunk));
                        received += chunk.length;
                        tracker.onBytes(received);
                    }

                    if (total > 0 && received !== total) {
                        throw new Error(`Size mismatch: expected ${total}, got ${received}`);
                    }

                    fileStream.end(() => {
                        reader.releaseLock();
                        signal.removeEventListener("abort", abortHandler);
                        try {
                            this._move_temp_to_target(tempPath, task.savePath);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });
                } catch (e) {
                    signal.removeEventListener("abort", abortHandler);
                    reader.cancel().catch(() => {});
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

    private async _download_via_node_https(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        isOfficialHost: boolean,
    ): Promise<void> {
        const parsedUrl = new URL(task.url);
        const requestUrl = this._build_node_request_url(task, isOfficialHost);

        let headers: Record<string, string>;
        let dnsProxyIp: string | undefined;

        if (isOfficialHost) {
            const cookies = await session.defaultSession.cookies.get({ url: requestUrl });
            const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
            headers = this._browser_headers(cookieHeader ? { Cookie: cookieHeader } : {});
            const ip = await this._resolve_speedtest_ip(parsedUrl.hostname);
            if (ip) {
                log.info(`speedtest-dns-proxy: ${parsedUrl.hostname} > ${ip}`);
                dnsProxyIp = ip;
            } else {
                log.error("speedtest-dns-proxy: failed to resolve speed host.");
            }
        } else {
            headers = {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
                Referer: "https://osu.ppy.sh/",
            };
        }

        await this._rateLimiter.acquire_rate_limit(task_hostname(task));

        if (isOfficialHost && dnsProxyIp) {
            const rangeInfo = await this._check_range_support_node_https(requestUrl, headers, dnsProxyIp, signal);
            task.totalBytes = rangeInfo.totalSize;
            apply_filename_from_content_disposition(
                task,
                rangeInfo.contentDisposition,
                () => this._ctx.get_save_dir(),
                (t) => this._ctx.emit_task_updated(t),
            );
            const concurrency = this._ctx.get_concurrency();
            if (rangeInfo.supportsRanges && rangeInfo.totalSize > 0 && concurrency > 1) {
                log.info(`speedtest-dns-proxy: chunked download (${rangeInfo.totalSize} bytes, ${concurrency} chunks)`);
                return this._download_chunks_node_https(
                    task,
                    signal,
                    speedLimitBps,
                    headers,
                    rangeInfo.totalSize,
                    dnsProxyIp,
                    rangeInfo.finalUrl,
                );
            }
        }

        return this._download_single_stream_node_https(task, signal, speedLimitBps, headers, dnsProxyIp, requestUrl);
    }

    private async _check_range_support_node_https(
        url: string,
        headers: Record<string, string>,
        dnsProxyIp: string,
        signal: AbortSignal,
        initialUrl: string = url,
    ): Promise<{ supportsRanges: boolean; totalSize: number; finalUrl: string; contentDisposition: string }> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                reject(new Error("aborted"));
                return;
            }

            let req: http.ClientRequest | null = null;

            const abortHandler = () => {
                req?.destroy();
                reject(new Error("aborted"));
            };
            signal.addEventListener("abort", abortHandler);

            const cleanup = () => {
                signal.removeEventListener("abort", abortHandler);
            };

            let urlHost: string;
            try {
                urlHost = new URL(url).hostname;
            } catch {
                cleanup();
                reject(new Error(`Invalid range-check URL: ${url}`));
                return;
            }

            let initialHost: string;
            try {
                initialHost = new URL(initialUrl).hostname;
            } catch {
                cleanup();
                reject(new Error(`Invalid initial range-check URL: ${initialUrl}`));
                return;
            }

            if (!is_official_osu_host(urlHost) && urlHost !== initialHost) {
                cleanup();
                reject(new Error(`Redirect to unapproved host: ${urlHost}`));
                return;
            }
            if (is_private_ip(urlHost) && urlHost !== initialHost) {
                cleanup();
                reject(new Error(`Private host rejected: ${urlHost}`));
                return;
            }

            const requestHeaders: Record<string, string> = is_official_osu_host(urlHost)
                ? headers
                : Object.fromEntries(
                      Object.entries(headers).filter(([k]) => {
                          const lower = k.toLowerCase();
                          return lower !== "cookie" && lower !== "referer";
                      }),
                  );
            const options = build_request_options(url, "HEAD", requestHeaders, dnsProxyIp);

            req = this._request(url, options, (res) => {
                res.on("error", (e) => {
                    cleanup();
                    reject(e);
                });
                res.on("end", () => {
                    cleanup();
                });
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
                        cleanup();
                        this._check_range_support_node_https(
                            new URL(location, url).href,
                            headers,
                            dnsProxyIp,
                            signal,
                            initialUrl,
                        ).then(resolve, reject);
                    } else {
                        cleanup();
                        reject(new Error("Redirect without location"));
                    }
                    return;
                }
                const contentType = String(res.headers["content-type"] ?? "");
                if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
                    res.resume();
                    void this._head_diagnostics(
                        url,
                        res.statusCode ?? 0,
                        contentType,
                        node_response_diagnostics(res, url),
                        signal,
                    )
                        .then((diagnostics) =>
                            validate_download_response(res.statusCode ?? null, contentType, urlHost, diagnostics),
                        )
                        .catch((error) => {
                            cleanup();
                            reject(error);
                        });
                    return;
                }

                let parsedUrl: URL;
                try {
                    parsedUrl = new URL(url);
                } catch {
                    res.resume();
                    cleanup();
                    reject(new Error(`Invalid final range-check URL: ${url}`));
                    return;
                }
                if (res.statusCode !== 403 && this._is_unauthorized_page(parsedUrl)) {
                    res.resume();
                    cleanup();
                    reject(new Error("HTTP 401"));
                    return;
                }
                try {
                    validate_download_response(
                        res.statusCode ?? null,
                        contentType,
                        urlHost,
                        node_response_diagnostics(res, url),
                    );
                } catch (e) {
                    res.resume();
                    cleanup();
                    reject(e);
                    return;
                }

                const acceptRanges = res.headers["accept-ranges"] || "";
                const totalSize = parseInt(res.headers["content-length"] ?? "0", 10);
                const contentDisposition = res.headers["content-disposition"] || "";
                res.resume();
                cleanup();
                resolve({
                    supportsRanges: acceptRanges.includes("bytes") && totalSize > 0,
                    totalSize,
                    finalUrl: url,
                    contentDisposition,
                });
            });
            req.on("error", (e) => {
                cleanup();
                reject(e);
            });
            req.end();
        });
    }

    private async _download_single_stream_node_https(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        dnsProxyIp: string | undefined,
        initialUrl: string,
    ): Promise<void> {
        const tempPath = `${task.savePath}.tmp`;

        await new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
                reject(new Error("aborted"));
                return;
            }

            let currentReq: http.ClientRequest | null = null;
            let currentFileStream: fs.WriteStream | null = null;
            let received = 0;
            let settled = false;

            const cleanup = () => {
                signal.removeEventListener("abort", abortHandler);
            };

            const abortHandler = () => {
                currentReq?.destroy();
                currentFileStream?.destroy();
                try {
                    fs.unlinkSync(tempPath);
                } catch {
                    /* ignore */
                }
                cleanup();
                reject(new Error("aborted"));
            };

            signal.addEventListener("abort", abortHandler);

            const initialHost = new URL(initialUrl).hostname;

            const makeRequest = (url: string, redirectCount = 0): void => {
                if (signal.aborted) {
                    cleanup();
                    reject(new Error("aborted"));
                    return;
                }
                if (redirectCount > 5) {
                    cleanup();
                    reject(new Error("Too many redirects"));
                    return;
                }

                let urlHost: string;
                try {
                    urlHost = new URL(url).hostname;
                } catch {
                    cleanup();
                    reject(new Error(`Invalid request URL: ${url}`));
                    return;
                }

                if (!is_official_osu_host(urlHost) && urlHost !== initialHost) {
                    cleanup();
                    reject(new Error(`Redirect to unapproved host: ${urlHost}`));
                    return;
                }
                if (is_private_ip(urlHost) && urlHost !== initialHost) {
                    cleanup();
                    reject(new Error(`Private host rejected: ${urlHost}`));
                    return;
                }

                const requestHeaders: Record<string, string> = is_official_osu_host(urlHost)
                    ? headers
                    : Object.fromEntries(
                          Object.entries(headers).filter(([k]) => {
                              const lower = k.toLowerCase();
                              return lower !== "cookie" && lower !== "referer";
                          }),
                      );
                const options = build_request_options(url, "GET", requestHeaders, dnsProxyIp);
                currentReq = this._request(url, options, (res) => {
                    const contentType = String(res.headers["content-type"] ?? "");
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
                            makeRequest(new URL(location, url).href, redirectCount + 1);
                            return;
                        }
                        cleanup();
                        reject(new Error("Redirect without location"));
                        return;
                    }

                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
                        void (async () => {
                            const snippet = await read_node_body_snippet(res);
                            try {
                                validate_download_response(
                                    res.statusCode ?? null,
                                    contentType,
                                    urlHost,
                                    node_response_diagnostics(res, url, snippet),
                                );
                            } catch (e) {
                                cleanup();
                                reject(e as Error);
                            }
                        })();
                        return;
                    }

                    let parsedFinalUrl: URL;
                    try {
                        parsedFinalUrl = new URL(url);
                    } catch {
                        res.resume();
                        cleanup();
                        reject(new Error(`Invalid final URL: ${url}`));
                        return;
                    }
                    if (res.statusCode !== 403 && this._is_unauthorized_page(parsedFinalUrl)) {
                        res.resume();
                        cleanup();
                        reject(new Error("HTTP 401"));
                        return;
                    }
                    try {
                        validate_download_response(
                            res.statusCode ?? null,
                            contentType,
                            urlHost,
                            node_response_diagnostics(res, url),
                        );
                    } catch (e) {
                        res.resume();
                        cleanup();
                        reject(e);
                        return;
                    }
                    const total = parseInt(res.headers["content-length"] ?? "0", 10);
                    task.totalBytes = total;

                    currentFileStream = fs.createWriteStream(tempPath);
                    const limiter = create_speed_limiter(speedLimitBps);
                    const tracker = create_progress_tracker(task, total, (t) => this._ctx.emit_task_updated(t));

                    res.on("data", async (chunk: Buffer) => {
                        try {
                            res.pause();
                            if (limiter) {
                                await limiter.throttle(chunk.length);
                                if (signal.aborted) return;
                            }

                            if (!currentFileStream) throw new Error("Missing file stream");
                            await this._write(currentFileStream, chunk);
                            received += chunk.length;
                            tracker.onBytes(received);
                            res.resume();
                        } catch (e) {
                            cleanup();
                            try {
                                fs.unlinkSync(tempPath);
                            } catch {
                                /* ignore */
                            }
                            currentFileStream?.destroy();
                            currentReq?.destroy();
                            reject(e as Error);
                        }
                    });

                    res.on("end", () => {
                        if (settled) return;
                        if (total > 0 && received !== total) {
                            settled = true;
                            cleanup();
                            currentFileStream?.destroy();
                            try {
                                fs.unlinkSync(tempPath);
                            } catch {
                                /* ignore */
                            }
                            reject(new Error(`Size mismatch: expected ${total}, got ${received}`));
                            return;
                        }
                        currentFileStream?.end(() => {
                            if (settled) return;
                            cleanup();
                            if (signal.aborted) return;
                            try {
                                this._move_temp_to_target(tempPath, task.savePath);
                                settled = true;
                                resolve();
                            } catch (e) {
                                settled = true;
                                reject(e);
                            }
                        });
                    });

                    res.on("aborted", () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        currentFileStream?.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
                        reject(new Error("Download response aborted"));
                    });

                    res.on("error", (e) => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
                        currentFileStream?.destroy();
                        reject(e);
                    });

                    currentFileStream.on("error", (e) => {
                        cleanup();
                        res.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
                        reject(e);
                    });
                });

                currentReq.on("error", (e) => {
                    cleanup();
                    try {
                        fs.unlinkSync(tempPath);
                    } catch {
                        /* ignore */
                    }
                    reject(e);
                });

                currentReq.end();
            };

            makeRequest(initialUrl);
        });
    }

    private async _solve_cf_challenge(url: string, signal: AbortSignal): Promise<void> {
        if (signal.aborted) throw new Error("aborted");
        if (!this._cfSolvePromise) {
            const controller = new AbortController();
            this._cfSolvePromise = this._run_cf_challenge_window(url, controller).finally(() => {
                this._cfSolvePromise = null;
            });
        }
        return wait_for_shared_promise(this._cfSolvePromise, signal);
    }

    private _run_cf_challenge_window(url: string, controller: AbortController): Promise<void> {
        const signal = controller.signal;
        return new Promise((resolve, reject) => {
            const win = new BrowserWindow({
                width: 900,
                height: 700,
                title: "Cloudflare \u9a57\u8b49\u4e2d\u2026",
                webPreferences: {
                    session: session.defaultSession,
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            let settled = false;
            let probeTimer: NodeJS.Timeout | null = null;
            let probing = false;

            const preventWindowDownload = (event: Electron.Event) => event.preventDefault();
            session.defaultSession.on("will-download", preventWindowDownload);

            const timer = setTimeout(() => {
                cleanup(() => reject(new Error("CF challenge timeout")));
            }, 120_000);

            const cleanup = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (probeTimer) clearInterval(probeTimer);
                session.defaultSession.removeListener("will-download", preventWindowDownload);
                signal.removeEventListener("abort", abortHandler);
                controller.abort();
                win.destroy();
                fn();
            };

            const abortHandler = () => {
                cleanup(() => reject(new Error("aborted")));
            };
            signal.addEventListener("abort", abortHandler);

            const probeCleared = async (): Promise<boolean> => {
                if (settled) return false;
                try {
                    const response = await session.defaultSession.fetch(url, {
                        method: "HEAD",
                        headers: this._browser_headers(),
                        redirect: "manual",
                        cache: "no-store",
                        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
                    });
                    const contentType = response.headers.get("content-type") ?? "";
                    const server = response.headers.get("server") ?? "";
                    const mitigated = response.headers.get("cf-mitigated") ?? "";
                    await (response.body?.cancel() ?? Promise.resolve()).catch(() => {});
                    log.info(
                        `CF probe: ${response.status} server=${server || "-"} cf-mitigated=${mitigated || "-"} content-type=${contentType || "-"}`,
                    );
                    const diagnostics = await this._head_diagnostics(
                        url,
                        response.status,
                        contentType,
                        fetch_response_diagnostics(response, url),
                        signal,
                    );
                    return (
                        classify_download_response(response.status, contentType, new URL(url).hostname, diagnostics) !==
                        "challenge"
                    );
                } catch (error) {
                    log.warn(`CF probe failed: ${String(error)}`);
                    return false;
                }
            };

            const startProbing = () => {
                if (settled || probeTimer) return;
                probeTimer = setInterval(async () => {
                    if (settled || probing) return;
                    probing = true;
                    try {
                        if (await probeCleared()) cleanup(() => resolve());
                    } finally {
                        probing = false;
                    }
                }, 2000);
            };

            win.webContents.on("did-finish-load", async () => {
                log.info(`CF window loaded: ${win.webContents.getURL()}`);
                try {
                    const title = await win.webContents.executeJavaScript("document.title");
                    if (typeof title === "string" && title.length > 0) log.info(`CF window title: ${title}`);
                    if (typeof title === "string" && /blocked|attention required/i.test(title)) {
                        cleanup(() => reject(new Error(`CF block page: ${title}`)));
                        return;
                    }
                } catch {
                    /* ignore JS errors */
                }
                startProbing();
            });

            win.on("closed", () => {
                signal.removeEventListener("abort", abortHandler);
                cleanup(() => reject(new Error("CF window closed by user")));
            });

            win.loadURL(url);
        });
    }

    private _resolve_speedtest_ip(_hostname: string): Promise<string | null> {
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
                    if (is_private_ip(ip)) {
                        log.warn(`speedtest-dns-proxy resolved to private IP, discarding: ${ip}`);
                        resolve(null);
                    } else {
                        this._dnsCache = { ip, expires: now + DownloadEngine.DNS_CACHE_TTL_MS };
                        resolve(ip);
                    }
                }
            });
        });
    }

    private _calculate_chunks(totalSize: number): Array<[number, number]> {
        const concurrency = this._ctx.get_concurrency();
        const minChunkSize = this._ctx.get_min_chunk_size();
        const maxChunkSize = this._ctx.get_max_chunk_size();

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

    private _move_temp_to_target(tempPath: string, targetPath: string): void {
        try {
            fs.renameSync(tempPath, targetPath);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "EXDEV") {
                fs.copyFileSync(tempPath, targetPath);
                fs.unlinkSync(tempPath);
            } else {
                throw e;
            }
        }
    }

    private _write(stream: fs.WriteStream, chunk: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };
            const cleanup = () => stream.off("error", onError);
            stream.once("error", onError);
            stream.write(chunk, (err) => {
                if (err) {
                    cleanup();
                    reject(err);
                    return;
                }
                cleanup();
                resolve();
            });
        });
    }
}
