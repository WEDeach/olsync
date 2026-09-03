import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as zlib from "zlib";

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
import {
    APP_ALLOWLIST,
    PUBLIC_KEY_PEM,
    UPDATE_CHANNEL,
    UPDATE_PACKAGE_MAX_SIZE,
    UPDATER_PRODUCT,
} from "../src/updater-core/constants.js";
import { canonicalJson } from "../src/updater-core/canonicalJson.js";
import { sha256Buffer, sha256CanonicalJson } from "../src/updater-core/hash.js";
import { matchesAllowlist } from "../src/updater-core/pathPolicy.js";
import { createBinaryPatch } from "../src/updater-core/patch.js";
import type {
    PayloadManifest,
    PayloadManifestEntry,
    ReleaseUpdateIndexV1,
} from "../src/updater-core/types.js";
import {
    computeRuntimeFingerprint,
    EXCLUDED_RUNTIME_DIRS,
    isExcludedRuntimeName,
} from "../src/updater-core/fingerprint.js";

interface FileEntry {
    relativePath: string;
    fullPath: string;
    hash: string;
    size: number;
    buffer: Buffer;
}

interface ManifestPayload {
    version: string;
    electronVersion: string;
    files: { [relativePath: string]: { hash: string; size: number; patch?: { hash: string; size: number } } };
}

const SNAPSHOT_DIR = path.join(projectRoot, ".build-snapshots");

// Directories that must never be packaged (runtime junk / dev artifacts).
// `node_modules` is intentionally ABSENT from this list: packaged apps keep
// native bindings under resources/app.asar.unpacked/node_modules, and skipping
// that directory ships a broken app (native modules unresolvable).
const PACKAGE_EXCLUDED_DIRS = EXCLUDED_RUNTIME_DIRS.filter((ex) => ex !== "node_modules");

const VALID_PLATFORMS: Array<"win32" | "darwin" | "linux"> = ["win32", "darwin", "linux"];
const VALID_ARCHS: Array<"x64" | "arm64"> = ["x64", "arm64"];

function getElectronVersion(): string {
    try {
        const electronPackageJsonPath = require.resolve("electron/package.json");
        const electronPackageJson = JSON.parse(fs.readFileSync(electronPackageJsonPath, "utf-8"));
        return electronPackageJson.version || "unknown";
    } catch {
        const packageJsonPath = path.join(projectRoot, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        return packageJson.devDependencies?.electron?.replace(/[\^~]/, "") || "unknown";
    }
}

function signWithPrivateKey(payload: string, privateKeyPath: string): string {
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    return crypto
        .sign("sha256", Buffer.from(payload, "utf8"), { key: privateKey, format: "pem", type: "pkcs1" })
        .toString("base64");
}

function readManifestPayload(filePath: string): ManifestPayload {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const { signature: _s, ...payload } = raw as ManifestPayload & { signature?: string };
    return payload as ManifestPayload;
}

function scanFiles(dir: string): FileEntry[] {
    const out: FileEntry[] = [];
    const walk = (current: string, rel: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                if (PACKAGE_EXCLUDED_DIRS.some((ex) => isExcludedRuntimeName(entry.name, ex))) continue;
                walk(path.join(current, entry.name), entryRel);
            } else if (entry.isFile()) {
                if (entryRel.endsWith(".patch")) continue;
                const fullPath = path.join(current, entry.name);
                const buffer = fs.readFileSync(fullPath);
                out.push({
                    relativePath: entryRel,
                    fullPath,
                    hash: sha256Buffer(buffer),
                    size: buffer.length,
                    buffer,
                });
            }
        }
    };
    walk(dir, "");
    return out;
}

// Minimal CRC32 implementation for the zip writer.
let crcTable: number[] | undefined;
function getCrc32Table(): number[] {
    if (crcTable) return crcTable;
    crcTable = new Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[i] = c;
    }
    return crcTable;
}

function crc32(data: Buffer): number {
    const table = getCrc32Table();
    let c = -1;
    for (let i = 0; i < data.length; i++) {
        c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    }
    return c ^ -1;
}

function dateToDos(date: Date): { time: number; date: number } {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds() >> 1;
    const time = second | (minute << 5) | (hour << 11);
    const d = day | (month << 5) | ((year - 1980) << 9);
    return { time, date: d };
}

interface ZipEntry {
    name: string;
    data: Buffer;
    compress: boolean;
    compressed?: Buffer;
    crc: number;
    size: number;
    compressedSize: number;
}

export function createZipBuffer(entries: { name: string; data: Buffer }[]): Buffer {
    const prepared: ZipEntry[] = [];
    const now = new Date();
    const { time, date } = dateToDos(now);

    for (const entry of entries) {
        const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
        const useCompressed = compressed.length < entry.data.length;
        const crc = crc32(entry.data);
        const finalData = useCompressed ? compressed : entry.data;
        prepared.push({
            name: entry.name,
            data: entry.data,
            compress: useCompressed,
            compressed: finalData,
            crc,
            size: entry.data.length,
            compressedSize: finalData.length,
        });
    }

    const chunks: Buffer[] = [];
    const centralDirectory: Buffer[] = [];
    let offset = 0;

    for (const entry of prepared) {
        const nameBuffer = Buffer.from(entry.name, "utf8");
        const localHeader = Buffer.alloc(30 + nameBuffer.length);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4); // version needed 2.0
        localHeader.writeUInt16LE(0, 6); // flags
        localHeader.writeUInt16LE(entry.compress ? 8 : 0, 8); // compression method
        localHeader.writeUInt16LE(time, 10);
        localHeader.writeUInt16LE(date, 12);
        localHeader.writeUInt32LE(entry.crc >>> 0, 14);
        localHeader.writeUInt32LE(entry.compressedSize >>> 0, 18);
        localHeader.writeUInt32LE(entry.size >>> 0, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localHeader.writeUInt16LE(0, 28);
        nameBuffer.copy(localHeader, 30);

        chunks.push(localHeader, entry.compressed as Buffer);
        const localHeaderSize = localHeader.length;
        const dataSize = (entry.compressed as Buffer).length;

        const centralHeader = Buffer.alloc(46 + nameBuffer.length);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4); // version made by
        centralHeader.writeUInt16LE(20, 6); // version needed
        centralHeader.writeUInt16LE(0, 8);
        centralHeader.writeUInt16LE(entry.compress ? 8 : 0, 10);
        centralHeader.writeUInt16LE(time, 12);
        centralHeader.writeUInt16LE(date, 14);
        centralHeader.writeUInt32LE(entry.crc >>> 0, 16);
        centralHeader.writeUInt32LE(entry.compressedSize >>> 0, 20);
        centralHeader.writeUInt32LE(entry.size >>> 0, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt16LE(0, 30); // extra length
        centralHeader.writeUInt16LE(0, 32); // comment length
        centralHeader.writeUInt16LE(0, 34); // disk number
        centralHeader.writeUInt16LE(0, 36); // internal attrs
        centralHeader.writeUInt32LE(0, 38); // external attrs
        centralHeader.writeUInt32LE(offset >>> 0, 42);
        nameBuffer.copy(centralHeader, 46);
        centralDirectory.push(centralHeader);

        offset += localHeaderSize + dataSize;
    }

    const cdOffset = offset;
    for (const cd of centralDirectory) {
        chunks.push(cd);
        offset += cd.length;
    }
    const cdSize = offset - cdOffset;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(prepared.length, 8);
    eocd.writeUInt16LE(prepared.length, 10);
    eocd.writeUInt32LE(cdSize >>> 0, 12);
    eocd.writeUInt32LE(cdOffset >>> 0, 16);
    eocd.writeUInt16LE(0, 20);
    chunks.push(eocd);

    return Buffer.concat(chunks);
}

function writePackage(
    outputPath: string,
    payloadManifest: PayloadManifest,
    files: { name: string; data: Buffer }[],
): { sha256: string; size: number; payloadManifestSha256: string } {
    const payloadText = canonicalJson(payloadManifest);
    const payloadManifestSha256 = sha256Buffer(Buffer.from(payloadText, "utf8"));
    const entries = [{ name: "payload-manifest.json", data: Buffer.from(payloadText, "utf8") }, ...files];
    const zipBuffer = createZipBuffer(entries);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, zipBuffer);
    return {
        sha256: sha256Buffer(zipBuffer),
        size: zipBuffer.length,
        payloadManifestSha256,
    };
}

function compareSemver(a: string, b: string): number {
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
        if (Number.isNaN(na) || Number.isNaN(nb)) continue;
        if (na !== nb) return na - nb;
    }
    return 0;
}

function getLatestSnapshot(currentVersion: string): string | undefined {
    if (!fs.existsSync(SNAPSHOT_DIR)) return undefined;
    const entries = fs
        .readdirSync(SNAPSHOT_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && compareSemver(e.name, currentVersion) < 0)
        .map((e) => e.name)
        .sort((a, b) => compareSemver(b, a));
    return entries.length ? path.join(SNAPSHOT_DIR, entries[0]) : undefined;
}

function saveSnapshot(buildDir: string, version: string): void {
    const snapshotPath = path.join(SNAPSHOT_DIR, version);
    if (fs.existsSync(snapshotPath)) {
        console.log(`  Snapshot already exists for v${version}, skipping.`);
        return;
    }
    fs.mkdirSync(snapshotPath, { recursive: true });
    fs.cpSync(buildDir, snapshotPath, { recursive: true });
    console.log(`  Saved snapshot for v${version} → ${snapshotPath}`);
}

function generateKeyPair(outDir: string): void {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "pkcs1", format: "pem" },
        privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "private.pem"), privateKey, { mode: 0o600 });
    fs.writeFileSync(path.join(outDir, "public.pem"), publicKey);
    console.log(`Key pair generated in ${outDir}`);
}

function isValidSemver(version: string): boolean {
    return /^v?\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);
}

function isValidPlatform(value: string): value is "win32" | "darwin" | "linux" {
    return VALID_PLATFORMS.includes(value as "win32" | "darwin" | "linux");
}

function isValidArch(value: string): value is "x64" | "arm64" {
    return VALID_ARCHS.includes(value as "x64" | "arm64");
}

function assertPackageSize(label: string, size: number): void {
    if (size > UPDATE_PACKAGE_MAX_SIZE) {
        throw new Error(`${label} exceeds UPDATE_PACKAGE_MAX_SIZE (${UPDATE_PACKAGE_MAX_SIZE}): ${size}`);
    }
}

export async function generateRelease(
    buildDir: string,
    version: string,
    outputPath: string,
    prevBuildDir: string | undefined,
    privateKeyPath: string | undefined,
    minimumUpdaterVersion: string,
    platform: "win32" | "darwin" | "linux",
    arch: "x64" | "arm64",
    autoSnapshot: boolean,
) {
    if (!fs.existsSync(buildDir)) {
        throw new Error(`Build directory not found: ${buildDir}`);
    }
    if (privateKeyPath) {
        assertSigningKeyMatchesEmbedded(privateKeyPath);
    }

    const electronVersion = getElectronVersion();
    const files = scanFiles(buildDir).filter((f) => f.relativePath !== "manifest.json");

    if (!prevBuildDir && autoSnapshot) {
        prevBuildDir = getLatestSnapshot(version);
        if (prevBuildDir) console.log(`  Auto prev-release: ${prevBuildDir}`);
    }
    const prevFiles = prevBuildDir ? new Map(scanFiles(prevBuildDir).map((f) => [f.relativePath, f])) : new Map();
    const prevManifestPath = prevBuildDir ? path.join(prevBuildDir, "manifest.json") : undefined;

    // Legacy (pre-GitHub) updater patches: emit `<relativePath>.patch` next to each
    // changed file plus `patch` entries in manifest.json, so v1.0.x clients can
    // delta-update from the old update URL. Patches are hash-verified client-side
    // with a graceful fallback to the full file, so a mismatched base is safe.
    const legacyPatchEntries = new Map<string, { hash: string; size: number }>();
    if (prevBuildDir) {
        let legacyPatchCount = 0;
        for (const f of files) {
            const prev = prevFiles.get(f.relativePath);
            if (!prev || prev.hash === f.hash || prev.buffer.length === 0) continue;
            const patchData = createBinaryPatch(prev.buffer, f.buffer);
            if (patchData.length >= f.buffer.length * 0.8) continue;
            const patchRelPath = `${f.relativePath}.patch`;
            const patchOutPath = path.join(buildDir, patchRelPath);
            fs.mkdirSync(path.dirname(patchOutPath), { recursive: true });
            fs.writeFileSync(patchOutPath, patchData);
            legacyPatchEntries.set(f.relativePath, {
                hash: sha256Buffer(patchData),
                size: patchData.length,
            });
            legacyPatchCount++;
        }
        if (legacyPatchCount > 0) {
            console.log(`  Legacy patches: ${legacyPatchCount} (old updater format)`);
        }
    }

    const manifestPayload = buildManifestPayload(files, version, electronVersion, legacyPatchEntries);
    const targetManifestSha256 = sha256CanonicalJson(manifestPayload);
    const manifestPayloadText = canonicalJson(manifestPayload);
    const manifestSignature = privateKeyPath ? signWithPrivateKey(manifestPayloadText, privateKeyPath) : "";
    const manifestFileText = canonicalJson({ ...manifestPayload, signature: manifestSignature });

    const manifestPath = path.join(buildDir, "manifest.json");
    fs.writeFileSync(manifestPath, manifestFileText);

    const manifestFileBuffer = fs.readFileSync(manifestPath);
    const manifestFileHash = sha256Buffer(manifestFileBuffer);
    const manifestFileSize = manifestFileBuffer.length;
    const manifestEntry: FileEntry = {
        relativePath: "manifest.json",
        fullPath: manifestPath,
        hash: manifestFileHash,
        size: manifestFileSize,
        buffer: manifestFileBuffer,
    };
    const allFiles = new Map(files.map((f) => [f.relativePath, f]));
    allFiles.set(manifestEntry.relativePath, manifestEntry);
    const allFilesList = Array.from(allFiles.values());

    const runtimeFingerprint = await computeRuntimeFingerprint(buildDir, {
        allowlist: ["**"],
        negateAllowlist: APP_ALLOWLIST,
    });

    fs.mkdirSync(outputPath, { recursive: true });

    const baseManifestSha256 =
        prevManifestPath && fs.existsSync(prevManifestPath)
            ? sha256CanonicalJson(readManifestPayload(prevManifestPath))
            : undefined;

    const overallFiles: { name: string; data: Buffer }[] = [];
    const overallPayloadEntries: PayloadManifestEntry[] = [];
    for (const f of allFilesList) {
        if (!matchesAllowlist(f.relativePath, APP_ALLOWLIST)) continue;
        overallFiles.push({ name: f.relativePath, data: f.buffer });
        overallPayloadEntries.push({
            path: f.relativePath,
            targetSha256: f.hash,
            targetSize: f.size,
            operation: "replace",
        });
    }
    const overallPayload: PayloadManifest = {
        schemaVersion: 1,
        baseVersion: version,
        targetVersion: version,
        entries: overallPayloadEntries,
    };
    const overallAssetName = `olsync-overall-v${version}.zip`;
    const overallPackage = writePackage(path.join(outputPath, overallAssetName), overallPayload, overallFiles);
    assertPackageSize("overall package", overallPackage.size);

    let diffPackage: { assetName: string; sha256: string; size: number; payloadManifestSha256: string } | undefined;
    if (prevBuildDir) {
        const diffFiles: { name: string; data: Buffer }[] = [];
        const diffPayloadEntries: PayloadManifestEntry[] = [];

        for (const f of allFilesList) {
            if (!matchesAllowlist(f.relativePath, APP_ALLOWLIST)) continue;
            const prev = prevFiles.get(f.relativePath);
            if (!prev || prev.hash !== f.hash) {
                let usePatch = false;
                let patchData: Buffer | undefined;
                if (prev && prev.buffer.length > 0) {
                    patchData = createBinaryPatch(prev.buffer, f.buffer);
                    if (patchData.length < f.buffer.length * 0.8) {
                        usePatch = true;
                    }
                }

                if (usePatch && patchData) {
                    diffFiles.push({ name: f.relativePath, data: patchData });
                    diffPayloadEntries.push({
                        path: f.relativePath,
                        targetSha256: f.hash,
                        targetSize: f.size,
                        operation: "replace",
                        baseSha256: prev.hash,
                        patchSha256: sha256Buffer(patchData),
                        patchSize: patchData.length,
                    });
                } else {
                    diffFiles.push({ name: f.relativePath, data: f.buffer });
                    diffPayloadEntries.push({
                        path: f.relativePath,
                        targetSha256: f.hash,
                        targetSize: f.size,
                        operation: prev ? "replace" : "add",
                        ...(prev ? { baseSha256: prev.hash } : {}),
                    });
                }
            }
        }

        for (const [rel, prev] of prevFiles) {
            if (!matchesAllowlist(rel, APP_ALLOWLIST)) continue;
            if (!allFilesList.some((f) => f.relativePath === rel)) {
                diffPayloadEntries.push({
                    path: rel,
                    targetSha256: "",
                    targetSize: 0,
                    operation: "delete",
                    baseSha256: prev.hash,
                });
            }
        }

        if (diffFiles.length > 0 || diffPayloadEntries.some((e) => e.operation === "delete")) {
            const baseVersion = prevManifestPath ? readManifestPayload(prevManifestPath).version : "0.0.0";
            const diffPayload: PayloadManifest = {
                schemaVersion: 1,
                baseVersion,
                targetVersion: version,
                entries: diffPayloadEntries,
            };
            const assetName = `olsync-diff-v${baseVersion}-to-v${version}.zip`;
            const pkg = writePackage(path.join(outputPath, assetName), diffPayload, diffFiles);
            assertPackageSize("diff package", pkg.size);
            diffPackage = { assetName, ...pkg };
        }
    }

    const fullFiles = allFilesList.map((f) => ({ name: f.relativePath, data: f.buffer }));
    const fullPayloadEntries: PayloadManifestEntry[] = allFilesList.map((f) => ({
        path: f.relativePath,
        targetSha256: f.hash,
        targetSize: f.size,
        operation: "add" as const,
    }));
    const fullPayload: PayloadManifest = {
        schemaVersion: 1,
        baseVersion: version,
        targetVersion: version,
        entries: fullPayloadEntries,
    };
    const fullAssetName = `olsync-full-v${version}.zip`;
    const fullPackage = writePackage(path.join(outputPath, fullAssetName), fullPayload, fullFiles);
    assertPackageSize("full package", fullPackage.size);

    const index: ReleaseUpdateIndexV1 = {
        schemaVersion: 1,
        product: UPDATER_PRODUCT,
        channel: UPDATE_CHANNEL,
        targetVersion: version,
        platform,
        arch,
        electronVersion,
        runtimeFingerprint,
        minimumUpdaterVersion,
        packages: {
            overall: {
                kind: "overall",
                assetName: overallAssetName,
                sha256: overallPackage.sha256,
                size: overallPackage.size,
                targetManifestSha256,
                payloadManifestSha256: overallPackage.payloadManifestSha256,
            },
            full: {
                kind: "full",
                assetName: fullAssetName,
                sha256: fullPackage.sha256,
                size: fullPackage.size,
                targetManifestSha256,
                payloadManifestSha256: fullPackage.payloadManifestSha256,
            },
            ...(diffPackage
                ? {
                      diff: {
                          kind: "diff",
                          assetName: diffPackage.assetName,
                          sha256: diffPackage.sha256,
                          size: diffPackage.size,
                          baseVersion: readManifestPayload(prevManifestPath as string).version,
                          baseManifestSha256: baseManifestSha256 as string,
                          targetManifestSha256,
                          payloadManifestSha256: diffPackage.payloadManifestSha256,
                      },
                  }
                : {}),
        },
    };

    const indexCanonical = canonicalJson(index);
    const indexPath = path.join(outputPath, `olsync-update-index-v${version}.json`);
    fs.writeFileSync(indexPath, indexCanonical);
    console.log(`  Index: ${indexPath}`);

    if (privateKeyPath) {
        const signature = signWithPrivateKey(indexCanonical, privateKeyPath);
        fs.writeFileSync(`${indexPath}.sig`, signature);
        console.log(`  Signature: ${indexPath}.sig`);
    }

    console.log(`  Overall: ${overallAssetName} (${(overallPackage.size / 1024).toFixed(1)} KB)`);
    console.log(`  Full:    ${fullAssetName} (${(fullPackage.size / 1024).toFixed(1)} KB)`);
    if (diffPackage) {
        console.log(`  Diff:    ${diffPackage.assetName} (${(diffPackage.size / 1024).toFixed(1)} KB)`);
    }

    if (autoSnapshot) {
        saveSnapshot(buildDir, version);
    }
}

function buildManifestPayload(
    files: FileEntry[],
    version: string,
    electronVersion: string,
    legacyPatches: Map<string, { hash: string; size: number }> = new Map(),
): ManifestPayload {
    const map: ManifestPayload["files"] = {};
    for (const f of files) {
        map[f.relativePath] = { hash: f.hash, size: f.size };
        const patch = legacyPatches.get(f.relativePath);
        if (patch) {
            map[f.relativePath].patch = patch;
        }
    }
    return {
        version,
        electronVersion,
        files: map,
    };
}

export function assertSigningKeyMatchesEmbedded(privateKeyPath: string): void {
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    const derived = crypto
        .createPublicKey({ key: privateKey, format: "pem", type: "pkcs1" })
        .export({ type: "pkcs1", format: "pem" })
        .toString()
        .replace(/\r\n/g, "\n")
        .trim();
    const expected = PUBLIC_KEY_PEM.replace(/\r\n/g, "\n").trim();
    if (derived !== expected) {
        throw new Error(
            "Signing key does not match the app-embedded PUBLIC_KEY_PEM. " +
                "The legacy manifest signature (old clients) and the GitHub index signature (new clients) would both be rejected.",
        );
    }
}

interface ParsedArgs {
    buildDir: string;
    version: string;
    outputPath: string;
    prevBuildDir: string | undefined;
    privateKeyPath: string | undefined;
    genKeys: string | undefined;
    minimumUpdaterVersion: string;
    platform: "win32" | "darwin" | "linux";
    arch: "x64" | "arm64";
    noSnapshot: boolean;
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    let buildDir = "";
    let version = "";
    let outputPath = "";
    let prevBuildDir: string | undefined;
    let privateKeyPath: string | undefined;
    let genKeys: string | undefined;
    let minimumUpdaterVersion = "1.0.0";
    let platform: "win32" | "darwin" | "linux" = "win32";
    let arch: "x64" | "arm64" = "x64";
    let noSnapshot = false;

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--prev-build-dir":
                prevBuildDir = path.resolve(args[++i]);
                break;
            case "--sign-key":
                privateKeyPath = path.resolve(args[++i]);
                break;
            case "--gen-keys":
                genKeys = args[++i] ? path.resolve(args[i]) : path.resolve("keys");
                break;
            case "--minimum-updater-version":
                minimumUpdaterVersion = args[++i];
                break;
            case "--platform": {
                const raw = args[++i];
                if (!isValidPlatform(raw)) {
                    console.error(`Invalid platform: ${raw}`);
                    process.exit(1);
                }
                platform = raw;
                break;
            }
            case "--arch": {
                const raw = args[++i];
                if (!isValidArch(raw)) {
                    console.error(`Invalid arch: ${raw}`);
                    process.exit(1);
                }
                arch = raw;
                break;
            }
            case "--no-snapshot":
                noSnapshot = true;
                break;
            default:
                if (!buildDir) buildDir = path.resolve(args[i]);
                else if (!version) version = args[i];
                else if (!outputPath) outputPath = path.resolve(args[i]);
        }
    }

    if (genKeys && !buildDir) {
        generateKeyPair(genKeys);
        process.exit(0);
    }

    if (!buildDir || !version) {
        console.error([
            "Usage:",
            "  npx tsx scripts/generate-release.ts <build-dir> <version> [output-dir]",
            "      [--prev-build-dir <dir>]",
            "      [--sign-key <key.pem>]",
            "      [--minimum-updater-version <version>]",
            "      [--platform win32|darwin|linux]",
            "      [--arch x64|arm64]",
            "      [--no-snapshot]",
            "",
            "  npx tsx scripts/generate-release.ts --gen-keys [output-dir]",
        ].join("\n"));
        process.exit(1);
    }

    if (!isValidSemver(version)) {
        console.error(`Invalid version: ${version}`);
        process.exit(1);
    }

    if (!isValidSemver(minimumUpdaterVersion)) {
        console.error(`Invalid minimum-updater-version: ${minimumUpdaterVersion}`);
        process.exit(1);
    }

    if (!isValidPlatform(platform)) {
        console.error(`Invalid platform: ${platform}`);
        process.exit(1);
    }

    if (!isValidArch(arch)) {
        console.error(`Invalid arch: ${arch}`);
        process.exit(1);
    }

    return {
        buildDir,
        version,
        outputPath: outputPath || buildDir,
        prevBuildDir,
        privateKeyPath,
        genKeys,
        minimumUpdaterVersion,
        platform,
        arch,
        noSnapshot,
    };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const opts = parseArgs();
    generateRelease(
        opts.buildDir,
        opts.version,
        opts.outputPath,
        opts.prevBuildDir,
        opts.privateKeyPath,
        opts.minimumUpdaterVersion,
        opts.platform,
        opts.arch,
        !opts.noSnapshot,
    ).catch((error) => {
        console.error("Failed to generate release assets:", error);
        process.exit(1);
    });
}
