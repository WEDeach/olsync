import * as dns from "dns";
import { BrowserWindow, session } from "electron";
import * as fs from "fs";
import * as https from "https";
import { DownloadTask } from "../../../defines/download_types";
import { createLogger } from "../../../utils/logger";
import {
    applyFilenameFromContentDisposition,
    buildHttpsRequestOptions,
    getChromeHeaders,
    taskHostname,
    validateDownloadResponse,
} from "./downloadUtils";
import { RateLimiter } from "./rateLimiter";
import { createProgressTracker, createSpeedLimiter } from "./speedLimiter";

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
    private static readonly DNS_CACHE_TTL_MS = 5 * 60 * 1000;

    constructor(
        private _rateLimiter: RateLimiter,
        private _ctx: DownloadEngineContext,
    ) {}

    async download(task: DownloadTask, signal: AbortSignal): Promise<void> {
        const speedLimitBps = this._ctx.get_speed_limit_bps();
        const useDnsProxy = this._ctx.get_dns_proxy_enabled();
        log.info(`useDnsProxy: ${useDnsProxy}`);

        const parsedUrl = new URL(task.url);
        const isPpyShDomain = parsedUrl.hostname.includes("ppy.sh");

        if (isPpyShDomain && useDnsProxy) {
            try {
                await this._download_via_node_https(task, signal, speedLimitBps, true);
            } catch (err) {
                if ((err as Error).message === "CF_CHALLENGE") {
                    log.info("CF challenge detected (dns-proxy path), falling back to browser session...");
                    await this._solve_cf_challenge(task.url, signal);
                    await this._download_via_sess_fetch(task, signal, speedLimitBps);
                } else {
                    throw err;
                }
            }
            return;
        }

        if (isPpyShDomain) {
            try {
                await this._download_via_sess_fetch(task, signal, speedLimitBps);
            } catch (err) {
                if ((err as Error).message === "CF_CHALLENGE") {
                    log.info("CF challenge detected, opening browser window to solve...");
                    await this._solve_cf_challenge(task.url, signal);
                    await this._download_via_sess_fetch(task, signal, speedLimitBps);
                } else {
                    throw err;
                }
            }
            return;
        }

        await this._download_via_node_https(task, signal, speedLimitBps, false);
    }

    private async _download_via_sess_fetch(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
    ): Promise<void> {
        const tempPath = `${task.savePath}.tmp`;
        const headers = getChromeHeaders();
        const hostname = taskHostname(task);

        await this._rateLimiter.acquire_rate_limit(hostname);

        const headResponse = await session.defaultSession.fetch(task.url, {
            headers,
            method: "HEAD",
            redirect: "follow",
        });

        const contentDisposition = headResponse.headers.get("content-disposition") || "";
        applyFilenameFromContentDisposition(
            task,
            contentDisposition,
            () => this._ctx.get_save_dir(),
            (t) => this._ctx.emit_task_updated(t),
        );

        const acceptRanges = headResponse.headers.get("accept-ranges") || "";
        const totalSize = parseInt(headResponse.headers.get("content-length") ?? "0", 10);
        const supportsRanges = acceptRanges.includes("bytes") && totalSize > 0;

        validateDownloadResponse(headResponse.status, headResponse.headers.get("content-type") || "");

        task.totalBytes = totalSize;

        const concurrency = this._ctx.get_concurrency();
        if (supportsRanges && concurrency > 1) {
            return this._download_chunks(task, signal, speedLimitBps, headers, totalSize);
        }

        return this._download_single_stream(task, signal, speedLimitBps, headers, tempPath);
    }

    private async _download_chunks(
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
            const limiter = createSpeedLimiter(chunkSpeedLimit);

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

        return this._download_chunks_common(task, signal, speedLimitBps, totalSize, chunkFetchFn);
    }

    private async _download_chunks_node_https(
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
                const options = buildHttpsRequestOptions(finalUrl, "GET", chunkHeaders, dnsProxyIp, servername);

                const req = https.request(options, (res) => {
                    validateDownloadResponse(res.statusCode ?? null);

                    const fileStream =
                        alreadyDownloaded > 0
                            ? fs.createWriteStream(chunkTempPath, { flags: "a" })
                            : fs.createWriteStream(chunkTempPath);
                    const limiter = createSpeedLimiter(chunkSpeedLimit);

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
            onData: (data: Buffer) => void;
        }) => Promise<void>,
    ): Promise<void> {
        const concurrency = this._ctx.get_concurrency();
        const hostname = taskHostname(task);
        const chunks = this._calculate_chunks(totalSize);
        const chunkTempPaths = chunks.map((_, i) => `${task.savePath}.part${i}`);

        task.chunkCount = chunks.length;
        task.activeChunkCount = 0;
        this._ctx.emit_task_updated(task);

        const chunkProgress: number[] = chunks.map(() => 0);
        let totalReceived = 0;

        const tracker = createProgressTracker(task, totalSize, (t) => this._ctx.emit_task_updated(t));

        const chunkSpeedLimit =
            speedLimitBps > 0 ? Math.floor(speedLimitBps / Math.min(chunks.length, concurrency)) : 0;

        const downloadChunk = async (chunkIndex: number, [start, end]: [number, number]): Promise<void> => {
            if (signal.aborted) throw new Error("aborted");

            const alreadyDownloaded = 0;
            const expectedChunkSize = end - start + 1;
            if (alreadyDownloaded >= expectedChunkSize) return;

            await this._rateLimiter.acquire_rate_limit(hostname);
            if (signal.aborted) throw new Error("aborted");

            await this._rateLimiter.acquire_host_slot(hostname);
            if (signal.aborted) throw new Error("aborted");

            task.activeChunkCount = (task.activeChunkCount ?? 0) + 1;
            this._ctx.emit_task_updated(task);

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
                this._rateLimiter.release_host_slot(hostname);
                task.activeChunkCount = Math.max(0, (task.activeChunkCount ?? 1) - 1);
                this._ctx.emit_task_updated(task);
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
            this._ctx.emit_task_updated(task);
        } catch (e) {
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
        }
    }

    private async _download_single_stream(
        task: DownloadTask,
        signal: AbortSignal,
        speedLimitBps: number,
        headers: Record<string, string>,
        tempPath: string,
    ): Promise<void> {
        const hostname = new URL(task.url).hostname;

        await this._rateLimiter.acquire_rate_limit(hostname);

        const response = await session.defaultSession.fetch(task.url, {
            headers,
            redirect: "follow",
        });

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

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const fileStream = fs.createWriteStream(tempPath);
        let received = 0;
        let lastSpeedCalc = Date.now();
        let lastSpeedBytes = 0;

        const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
        const total = contentLength > 0 ? contentLength : 0;
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

                        if (tokenBucket) {
                            const now = Date.now();
                            const elapsed = (now - tokenBucket.lastRefill) / 1000;
                            tokenBucket.tokens = Math.min(
                                speedLimitBps,
                                tokenBucket.tokens + elapsed * speedLimitBps,
                            );
                            tokenBucket.lastRefill = now;

                            if (tokenBucket.tokens < chunk.length) {
                                const waitMs = Math.ceil(
                                    ((chunk.length - tokenBucket.tokens) / speedLimitBps) * 1000,
                                );
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
                            this._ctx.emit_task_updated(task);
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

    private async _download_via_node_https(
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
            headers = getChromeHeaders(cookieHeader ? { Cookie: cookieHeader } : {});
            const ip = await this._resolve_speedtest_ip(parsedUrl.hostname);
            if (ip) {
                log.info(`speedtest-dns-proxy: ${parsedUrl.hostname} > ${ip}`);
                dnsProxyIp = ip;
                servername = parsedUrl.hostname;
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

        await this._rateLimiter.acquire_rate_limit(taskHostname(task));

        if (isPpySh && dnsProxyIp) {
            const rangeInfo = await this._check_range_support_node_https(
                task.url,
                headers,
                dnsProxyIp,
                servername,
                signal,
            );
            task.totalBytes = rangeInfo.totalSize;
            applyFilenameFromContentDisposition(
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
                    servername,
                    rangeInfo.finalUrl,
                );
            }
        }

        return this._download_single_stream_node_https(task, signal, speedLimitBps, headers, dnsProxyIp, servername);
    }

    private async _check_range_support_node_https(
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
            const options = buildHttpsRequestOptions(url, "HEAD", headers, dnsProxyIp, servername);
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
                        this._check_range_support_node_https(
                            location,
                            headers,
                            dnsProxyIp,
                            servername,
                            signal,
                        ).then(resolve, reject);
                    } else {
                        reject(new Error("Redirect without location"));
                    }
                    return;
                }
                validateDownloadResponse(res.statusCode ?? null);
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

    private async _download_single_stream_node_https(
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
                const options = buildHttpsRequestOptions(url, "GET", headers, dnsProxyIp, servername);
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
                    validateDownloadResponse(res.statusCode ?? null);

                    const total = parseInt(res.headers["content-length"] ?? "0", 10);
                    task.totalBytes = total;

                    const fileStream = fs.createWriteStream(tempPath);
                    const limiter = createSpeedLimiter(speedLimitBps);
                    const tracker = createProgressTracker(task, total, (t) =>
                        this._ctx.emit_task_updated(t),
                    );

                    signal.addEventListener("abort", () => {
                        req.destroy();
                        fileStream.destroy();
                        try {
                            fs.unlinkSync(tempPath);
                        } catch {
                            /* ignore */
                        }
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

    private async _solve_cf_challenge(url: string, signal: AbortSignal): Promise<void> {
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

            let resolved = false;

            const cleanup = (fn: () => void) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timer);
                win.destroy();
                fn();
            };

            const timer = setTimeout(() => {
                cleanup(() => reject(new Error("CF challenge timeout")));
            }, 120_000);

            const abortHandler = () => {
                cleanup(() => reject(new Error("aborted")));
            };
            signal.addEventListener("abort", abortHandler);

            win.webContents.on("did-navigate", async (_event, navUrl) => {
                if (navUrl.includes("ppy.sh") && (navUrl.includes("/d/") || navUrl.includes(".osz"))) {
                    await new Promise((r) => setTimeout(r, 500));
                    cleanup(() => resolve());
                }
            });

            win.webContents.on("did-finish-load", async () => {
                const url = win.webContents.getURL();
                if (url.includes("osu.ppy.sh")) {
                    try {
                        const hasChallenge = await win.webContents.executeJavaScript(`
                            document.querySelector('iframe[src*="challenges"]') !== null ||
                            document.querySelector('#cf-turnstile') !== null ||
                            document.title.includes('Just a moment')
                        `);
                        if (!hasChallenge) {
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
                    this._dnsCache = { ip, expires: now + DownloadEngine.DNS_CACHE_TTL_MS };
                    resolve(ip);
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
}
