import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileInfo {
    hash: string;
    size: number;
    patch?: {
        hash: string;
        size: number;
    };
}

interface Manifest {
    version: string;
    electronVersion: string;
    signature?: string;
    files: {
        [relativePath: string]: FileInfo;
    };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function calculateFileHash(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function calculateBufferHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// Binary diff (rsync-style block diff)
// ---------------------------------------------------------------------------

const BLOCK_SIZE = 4096;

function computeBlockHashes(buffer: Buffer): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i + BLOCK_SIZE <= buffer.length; i += BLOCK_SIZE) {
        const block = buffer.subarray(i, i + BLOCK_SIZE);
        map.set(calculateBufferHash(block), i);
    }
    return map;
}

function createBinaryPatch(oldBuffer: Buffer, newBuffer: Buffer): Buffer {
    const oldHashes = computeBlockHashes(oldBuffer);
    const chunks: Buffer[] = [];
    let pos = 0;

    while (pos < newBuffer.length) {
        const end = Math.min(pos + BLOCK_SIZE, newBuffer.length);
        const block = newBuffer.subarray(pos, end);
        const hash = calculateBufferHash(block);

        if (oldHashes.has(hash) && block.length === BLOCK_SIZE) {
            const refOffset = oldHashes.get(hash) ?? 0;
            const refLen = Buffer.alloc(4);
            refLen.writeUInt32LE(BLOCK_SIZE, 0);
            const refOff = Buffer.alloc(4);
            refOff.writeUInt32LE(refOffset, 0);
            chunks.push(Buffer.from([0x01]), refOff, refLen);
            pos += BLOCK_SIZE;
        } else {
            const rawLen = Math.min(BLOCK_SIZE, newBuffer.length - pos);
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32LE(rawLen, 0);
            chunks.push(Buffer.from([0x00]), lenBuf, newBuffer.subarray(pos, pos + rawLen));
            pos += rawLen;
        }
    }

    return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

function signManifest(manifest: Manifest, privateKeyPath: string): string {
    const privateKey = fs.readFileSync(privateKeyPath, "utf8");
    const { signature, ...payload } = manifest as Manifest & { signature?: string };
    const payloadJson = JSON.stringify(payload);
    const sign = crypto.sign("sha256", Buffer.from(payloadJson), {
        key: privateKey,
        format: "pem",
        type: "pkcs1",
    });
    return sign.toString("base64");
}

// ---------------------------------------------------------------------------
// Simple tar.gz (no external deps)
// ---------------------------------------------------------------------------

function createTarGz(sourceDir: string, outputPath: string, files: string[]): void {
    // Create a simple tar archive and gzip it
    const tarChunks: Buffer[] = [];

    for (const file of files) {
        const filePath = path.join(sourceDir, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath);
        const stat = fs.statSync(filePath);

        // tar header (512 bytes)
        const header = Buffer.alloc(512);
        const name = Buffer.from(file, "utf8");
        name.copy(header, 0, 0, Math.min(name.length, 100));

        const mode = "0000644";
        Buffer.from(mode).copy(header, 100);

        const uid = "0000000";
        Buffer.from(uid).copy(header, 108);

        const gid = "0000000";
        Buffer.from(gid).copy(header, 116);

        const sizeOctal = stat.size.toString(8).padStart(11, "0");
        Buffer.from(sizeOctal).copy(header, 124);

        const mtimeOctal = Math.floor(stat.mtimeMs / 1000).toString(8).padStart(11, "0");
        Buffer.from(mtimeOctal).copy(header, 136);

        // typeflag: '0' = regular file
        header[156] = 0x30;

        // checksum
        let checksum = 0;
        for (let i = 0; i < 512; i++) checksum += header[i];
        // spaces for checksum field
        for (let i = 148; i < 156; i++) header[i] = 0x20;
        const checksumOctal = checksum.toString(8).padStart(6, "0");
        Buffer.from(checksumOctal).copy(header, 148);
        header[154] = 0x00;

        tarChunks.push(header);

        // file content, padded to 512-byte boundary
        tarChunks.push(content);
        const padding = 512 - (content.length % 512);
        if (padding < 512) {
            tarChunks.push(Buffer.alloc(padding));
        }
    }

    // end-of-archive marker (two zero blocks)
    tarChunks.push(Buffer.alloc(1024));

    const tarBuffer = Buffer.concat(tarChunks);
    const gzBuffer = zlib.gzipSync(tarBuffer);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, gzBuffer);
    console.log(`  Created: ${outputPath} (${(gzBuffer.length / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

function getAllFiles(dirPath: string, arrayOfFiles: string[] = [], baseDir: string = ""): string[] {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles, baseDir || dirPath);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

function shouldExcludeFile(relativePath: string): boolean {
    const excludePatterns = [
        /^manifest\.json$/,
        /^\.git/,
        /^node_modules/,
        /\.map$/,
        /^LICENSES\.chromium\.html$/,
        /^LICENSE\.electron\.txt$/,
        /\.patch$/,
        /\.tar\.gz$/,
    ];

    return excludePatterns.some((pattern) => pattern.test(relativePath));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Snapshot management (auto prev-release)
// ---------------------------------------------------------------------------

const SNAPSHOT_DIR = path.join(__dirname, "..", ".build-snapshots");

function getLatestSnapshot(currentVersion: string): string | undefined {
    if (!fs.existsSync(SNAPSHOT_DIR)) return undefined;

    const entries = fs.readdirSync(SNAPSHOT_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== currentVersion)
        .map((e) => e.name)
        .sort((a, b) => {
            // Sort by version descending
            const pa = a.split(".").map(Number);
            const pb = b.split(".").map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const diff = (pb[i] || 0) - (pa[i] || 0);
                if (diff !== 0) return diff;
            }
            return 0;
        });

    if (entries.length === 0) return undefined;
    return path.join(SNAPSHOT_DIR, entries[0]);
}

function saveSnapshot(buildDir: string, version: string): void {
    const snapshotPath = path.join(SNAPSHOT_DIR, version);
    if (fs.existsSync(snapshotPath)) {
        console.log(`  Snapshot already exists for v${version}, skipping.`);
        throw Error(`Snapshot already exists for v${version}`);
    }
    console.log(`  Saving snapshot for v${version} → ${snapshotPath}`);
    copyDirSync(buildDir, snapshotPath);
}

function copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ---------------------------------------------------------------------------
// Key pair generation
// ---------------------------------------------------------------------------

function generateKeyPair(outDir: string): void {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "pkcs1", format: "pem" },
        privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    fs.mkdirSync(outDir, { recursive: true });
    const privPath = path.join(outDir, "private.pem");
    const pubPath = path.join(outDir, "public.pem");
    fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
    fs.writeFileSync(pubPath, publicKey);
    console.log(`Key pair generated:`);
    console.log(`  Private key: ${privPath}  (keep this secret, never commit!)`);
    console.log(`  Public key:  ${pubPath}   (commit this, or embed the string below into the app)`);
    console.log(`\n--- PUBLIC KEY (copy into state.ts publicKey field) ---`);
    console.log(publicKey);
    console.log(`------------------------------------------------------`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function generateManifest(
    buildDir: string,
    version: string,
    outputPath: string,
    prevBuildDir?: string,
    privateKeyPath?: string,
    autoSnapshot: boolean = true,
) {
    if (!fs.existsSync(buildDir)) {
        console.error(`Build directory not found: ${buildDir}`);
        process.exit(1);
    }

    // Auto-detect previous build from snapshots if not explicitly provided
    if (!prevBuildDir && autoSnapshot) {
        const found = getLatestSnapshot(version);
        if (found) {
            console.log(`  Auto prev-release: ${found}`);
            prevBuildDir = found;
        } else {
            console.log(`  No previous snapshot found, patches will not be generated for this build.`);
        }
    }

    const packageJsonPath = path.join(__dirname, "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const electronVersion = packageJson.devDependencies?.electron?.replace(/[\^~]/, "") || "unknown";

    const allFiles = getAllFiles(buildDir);
    const manifest: Manifest = {
        version,
        electronVersion,
        files: {},
    };

    let processedCount = 0;
    let skippedCount = 0;
    let patchCount = 0;

    for (const filePath of allFiles) {
        const relativePath = path.relative(buildDir, filePath).replace(/\\/g, "/");

        if (shouldExcludeFile(relativePath)) {
            skippedCount++;
            continue;
        }

        const hash = calculateFileHash(filePath);
        const stats = fs.statSync(filePath);

        const fileInfo: FileInfo = {
            hash,
            size: stats.size,
        };

        // Generate binary patch if previous build is available
        if (prevBuildDir) {
            const prevFilePath = path.join(prevBuildDir, relativePath);
            if (fs.existsSync(prevFilePath)) {
                const prevHash = calculateFileHash(prevFilePath);
                if (prevHash !== hash) {
                    const oldBuffer = fs.readFileSync(prevFilePath);
                    const newBuffer = fs.readFileSync(filePath);
                    const patch = createBinaryPatch(oldBuffer, newBuffer);

                    // Only include patch if it's significantly smaller than full file
                    if (patch.length < newBuffer.length * 0.8) {
                        const patchRelPath = `${relativePath}.patch`;
                        const patchOutPath = path.join(outputPath, patchRelPath);
                        fs.mkdirSync(path.dirname(patchOutPath), { recursive: true });
                        fs.writeFileSync(patchOutPath, patch);

                        fileInfo.patch = {
                            hash: calculateBufferHash(patch),
                            size: patch.length,
                        };
                        patchCount++;
                        console.log(
                            `  Patch: ${relativePath} (${(newBuffer.length / 1024).toFixed(1)}KB → ${(patch.length / 1024).toFixed(1)}KB, ${((1 - patch.length / newBuffer.length) * 100).toFixed(0)}% saved)`,
                        );
                    }
                }
            }
        }

        manifest.files[relativePath] = fileInfo;
        processedCount++;
    }

    // Sign manifest if key provided
    if (privateKeyPath) {
        manifest.signature = signManifest(manifest, privateKeyPath);
        console.log("  Manifest signed.");
    }

    // Write manifest
    const manifestPath = path.join(outputPath, "manifest.json");
    const json = JSON.stringify(manifest, null, 4);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, json);
    console.log(`  Manifest: ${manifestPath}`);

    // Create tar.gz archive of all files
    const fileList = Object.keys(manifest.files);
    const tarPath = path.join(outputPath, `update-v${version}.tar.gz`);
    createTarGz(buildDir, tarPath, fileList);

    // Save snapshot for next build
    if (autoSnapshot) {
        saveSnapshot(buildDir, version);
    }

    console.log(
        `\nDone: ${processedCount} files, ${skippedCount} skipped, ${patchCount} patches generated.`,
    );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): {
    buildDir: string;
    version: string;
    outputPath: string;
    prevBuildDir?: string;
    privateKeyPath?: string;
    genKeys?: string;
    noSnapshot?: boolean;
} {
    const args = process.argv.slice(2);
    let buildDir = "";
    let version = "";
    let outputPath = "";
    let prevBuildDir: string | undefined;
    let privateKeyPath: string | undefined;
    let genKeys: string | undefined;
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
            case "--no-snapshot":
                noSnapshot = true;
                break;
            default:
                if (!buildDir) buildDir = path.resolve(args[i]);
                else if (!version) version = args[i];
                else if (!outputPath) outputPath = path.resolve(args[i]);
        }
    }

    // --gen-keys can run standalone
    if (genKeys && !buildDir) {
        generateKeyPair(genKeys);
        process.exit(0);
    }

    if (!buildDir || !version) {
        console.error([
            "Usage:",
            "  npx ts-node scripts/generate-manifest.ts <build-dir> <version> [output-dir]",
            "      [--prev-build-dir <dir>]   override previous build for patch generation",
            "      [--sign-key <key.pem>]      sign manifest with RSA private key",
            "      [--no-snapshot]             skip saving build snapshot",
            "",
            "  npx ts-node scripts/generate-manifest.ts --gen-keys [output-dir]",
            "      generate RSA key pair (one-time setup)",
            "",
            "Examples:",
            "  npx ts-node scripts/generate-manifest.ts ./release/win-unpacked 1.0.5",
            "  npx ts-node scripts/generate-manifest.ts ./release/win-unpacked 1.0.5 --sign-key ./keys/private.pem",
            "  npx ts-node scripts/generate-manifest.ts --gen-keys ./keys",
        ].join("\n"));
        process.exit(1);
    }

    return {
        buildDir,
        version,
        outputPath: outputPath || buildDir,
        prevBuildDir,
        privateKeyPath,
        genKeys,
        noSnapshot,
    };
}

const opts = parseArgs();

if (opts.genKeys) {
    generateKeyPair(opts.genKeys);
    process.exit(0);
}

generateManifest(
    opts.buildDir,
    opts.version,
    opts.outputPath,
    opts.prevBuildDir,
    opts.privateKeyPath,
    !opts.noSnapshot,
).catch((error) => {
    console.error("Failed to generate manifest:", error);
    process.exit(1);
});
