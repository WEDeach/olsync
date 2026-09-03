import * as crypto from "crypto";
import * as fs from "fs";
import {
    GITHUB_API_HOST,
    GITHUB_DOWNLOAD_HOSTS,
    GITHUB_OWNER,
    GITHUB_RELEASE_HOST,
    GITHUB_REPO,
    UPDATE_CHANNEL,
    UPDATE_DOWNLOAD_TIMEOUT_MS,
    UPDATE_MAX_REDIRECTS,
    UPDATE_PACKAGE_MAX_SIZE,
    UPDATE_TIMEOUT_MS,
} from "./constants";
import { verifyRsaSignature } from "./signature";
import type {
    ReleaseUpdateIndexV1,
    UpdatePackageDescriptor,
    UpdatePackageKind,
    VerifiedPackage,
    VerifiedRelease,
} from "./types";
import { UpdateError } from "./types";

function isLocalHost(host: string): boolean {
    try {
        const { hostname } = new URL(`http://${host}`);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    } catch {
        return host === "localhost" || host === "127.0.0.1";
    }
}

// Environment overrides for local updater testing. The URL *paths* stay
// GitHub-compatible (e.g. /repos/<owner>/<repo>/releases/latest).
const UPDATER_API_HOST = process.env.OL_SYNC_UPDATER_API_HOST ?? GITHUB_API_HOST;
const UPDATER_RELEASE_HOST = process.env.OL_SYNC_UPDATER_RELEASE_HOST ?? GITHUB_RELEASE_HOST;
const UPDATER_DOWNLOAD_HOSTS = process.env.OL_SYNC_UPDATER_DOWNLOAD_HOSTS
    ? process.env.OL_SYNC_UPDATER_DOWNLOAD_HOSTS.split(",")
    : GITHUB_DOWNLOAD_HOSTS;
const UPDATER_ALLOW_HTTP =
    process.env.OL_SYNC_UPDATER_ALLOW_HTTP === "true" ||
    process.env.OL_SYNC_UPDATER_ALLOW_HTTP === "1" ||
    isLocalHost(UPDATER_API_HOST) ||
    isLocalHost(UPDATER_RELEASE_HOST) ||
    UPDATER_DOWNLOAD_HOSTS.some(isLocalHost);
const UPDATER_PROTOCOL = UPDATER_ALLOW_HTTP ? "http" : "https";

export interface GithubRelease {
    tag_name: string;
    html_url: string;
    target_commitish?: string;
    body?: string;
    assets?: Array<{
        name: string;
        browser_download_url: string;
        size: number;
    }>;
}

export class GithubProvider {
    private timeout: number;

    constructor(timeout?: number) {
        this.timeout = timeout ?? UPDATE_TIMEOUT_MS;
    }

    async getLatestRelease(): Promise<GithubRelease> {
        const url = `${UPDATER_PROTOCOL}://${UPDATER_API_HOST}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
        const response = await this.fetchWithAllowedRedirects(url, UPDATE_TIMEOUT_MS);
        if (!response.ok) {
            throw new UpdateError(`GitHub API error: ${response.status} ${response.statusText}`, "EHTTP");
        }
        const release = (await response.json()) as GithubRelease;
        if (!release.tag_name) {
            throw new UpdateError("Invalid GitHub release response", "ERESPONSE");
        }
        return release;
    }

    async fetchVerifiedIndex(release: GithubRelease): Promise<VerifiedRelease> {
        const channel = release.tag_name.startsWith("v") ? release.tag_name.slice(1) : release.tag_name;
        const indexAssetName = `olsync-update-index-v${channel}.json`;
        const indexAsset = release.assets?.find((a) => a.name === indexAssetName);
        if (!indexAsset) {
            throw new UpdateError(`Release missing update index: ${indexAssetName}`, "EINDEX");
        }

        const indexText = await this.fetchAssetText(indexAsset.browser_download_url, indexAsset.size);
        const signature = await this.fetchIndexSignature(indexAsset.browser_download_url);

        if (!verifyRsaSignature(indexText, signature)) {
            throw new UpdateError("Update index signature verification failed", "ESIGNATURE");
        }

        const index = JSON.parse(indexText) as ReleaseUpdateIndexV1;
        this.validateReleaseIndex(index);

        return {
            tag: release.tag_name,
            targetVersion: index.targetVersion,
            releasePageUrl: release.html_url,
            index,
            indexAssetName,
            indexCanonicalJson: indexText,
            indexSignature: signature,
        };
    }

    buildVerifiedPackage(
        release: VerifiedRelease,
        kind: UpdatePackageKind,
        descriptor: UpdatePackageDescriptor,
    ): VerifiedPackage {
        const url = `${UPDATER_PROTOCOL}://${UPDATER_RELEASE_HOST}/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${release.tag}/${descriptor.assetName}`;
        return {
            kind,
            descriptor,
            assetName: descriptor.assetName,
            downloadUrl: url,
        };
    }

    async fetchPackageBuffer(
        url: string,
        expectedSha256: string,
        expectedSize: number,
        onProgress?: (downloaded: number) => void,
    ): Promise<Buffer> {
        if (expectedSize <= 0 || expectedSize > UPDATE_PACKAGE_MAX_SIZE) {
            throw new UpdateError(
                `Package size out of bounds: ${String(expectedSize)} (max ${UPDATE_PACKAGE_MAX_SIZE})`,
                "ESIZE",
            );
        }

        const tempDir = await fs.promises.mkdtemp(`${process.env.TEMP ?? "/tmp"}/olsync-dl-`);
        const tempPath = `${tempDir}/package.zip`;

        try {
            await this.downloadPackageToFile(url, tempPath, expectedSha256, expectedSize, onProgress);
            return await fs.promises.readFile(tempPath);
        } finally {
            await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
    }

    private async fetchIndexSignature(indexUrl: string): Promise<string> {
        const sigUrl = `${indexUrl}.sig`;
        const text = await this.fetchAssetText(sigUrl, 0);
        return text.trim();
    }

    private async fetchAssetText(url: string, expectedSize: number): Promise<string> {
        const response = await this.fetchWithAllowedRedirects(url, this.timeout);
        if (!response.ok) {
            throw new UpdateError(`Asset fetch failed: ${response.status} ${response.statusText} (${url})`, "EHTTP");
        }

        const finalUrl = response.url;
        this.ensureAllowedHost(finalUrl);

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length !== expectedSize && expectedSize > 0) {
            throw new UpdateError(
                `Asset size mismatch: expected ${String(expectedSize)}, got ${buffer.length}`,
                "ESIZE",
            );
        }
        return buffer.toString("utf8");
    }

    private async downloadPackageToFile(
        url: string,
        destination: string,
        expectedSha256: string,
        expectedSize: number,
        onProgress?: (downloaded: number) => void,
    ): Promise<void> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), UPDATE_DOWNLOAD_TIMEOUT_MS);

        try {
            const response = await this.fetchWithAllowedRedirects(url, UPDATE_DOWNLOAD_TIMEOUT_MS, controller.signal);
            if (!response.ok) {
                throw new UpdateError(`Package download failed: ${response.status} ${response.statusText}`, "EHTTP");
            }
            this.ensureAllowedHost(response.url);

            const contentLength = response.headers.get("content-length");
            const total = contentLength ? Number(contentLength) : undefined;
            if (total !== undefined && !Number.isNaN(total) && total !== expectedSize) {
                throw new UpdateError(
                    `Package content-length mismatch: ${String(total)} vs ${String(expectedSize)}`,
                    "ESIZE",
                );
            }

            if (!response.body) {
                throw new UpdateError("Package download returned empty body", "EIO");
            }

            const hash = crypto.createHash("sha256");
            const writeStream = fs.createWriteStream(destination);
            const reader = response.body.getReader();
            let downloaded = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        downloaded += value.length;
                        if (downloaded > expectedSize) {
                            throw new UpdateError(
                                `Download exceeded expected size: ${String(downloaded)} > ${String(expectedSize)}`,
                                "ESIZE",
                            );
                        }
                        if (downloaded > UPDATE_PACKAGE_MAX_SIZE) {
                            throw new UpdateError(`Download exceeded package max size`, "ESIZE");
                        }
                        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
                        hash.update(chunk);

                        // Attach drain/error handlers before write so a fast drain
                        // (or error) cannot fire before the listener is in place.
                        let cleanup: () => void = () => {};
                        const drainPromise = new Promise<void>((resolve, reject) => {
                            const onDrain = () => {
                                resolve();
                                cleanup();
                            };
                            const onError = (err: Error) => {
                                reject(err);
                                cleanup();
                            };
                            cleanup = () => {
                                writeStream.removeListener("drain", onDrain);
                                writeStream.removeListener("error", onError);
                            };
                            writeStream.once("drain", onDrain);
                            writeStream.once("error", onError);
                        });

                        const ok = writeStream.write(chunk);
                        if (ok) {
                            cleanup();
                            onProgress?.(downloaded);
                        } else {
                            await drainPromise;
                            onProgress?.(downloaded);
                        }
                    }
                }
            } finally {
                writeStream.end();
                reader.releaseLock();
            }

            await new Promise<void>((resolve, reject) => {
                writeStream.once("finish", resolve);
                writeStream.once("error", reject);
            });

            if (downloaded !== expectedSize) {
                throw new UpdateError(
                    `Download size mismatch: ${String(downloaded)} vs ${String(expectedSize)}`,
                    "ESIZE",
                );
            }

            const finalHash = hash.digest("hex");
            if (finalHash !== expectedSha256) {
                throw new UpdateError(`Package SHA256 mismatch`, "EHASH");
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    private async fetchWithAllowedRedirects(
        url: string,
        timeoutMs: number,
        signal?: AbortSignal,
        redirectCount = 0,
    ): Promise<Response> {
        this.ensureAllowedHost(url);

        const controller = new AbortController();
        if (signal?.aborted) {
            throw new UpdateError("Request aborted", "EABORT");
        }

        const onAbort = () => controller.abort();
        if (signal) {
            signal.addEventListener("abort", onAbort);
        }
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                redirect: "manual",
                headers: {
                    "User-Agent": "olsync-updater",
                    "Accept-Encoding": "identity",
                },
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get("location");
                if (!location) {
                    throw new UpdateError("Redirect without Location header", "EREDIRECT");
                }
                if (redirectCount >= UPDATE_MAX_REDIRECTS) {
                    throw new UpdateError(`Too many redirects (>${UPDATE_MAX_REDIRECTS})`, "EREDIRECT");
                }
                const nextUrl = new URL(location, url).toString();
                return this.fetchWithAllowedRedirects(nextUrl, timeoutMs, signal, redirectCount + 1);
            }

            return response;
        } finally {
            clearTimeout(timeout);
            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }
        }
    }

    private ensureAllowedHost(url: string): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new UpdateError(`Invalid URL: ${url}`, "EURL");
        }
        if (parsed.protocol !== "https:" && !(UPDATER_ALLOW_HTTP && parsed.protocol === "http:")) {
            throw new UpdateError(`Insecure download URL: ${url}`, "EINSECURE");
        }
        if (parsed.username || parsed.password) {
            throw new UpdateError(`URL must not contain credentials: ${url}`, "ECREDENTIALS");
        }
        const allowedHosts = [...new Set([UPDATER_API_HOST, ...UPDATER_DOWNLOAD_HOSTS, UPDATER_RELEASE_HOST])];
        if (!allowedHosts.includes(parsed.host)) {
            throw new UpdateError(`Host not allowed: ${parsed.host}`, "EHOST");
        }
    }

    private validateReleaseIndex(index: ReleaseUpdateIndexV1): void {
        if (index.schemaVersion !== 1) {
            throw new UpdateError(`Unsupported release index schema: ${index.schemaVersion}`, "ESCHEMA");
        }
        if (index.product !== "olsync" || index.channel !== UPDATE_CHANNEL) {
            throw new UpdateError(`Product/channel mismatch in release index`, "ECHANNEL");
        }
        if (!index.packages?.overall || !index.packages?.full) {
            throw new UpdateError("Release index missing required packages", "EPACKAGES");
        }
        for (const pkg of [index.packages.overall, index.packages.full, index.packages.diff].filter(Boolean)) {
            this.validatePackageDescriptor(pkg as UpdatePackageDescriptor);
        }
    }

    private validatePackageDescriptor(descriptor: UpdatePackageDescriptor): void {
        if (descriptor.size <= 0 || descriptor.size > UPDATE_PACKAGE_MAX_SIZE) {
            throw new UpdateError(`Invalid package size: ${descriptor.assetName}`, "ESIZE");
        }
        if (!/^[0-9a-f]{64}$/i.test(descriptor.sha256)) {
            throw new UpdateError(`Invalid package hash: ${descriptor.assetName}`, "EHASH");
        }
    }
}
