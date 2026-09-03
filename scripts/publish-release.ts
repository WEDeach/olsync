/**
 * One-click release publisher for olSync.
 *
 * Builds the app, generates BOTH the new GitHub-release assets and the legacy
 * (pre-GitHub, manifest.json based) update output, then verifies everything the
 * old and new clients will check before reporting success.
 *
 * Guardrails (refuse to run when violated):
 *  - a previous-version build ("snapshot") must be available, either via
 *    --prev-build-dir or auto-discovered from .build-snapshots/;
 *  - the signing key must exist and match the public key embedded in the app;
 *  - the target version must be a valid semver and newer than the previous one;
 *  - the output directory must not already exist (use --force to overwrite);
 *  - after generation, the legacy manifest signature is verified with the OLD
 *    client's verification logic, every manifest-listed file is size+hash
 *    verified, and the GitHub index signature/version are verified.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { assertSigningKeyMatchesEmbedded, generateRelease } from "./generate-release";
import { PUBLIC_KEY_PEM } from "../src/updater-core/constants";
import { verifyRsaSignature } from "../src/updater-core/signature";
import { sha256Buffer } from "../src/updater-core/hash";

function findProjectRoot(startDir: string): string {
    let dir = startDir;
    while (true) {
        if (fs.existsSync(path.join(dir, "package.json"))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return startDir;
        dir = parent;
    }
}

const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
const RELEASE_ROOT = path.join(projectRoot, "release");
const SNAPSHOT_DIR = path.join(projectRoot, ".build-snapshots");
const KEY_PATH = path.join(projectRoot, "keys", "private.pem");

function fail(message: string): never {
    console.error(`\n[release] FAILED: ${message}`);
    process.exit(1);
}

function step(label: string, command: string, args: string[]): void {
    console.log(`\n=== ${label} ===`);
    const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit", shell: true });
    if (result.status !== 0) {
        fail(`${label} exited with status ${String(result.status)}`);
    }
}

function isValidSemver(version: string): boolean {
    return /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);
}

function compareVersions(a: string, b: string): number {
    const parse = (v: string) =>
        v
            .replace(/^v/, "")
            .split(".")
            .map((part) => Number(part.replace(/-.*$/, "")));
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

/** Fail fast if bin/win output is locked by a running app (dev or packaged). */
function assertBinWinWritable(): void {
    const binWin = path.join(projectRoot, "bin", "win");
    if (!fs.existsSync(binWin)) return;
    for (const name of fs.readdirSync(binWin)) {
        const filePath = path.join(binWin, name);
        try {
            const handle = fs.openSync(filePath, "r+");
            fs.closeSync(handle);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "EPERM" || code === "EBUSY" || code === "EACCES") {
                fail(
                    `Build output is locked by a running process: ${filePath} (${code}). ` +
                        "Close the running olSync app (dev or packaged) before publishing — " +
                        "build:bin must overwrite SIGW.exe / StableIpcBridge.dll.",
                );
            }
            throw error;
        }
    }
}

function readManifestVersion(dir: string): string | null {
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        return typeof manifest.version === "string" ? manifest.version : null;
    } catch {
        return null;
    }
}

/** Scan local snapshot / extracted-release dirs for usable previous builds. */
function findPrevBuildCandidates(targetVersion: string): Array<{ dir: string; version: string }> {
    const candidates: Array<{ dir: string; version: string }> = [];
    if (fs.existsSync(SNAPSHOT_DIR)) {
        for (const entry of fs.readdirSync(SNAPSHOT_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dir = path.join(SNAPSHOT_DIR, entry.name);
            const version = readManifestVersion(dir);
            if (version && compareVersions(version, targetVersion) < 0) {
                candidates.push({ dir, version });
            }
        }
    }
    // Also accept extracted release archives: release/olsync-<version>/win-unpacked
    if (fs.existsSync(RELEASE_ROOT)) {
        for (const entry of fs.readdirSync(RELEASE_ROOT, { withFileTypes: true })) {
            if (!entry.isDirectory() || !/^olsync-v?\d+\.\d+\.\d+/.test(entry.name)) continue;
            const dir = path.join(RELEASE_ROOT, entry.name, "win-unpacked");
            if (!fs.existsSync(dir)) continue;
            const version = readManifestVersion(dir);
            if (version && compareVersions(version, targetVersion) < 0) {
                candidates.push({ dir, version });
            }
        }
    }
    candidates.sort((a, b) => compareVersions(b.version, a.version));
    return candidates;
}

/** Resolve the previous-version build, refusing to proceed without one. */
function resolvePrevBuildDir(targetVersion: string, explicit?: string): string {
    if (explicit) {
        const resolved = path.resolve(explicit);
        if (!fs.existsSync(resolved)) {
            fail(`--prev-build-dir does not exist: ${resolved}`);
        }
        const prevVersion = readManifestVersion(resolved);
        if (!prevVersion) {
            fail(`--prev-build-dir has no readable manifest.json: ${resolved}`);
        }
        if (compareVersions(prevVersion, targetVersion) >= 0) {
            fail(`--prev-build-dir version ${prevVersion} is not older than target ${targetVersion}`);
        }
        return resolved;
    }

    const candidates = findPrevBuildCandidates(targetVersion);
    if (candidates.length > 0) {
        console.log(`[release] Auto-discovered previous build: ${candidates[0].version} → ${candidates[0].dir}`);
        return candidates[0].dir;
    }

    fail(
        "No previous-version build found. Provide --prev-build-dir <dir> (a win-unpacked with manifest.json), " +
            "place a snapshot under .build-snapshots/<version>/, or extract an old release to release/olsync-<version>/win-unpacked.",
    );
}

export function verifyLegacyManifest(buildDir: string, targetVersion: string): void {
    const manifestPath = path.join(buildDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        fail(`Legacy manifest not generated: ${manifestPath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        version: string;
        electronVersion?: string;
        signature?: string;
        files: Record<string, { hash: string; size: number }>;
    };
    if (manifest.version !== targetVersion) {
        fail(`Legacy manifest version ${manifest.version} != target ${targetVersion}`);
    }
    if (!manifest.signature) {
        fail("Legacy manifest is not signed");
    }

    // Verify exactly like the old v1.0.x client: JSON.stringify of the parsed
    // payload minus the signature field.
    const { signature, ...payload } = manifest;
    const sigOk = crypto.verify(
        "sha256",
        Buffer.from(JSON.stringify(payload), "utf8"),
        { key: PUBLIC_KEY_PEM, format: "pem", type: "pkcs1" },
        Buffer.from(signature, "base64"),
    );
    if (!sigOk) {
        fail("Legacy manifest signature does not verify with the old client's logic");
    }

    // Every file the old client will download must exist with the exact size+hash.
    const fileCount = Object.keys(manifest.files).length;
    for (const [rel, info] of Object.entries(manifest.files)) {
        const fullPath = path.join(buildDir, rel);
        if (!fs.existsSync(fullPath)) {
            fail(`Legacy manifest lists missing file: ${rel}`);
        }
        const buffer = fs.readFileSync(fullPath);
        if (buffer.length !== info.size) {
            fail(`Legacy manifest size mismatch: ${rel} (${buffer.length} != ${info.size})`);
        }
        if (sha256Buffer(buffer) !== info.hash) {
            fail(`Legacy manifest hash mismatch: ${rel}`);
        }
    }
    console.log(`[release] Legacy manifest verified: ${fileCount} files, signature OK (old-client logic).`);
}

export function verifyGithubAssets(outDir: string, targetVersion: string): void {
    const indexName = `olsync-update-index-v${targetVersion}.json`;
    const indexPath = path.join(outDir, indexName);
    if (!fs.existsSync(indexPath)) {
        fail(`GitHub index missing: ${indexName}`);
    }
    const indexText = fs.readFileSync(indexPath, "utf8");
    const sigPath = `${indexPath}.sig`;
    if (!fs.existsSync(sigPath)) {
        fail(`GitHub index signature missing: ${path.basename(sigPath)}`);
    }
    const sigText = fs.readFileSync(sigPath, "utf8");
    if (!verifyRsaSignature(indexText, sigText)) {
        fail("GitHub index signature verification failed");
    }

    const index = JSON.parse(indexText) as {
        targetVersion: string;
        packages: Record<string, { assetName: string; sha256: string; size: number }>;
    };
    if (index.targetVersion !== targetVersion) {
        fail(`GitHub index targetVersion ${index.targetVersion} != ${targetVersion}`);
    }
    for (const [kind, descriptor] of Object.entries(index.packages)) {
        const assetPath = path.join(outDir, descriptor.assetName);
        if (!fs.existsSync(assetPath)) {
            fail(`Package asset missing for ${kind}: ${descriptor.assetName}`);
        }
        const buffer = fs.readFileSync(assetPath);
        if (buffer.length !== descriptor.size) {
            fail(`Package size mismatch for ${kind}: ${buffer.length} != ${descriptor.size}`);
        }
        if (sha256Buffer(buffer) !== descriptor.sha256) {
            fail(`Package hash mismatch for ${kind}: ${descriptor.assetName}`);
        }
    }
    console.log(`[release] GitHub index verified: signature OK, ${Object.keys(index.packages).length} packages OK.`);
}

interface ParsedArgs {
    version: string;
    prevBuildDir: string | undefined;
    outRoot: string;
    platform: "win32" | "darwin" | "linux";
    arch: "x64" | "arm64";
    skipBuild: boolean;
    force: boolean;
    copyLegacy: boolean;
    allowNoPrev: boolean;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
        version?: string;
    };
    const parsed: ParsedArgs = {
        version: packageJson.version ?? "",
        prevBuildDir: undefined,
        outRoot: path.join(RELEASE_ROOT, "dist"),
        platform: "win32",
        arch: "x64",
        skipBuild: false,
        force: false,
        copyLegacy: true,
        allowNoPrev: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--version":
                parsed.version = args[++i];
                break;
            case "--prev-build-dir":
                parsed.prevBuildDir = args[++i];
                break;
            case "--out":
                parsed.outRoot = path.resolve(args[++i]);
                break;
            case "--platform":
                parsed.platform = args[++i] as ParsedArgs["platform"];
                break;
            case "--arch":
                parsed.arch = args[++i] as ParsedArgs["arch"];
                break;
            case "--skip-build":
                parsed.skipBuild = true;
                break;
            case "--force":
                parsed.force = true;
                break;
            case "--no-copy-legacy":
                parsed.copyLegacy = false;
                break;
            case "--allow-no-prev":
                parsed.allowNoPrev = true;
                break;
            default:
                console.error(`Unknown argument: ${args[i]}`);
                process.exit(1);
        }
    }
    return parsed;
}

function main(): void {
    void (async () => {
        const opts = parseArgs();

    if (!isValidSemver(opts.version)) {
        fail(`Invalid target version: ${opts.version}`);
    }
    if (!["win32", "darwin", "linux"].includes(opts.platform)) {
        fail(`Invalid platform: ${opts.platform}`);
    }
    if (!["x64", "arm64"].includes(opts.arch)) {
        fail(`Invalid arch: ${opts.arch}`);
    }
    if (!fs.existsSync(KEY_PATH)) {
        fail(`Signing key not found: ${KEY_PATH} (run 'npx tsx scripts/generate-release.ts --gen-keys ./keys' if missing)`);
    }
    console.log(`[release] Signing key: ${KEY_PATH}`);
    assertSigningKeyMatchesEmbedded(KEY_PATH);
    console.log("[release] Signing key matches the public key embedded in the app.");

    let prevBuildDir: string | undefined;
    if (opts.prevBuildDir) {
        prevBuildDir = resolvePrevBuildDir(opts.version, opts.prevBuildDir);
    } else {
        const candidates = findPrevBuildCandidates(opts.version);
        if (candidates.length > 0) {
            prevBuildDir = candidates[0].dir;
            console.log(`[release] Auto-discovered previous build: ${candidates[0].version} → ${candidates[0].dir}`);
        } else if (opts.allowNoPrev) {
            console.warn(
                "[release] No previous-version build found; the diff package will be skipped (first GitHub release).",
            );
        } else {
            fail(
                "No previous-version build found. Provide --prev-build-dir <dir> (a win-unpacked with manifest.json), " +
                    "place a snapshot under .build-snapshots/<version>/, or extract an old release to release/olsync-<version>/win-unpacked.",
            );
        }
    }
    const prevVersion = prevBuildDir ? (readManifestVersion(prevBuildDir) ?? "0.0.0") : undefined;
    console.log(
        prevBuildDir
            ? `[release] Previous build: v${prevVersion} → ${prevBuildDir}`
            : "[release] Previous build: none (first release)",
    );
    console.log(`[release] Target version: v${opts.version} (${opts.platform}/${opts.arch})`);

    assertBinWinWritable();
    console.log("[release] bin/win is not locked by a running app.");

    const buildDir = path.join(RELEASE_ROOT, "win-unpacked");
    if (!opts.skipBuild) {
        step("Build renderer & main (build:prod)", "npm", ["run", "build:prod"]);
        step("Build preload (build:electron-preload)", "npm", ["run", "build:electron-preload"]);
        step("Build stable IPC bridge (build:bin)", "npm", ["run", "build:bin"]);
        step("Package win-unpacked (electron-builder --win)", "npx", [
            "electron-builder",
            "--win",
            "--publish",
            "never",
        ]);
    }
    if (!fs.existsSync(path.join(buildDir, opts.platform === "darwin" ? "olSync.app" : "olSync.exe"))) {
        fail(`Packaged build not found: ${buildDir}`);
    }

    const outDir = path.join(opts.outRoot, opts.version);
    if (fs.existsSync(outDir)) {
        if (!opts.force) {
            fail(`Output directory already exists: ${outDir} (use --force to overwrite)`);
        }
        console.warn(`[release] Removing existing output directory: ${outDir}`);
        fs.rmSync(outDir, { recursive: true, force: true });
    }
    const githubOut = path.join(outDir, "github");
    fs.mkdirSync(githubOut, { recursive: true });

    console.log("\n=== Generating release assets ===");
    try {
        await generateRelease(
            buildDir,
            opts.version,
            githubOut,
            prevBuildDir,
            KEY_PATH,
            "1.0.0",
            opts.platform,
            opts.arch,
            true,
        );
    } catch (error) {
        fail((error as Error).message);
    }

    console.log("\n=== Verifying legacy (old updater) output ===");
    verifyLegacyManifest(buildDir, opts.version);

    console.log("\n=== Verifying GitHub (new updater) output ===");
    verifyGithubAssets(githubOut, opts.version);

    if (opts.copyLegacy) {
        const legacyOut = path.join(outDir, "legacy-url");
        console.log(`\n=== Copying win-unpacked → ${legacyOut} ===`);
        fs.cpSync(buildDir, legacyOut, { recursive: true });
        verifyLegacyManifest(legacyOut, opts.version);
    }

    const patchCount = fs
        .readdirSync(buildDir, { recursive: true })
        .filter((name) => String(name).endsWith(".patch")).length;
    console.log(`\n[release] Legacy .patch files generated: ${patchCount}`);

    console.log("\n===============================================================");
    console.log(" RELEASE READY");
    console.log("===============================================================");
    console.log(` Target: v${opts.version} (${opts.platform}/${opts.arch})`);
    console.log(` Prev:   ${prevBuildDir ? `v${prevVersion}` : "none (first release)"}`);
    console.log("");
    console.log(" 1) GitHub release v" + opts.version + ":");
    console.log(`    Upload everything in: ${githubOut}`);
    console.log("    (index json + .sig + overall/full/diff zips)");
    console.log("");
    console.log(" 2) Legacy update URL (old v1.0.x clients):");
    if (opts.copyLegacy) {
        console.log(`    Upload everything in: ${outDir}/legacy-url`);
    } else {
        console.log(`    Upload everything in: ${buildDir}`);
    }
    console.log("    Old clients fetch: <UPDATE_BASE_URL>/manifest.json");
    console.log("    then <UPDATE_BASE_URL>/<file> and <UPDATE_BASE_URL>/<file>.patch");
    console.log("===============================================================");
    })().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    main();
}
