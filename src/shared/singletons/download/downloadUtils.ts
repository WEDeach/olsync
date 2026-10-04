import * as http from "http";
import * as net from "net";
import * as path from "path";
import { CachedDownload, DownloadTask } from "../../../defines/download_types";

export function uuid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitize_filename(name: string): string {
    const cleaned = name
        .replace(/[<>:"/\\|?*]/g, "_")
        .split("")
        .map((c) => (c.charCodeAt(0) < 32 ? "_" : c))
        .join("")
        .trim();
    if (cleaned === "" || cleaned === "." || cleaned === "..") return "_";
    const ext = path.extname(cleaned);
    const base = ext ? cleaned.slice(0, -ext.length) : cleaned;
    if (WINDOWS_RESERVED_NAMES.test(base)) {
        return `${base}_${ext}`;
    }
    return cleaned;
}

export function is_official_osu_host(host: string): boolean {
    return host === "ppy.sh" || host.endsWith(".ppy.sh");
}

export function is_private_ip(host: string): boolean {
    if (host.toLowerCase() === "localhost") return true;
    if (net.isIPv4(host)) {
        const parts = host.split(".").map(Number);
        const [a, b, c] = parts;
        if (a === 127) return true;
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0) return true;
        if (a === 255 && b === 255 && c === 255) return true;
    }
    if (net.isIPv6(host)) {
        const lower = host.toLowerCase();
        if (lower.startsWith("::ffff:")) {
            const mapped = lower.slice(7);
            if (net.isIPv4(mapped)) return is_private_ip(mapped);
        }
        if (lower === "::1" || lower === "::") return true;
        if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
        if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
            return true;
    }
    return false;
}

export const CHROME_HEADERS: Record<string, string> = {
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
};

export function get_chrome_headers(extra?: Record<string, string>): Record<string, string> {
    return { ...CHROME_HEADERS, ...extra };
}

export function build_request_options(
    url: string,
    method: string,
    headers: Record<string, string>,
    dnsProxyIp?: string,
    servername?: string,
): http.RequestOptions {
    const reqUrl = new URL(url);
    const isHttp = reqUrl.protocol === "http:";
    const useProxy = !isHttp && !!dnsProxyIp && is_official_osu_host(reqUrl.hostname);
    const options: http.RequestOptions & { servername?: string } = {
        hostname: useProxy ? dnsProxyIp : reqUrl.hostname,
        port: reqUrl.port || (isHttp ? 80 : 443),
        path: reqUrl.pathname + reqUrl.search,
        method,
        headers: {
            ...headers,
            ...(useProxy ? { Host: reqUrl.hostname } : {}),
        },
    };
    if (useProxy) {
        options.servername = servername || reqUrl.hostname;
    }
    return options;
}

export function task_hostname(task: DownloadTask | { url: string }): string {
    return new URL(task.url).hostname;
}

export interface DownloadResponseDiagnostics {
    url?: string | null;
    contentType?: string | null;
    server?: string | null;
    cfRay?: string | null;
    cfMitigated?: string | null;
    location?: string | null;
    wwwAuthenticate?: string | null;
    bodySnippet?: string | null;
}

export function format_diagnostics(diagnostics?: DownloadResponseDiagnostics): string {
    if (!diagnostics) return "";
    const parts: string[] = [];
    if (diagnostics.server) parts.push(`server=${diagnostics.server}`);
    if (diagnostics.cfMitigated) parts.push(`cf-mitigated=${diagnostics.cfMitigated}`);
    if (diagnostics.cfRay) parts.push(`cf-ray=${diagnostics.cfRay}`);
    if (diagnostics.contentType) parts.push(`content-type=${diagnostics.contentType}`);
    if (diagnostics.wwwAuthenticate) parts.push(`www-authenticate=${diagnostics.wwwAuthenticate}`);
    if (diagnostics.location) parts.push(`location=${diagnostics.location}`);
    if (diagnostics.url) parts.push(`url=${diagnostics.url}`);
    if (diagnostics.bodySnippet) parts.push(`body=${JSON.stringify(diagnostics.bodySnippet)}`);
    return parts.length > 0 ? ` (${parts.join("; ")})` : "";
}

export function fetch_response_diagnostics(
    response: Response,
    url?: string | null,
    bodySnippet?: string | null,
): DownloadResponseDiagnostics {
    return {
        url: url ?? response.url,
        contentType: response.headers.get("content-type"),
        server: response.headers.get("server"),
        cfRay: response.headers.get("cf-ray"),
        cfMitigated: response.headers.get("cf-mitigated"),
        location: response.headers.get("location"),
        wwwAuthenticate: response.headers.get("www-authenticate"),
        bodySnippet,
    };
}

export function node_response_diagnostics(
    res: http.IncomingMessage,
    url?: string | null,
    bodySnippet?: string | null,
): DownloadResponseDiagnostics {
    const header = (name: string): string | null => {
        const value = res.headers[name];
        return Array.isArray(value) ? value.join(", ") : (value ?? null);
    };
    return {
        url,
        contentType: header("content-type"),
        server: header("server"),
        cfRay: header("cf-ray"),
        cfMitigated: header("cf-mitigated"),
        location: header("location"),
        wwwAuthenticate: header("www-authenticate"),
        bodySnippet,
    };
}

export async function read_response_snippet(response: Response, maxLength = 512): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    try {
        const { value } = await reader.read();
        if (!value) return "";
        return new TextDecoder().decode(value.slice(0, maxLength)).replace(/\s+/g, " ").trim();
    } catch {
        return "";
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export function read_node_body_snippet(res: http.IncomingMessage, maxLength = 512): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            res.removeListener("data", onData);
            res.removeListener("end", onEnd);
            res.removeListener("error", onError);
            const text = Buffer.concat(chunks).toString("utf8").slice(0, maxLength).replace(/\s+/g, " ").trim();
            res.resume();
            resolve(text);
        };
        const onData = (chunk: Buffer) => {
            if (settled) return;
            if (size < maxLength) {
                chunks.push(chunk);
                size += chunk.length;
                if (size >= maxLength) finish();
            }
        };
        const onEnd = () => finish();
        const onError = () => finish();
        res.on("data", onData);
        res.on("end", onEnd);
        res.on("error", onError);
    });
}

export type DownloadResponseKind = "ok" | "challenge" | "unauthorized" | "html-error" | "http-error";

export function classify_download_response(
    statusCode: number | null,
    contentType?: string,
    host?: string,
    diagnostics?: DownloadResponseDiagnostics,
): DownloadResponseKind {
    const isHtml = Boolean(contentType?.toLowerCase().includes("text/html"));
    const isOfficial = Boolean(host && is_official_osu_host(host));
    const mitigated = diagnostics?.cfMitigated?.toLowerCase() ?? "";
    const body = diagnostics?.bodySnippet ?? "";
    if (
        isOfficial &&
        (mitigated.includes("challenge") ||
            (isHtml && /just a moment|challenge-platform|cf-chl/i.test(body)) ||
            (isHtml && statusCode !== 401 && statusCode !== 403))
    ) {
        return "challenge";
    }
    if (statusCode === 401) return "unauthorized";
    if (!statusCode || statusCode >= 400) return "http-error";
    if (isHtml) return "html-error";
    return "ok";
}

export function get_browser_headers(userAgent: string, extra?: Record<string, string>): Record<string, string> {
    const headers = get_chrome_headers(extra);
    headers["User-Agent"] = userAgent;
    delete headers["sec-ch-ua"];
    delete headers["sec-ch-ua-mobile"];
    delete headers["sec-ch-ua-platform"];
    return headers;
}

export function wait_for_shared_promise<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error("aborted"));
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

export function validate_download_response(
    statusCode: number | null,
    contentType?: string,
    host?: string,
    diagnostics?: DownloadResponseDiagnostics,
): void {
    const detail = format_diagnostics(diagnostics);
    const kind = classify_download_response(statusCode, contentType, host, diagnostics);
    // Cloudflare now answers challenges with 403 + `cf-mitigated: challenge`
    // instead of the old 200/503 HTML page, so status alone cannot decide.
    if (kind === "challenge") throw new Error(`CF_CHALLENGE${detail}`);
    if (kind === "html-error") throw new Error(`Unexpected HTML response${detail}`);
    if (kind === "unauthorized" || kind === "http-error") throw new Error(`HTTP ${statusCode}${detail}`);
}

export function match_task(
    a: { url: string; beatmapsetId?: string | number | null },
    b: { url: string; beatmapsetId?: string | number | null },
): boolean {
    return a.url === b.url || (a.beatmapsetId != null && b.beatmapsetId != null && a.beatmapsetId === b.beatmapsetId);
}

export function build_cache_entry(
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
        missingSource: task.missingSource ?? null,
        source: task.source,
        status,
        error: error ?? null,
        finishedAt,
    };
}

export function apply_filename_from_content_disposition(
    task: DownloadTask,
    contentDisposition: string,
    getSaveDir: () => string,
    onUpdate: (task: DownloadTask) => void,
): void {
    const cdMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?(?:"([^"]+)"|([^;\r\n]+))/i);
    const rawFilename = (cdMatch?.[1] ?? cdMatch?.[2] ?? "").trim();
    if (!rawFilename) return;
    try {
        const headerFilename = sanitize_filename(decodeURIComponent(rawFilename));
        if (headerFilename && headerFilename !== task.filename) {
            const newSavePath = path.join(getSaveDir(), headerFilename);
            task.filename = headerFilename;
            task.savePath = newSavePath;
            onUpdate(task);
        }
    } catch {
        /* ignore decode errors */
    }
}
