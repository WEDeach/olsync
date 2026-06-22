import * as https from "https";
import * as path from "path";
import { CachedDownload, DownloadTask } from "../../../defines/download_types";

export function uuid(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, "_")
        .split("")
        .map((c) => (c.charCodeAt(0) < 32 ? "_" : c))
        .join("")
        .trim();
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

export function getChromeHeaders(extra?: Record<string, string>): Record<string, string> {
    return { ...CHROME_HEADERS, ...extra };
}

export function buildHttpsRequestOptions(
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

export function taskHostname(task: DownloadTask | { url: string }): string {
    return new URL(task.url).hostname;
}

export function validateDownloadResponse(statusCode: number | null, contentType?: string): void {
    if (statusCode === 403) throw new Error("CF_CHALLENGE");
    if (contentType?.includes("text/html") && statusCode !== 200) throw new Error("CF_CHALLENGE");
    if (!statusCode || statusCode >= 400) throw new Error(`HTTP ${statusCode}`);
}

export function matchTask(
    a: { url: string; beatmapsetId?: string | number | null },
    b: { url: string; beatmapsetId?: string | number | null },
): boolean {
    return a.url === b.url || (a.beatmapsetId != null && b.beatmapsetId != null && a.beatmapsetId === b.beatmapsetId);
}

export function buildCacheEntry(
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

export function applyFilenameFromContentDisposition(
    task: DownloadTask,
    contentDisposition: string,
    getSaveDir: () => string,
    onUpdate: (task: DownloadTask) => void,
): void {
    const cdMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?(?:"([^"]+)"|([^;\r\n]+))/i);
    const rawFilename = (cdMatch?.[1] ?? cdMatch?.[2] ?? "").trim();
    if (!rawFilename) return;
    try {
        const headerFilename = sanitizeFilename(decodeURIComponent(rawFilename));
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
