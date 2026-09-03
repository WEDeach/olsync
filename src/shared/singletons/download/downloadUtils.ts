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

export function validate_download_response(statusCode: number | null, contentType?: string, host?: string): void {
    if (contentType?.includes("text/html") && statusCode !== 401 && statusCode !== 403) {
        if (host && is_official_osu_host(host)) {
            throw new Error("CF_CHALLENGE");
        }
        throw new Error("Unexpected HTML response");
    }
    if (!statusCode || statusCode >= 400) throw new Error(`HTTP ${statusCode}`);
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
