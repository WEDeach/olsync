import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import * as url from "url";
import { generateRelease } from "./generate-release";

function compareVersion(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);
    const maxLen = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < maxLen; i++) {
        const n1 = parts1[i] || 0;
        const n2 = parts2[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }
    return 0;
}

interface ServerOptions {
    port: number;
    snapshotDir: string;
    outputDir: string;
    signKey: string;
    version?: string;
    prevVersion?: string;
    minimumUpdaterVersion: string;
    platform: "win32" | "darwin" | "linux";
    arch: "x64" | "arm64";
    serveOnly: boolean;
}

function parseArgs(): ServerOptions {
    const args = process.argv.slice(2);
    const opts: ServerOptions = {
        port: 3000,
        snapshotDir: ".build-snapshots",
        outputDir: "",
        signKey: "./keys/private.pem",
        minimumUpdaterVersion: "1.0.0",
        platform: "win32",
        arch: "x64",
        serveOnly: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--serve-only":
                opts.serveOnly = true;
                break;
            case "--port":
                opts.port = Number(args[++i]);
                break;
            case "--snapshot-dir":
                opts.snapshotDir = path.resolve(args[++i]);
                break;
            case "--output":
                opts.outputDir = path.resolve(args[++i]);
                break;
            case "--sign-key":
                opts.signKey = path.resolve(args[++i]);
                break;
            case "--version":
                opts.version = args[++i];
                break;
            case "--prev-version":
                opts.prevVersion = args[++i];
                break;
            case "--minimum-updater-version":
                opts.minimumUpdaterVersion = args[++i];
                break;
            case "--platform":
                opts.platform = args[++i] as "win32" | "darwin" | "linux";
                break;
            case "--arch":
                opts.arch = args[++i] as "x64" | "arm64";
                break;
            default:
                if (args[i].startsWith("-")) {
                    throw new Error(`Unknown option: ${args[i]}`);
                }
                break;
        }
    }

    if (!opts.outputDir) {
        if (opts.serveOnly) {
            // By default, serve directly from the build snapshot.
            opts.outputDir = opts.version ? path.join(opts.snapshotDir, opts.version) : opts.snapshotDir;
        } else {
            opts.outputDir = ".updater-server-out";
        }
    }

    return opts;
}

function listSnapshotVersions(snapshotDir: string): string[] {
    if (!fs.existsSync(snapshotDir)) {
        throw new Error(`Snapshot directory not found: ${snapshotDir}`);
    }
    return fs
        .readdirSync(snapshotDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+/.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => compareVersion(b, a));
}

function detectVersions(opts: ServerOptions): { version: string; prevVersion?: string } {
    if (opts.version) {
        return { version: opts.version, prevVersion: opts.prevVersion };
    }

    const versions = listSnapshotVersions(opts.snapshotDir);
    if (versions.length === 0) {
        throw new Error(`No versioned snapshots found in ${opts.snapshotDir}`);
    }

    const version = versions[0];
    const prevVersion = versions.length > 1 ? versions[1] : undefined;
    console.log(`Auto-detected target version: ${version}${prevVersion ? `, previous: ${prevVersion}` : ""}`);
    return { version, prevVersion };
}

function assetMimeType(assetName: string): string {
    if (assetName.endsWith(".zip")) return "application/zip";
    if (assetName.endsWith(".json")) return "application/json";
    if (assetName.endsWith(".sig")) return "text/plain";
    return "application/octet-stream";
}

function serveAsset(filePath: string, res: http.ServerResponse) {
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
        "Content-Type": assetMimeType(path.basename(filePath)),
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
}

function buildReleaseJson(outputDir: string, version: string, baseUrl: string): object {
    const tag = version.startsWith("v") ? version : `v${version}`;
    const indexName = `olsync-update-index-v${version}.json`;
    const sigName = `${indexName}.sig`;
    const overallName = `olsync-overall-v${version}.zip`;
    const fullName = `olsync-full-v${version}.zip`;
    const diffName = fs
        .readdirSync(outputDir)
        .find((n) => n.startsWith("olsync-diff-v") && n.includes(`-to-v${version}`));

    const assetNames = [indexName, sigName, overallName, fullName, diffName].filter(Boolean) as string[];
    const assets = assetNames.map((name) => {
        const filePath = path.join(outputDir, name);
        const stat = fs.statSync(filePath);
        const encodedName = encodeURIComponent(name);
        return {
            name,
            size: stat.size,
            browser_download_url: `${baseUrl}/WEDeach/olsync/releases/download/${tag}/${encodedName}`,
        };
    });

    return {
        tag_name: tag,
        html_url: `${baseUrl}/WEDeach/olsync/releases/tag/${tag}`,
        target_commitish: "main",
        assets,
    };
}

async function prepareReleaseAssets(opts: ServerOptions, version: string, prevVersion: string | undefined): Promise<void> {
    const buildDir = path.join(opts.snapshotDir, version, "win-unpacked");
    const prevBuildDir = prevVersion ? path.join(opts.snapshotDir, prevVersion, "win-unpacked") : undefined;

    if (!fs.existsSync(buildDir)) {
        throw new Error(`Build snapshot not found: ${buildDir}`);
    }

    console.log(`Generating release assets for v${version}...`);
    fs.rmSync(opts.outputDir, { recursive: true, force: true });
    fs.mkdirSync(opts.outputDir, { recursive: true });

    await generateRelease(
        buildDir,
        version,
        opts.outputDir,
        prevBuildDir,
        opts.signKey,
        opts.minimumUpdaterVersion,
        opts.platform,
        opts.arch,
        false,
    );
}

async function main() {
    const opts = parseArgs();
    const { version, prevVersion } = detectVersions(opts);
    const baseUrl = `http://127.0.0.1:${opts.port}`;

    if (opts.serveOnly) {
        console.log(`Serve-only mode: skipping asset generation for v${version}`);
        if (!fs.existsSync(opts.outputDir)) {
            throw new Error(`Output directory not found for serve-only: ${opts.outputDir}`);
        }
    } else {
        if (!fs.existsSync(opts.signKey)) {
            throw new Error(`Sign key not found: ${opts.signKey}`);
        }
        await prepareReleaseAssets(opts, version, prevVersion);
    }

    if (!fs.existsSync(opts.outputDir)) {
        throw new Error(`Output directory not found: ${opts.outputDir}`);
    }
    const releaseJson = buildReleaseJson(opts.outputDir, version, baseUrl);

    const server = http.createServer((req, res) => {
        const reqUrl = url.parse(req.url ?? "", true);

        if (req.method !== "GET") {
            res.writeHead(405, { "Content-Type": "text/plain" });
            res.end("Method not allowed");
            return;
        }

        const pathname = (reqUrl.pathname ?? "").replace(/\/+$/, "") || "/";

        if (pathname === "/repos/WEDeach/olsync/releases/latest") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(releaseJson, null, 2));
            return;
        }

        const downloadMatch = pathname.match(/^\/WEDeach\/olsync\/releases\/download\/[^/]+\/(.+)$/);
        if (downloadMatch) {
            const assetName = decodeURIComponent(downloadMatch[1]);
            const filePath = path.join(opts.outputDir, assetName);
            serveAsset(filePath, res);
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    });

    server.listen(opts.port, "127.0.0.1", () => {
        console.log(`\nUpdater server listening at ${baseUrl}`);
        console.log(`\nTo test the app against this server, run it with:`);
        console.log(`\n  PowerShell:`);
        console.log(`  $env:OL_SYNC_UPDATER_API_HOST = "127.0.0.1:${opts.port}"`);
        console.log(`  $env:OL_SYNC_UPDATER_RELEASE_HOST = "127.0.0.1:${opts.port}"`);
        console.log(`  $env:OL_SYNC_UPDATER_DOWNLOAD_HOSTS = "127.0.0.1:${opts.port}"`);
        console.log(`  .\\release\\win-unpacked\\olSync.exe`);
        console.log(`\n  CMD:`);
        console.log(`  set OL_SYNC_UPDATER_API_HOST=127.0.0.1:${opts.port}`);
        console.log(`  set OL_SYNC_UPDATER_RELEASE_HOST=127.0.0.1:${opts.port}`);
        console.log(`  set OL_SYNC_UPDATER_DOWNLOAD_HOSTS=127.0.0.1:${opts.port}`);
        console.log(`  release\\win-unpacked\\olSync.exe`);
        console.log(`\nEndpoints:`);
        console.log(`  ${baseUrl}/repos/WEDeach/olsync/releases/latest`);
        console.log(`  ${baseUrl}/WEDeach/olsync/releases/download/v${version}/<asset>`);
    });

    const shutdown = () => {
        console.log("\nShutting down...");
        server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((err) => {
    console.error("Updater server failed:", err);
    process.exit(1);
});
