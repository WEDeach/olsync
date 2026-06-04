import * as crypto from "crypto";
import { app } from "electron";
import * as path from "path";
import { compareVersion, fDevMode } from "../../utils/common";
import {
    copyFile,
    ensureDir,
    outputBatchFileSync,
    outputFileSync,
    pathExistsSync,
    pathJoin,
    pRoot,
    readAsarFile,
    readFileSyncBinary,
    readJson,
    saveJson,
    writeAsarFile,
} from "../../utils/file";
import { createLogger } from "../../utils/logger";

const log = createLogger("Updater");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateSource {
    url: string;
}

export interface UpdateConfig {
    sources: UpdateSource[];
    publicKey?: string;
    concurrency?: number;
}

export interface FileManifest {
    version: string;
    electronVersion?: string;
    signature?: string;
    files: {
        [relativePath: string]: {
            hash: string;
            size: number;
            patch?: {
                hash: string;
                size: number;
            };
        };
    };
}

export interface UpdateDiff {
    needsUpdate: boolean;
    requiresExeUpdate?: boolean;
    version: {
        current: string;
        latest: string;
    };
    electronVersion?: {
        current: string;
        latest: string;
    };
    files: {
        added: string[];
        modified: string[];
        removed: string[];
        patches: { [filePath: string]: boolean };
    };
    totalSize: number;
    optimisticSize?: number;
    versionSkip: boolean;
}

interface ResumeState {
    version: string;
    completedFiles: string[];
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function calculateFileHashAsar(filePath: string): string {
    // For .asar files stored on disk, Electron's fs intercepts reads and
    // treats the file as an archive. Use originalFs (readAsarFile) to get
    // the raw bytes so the hash matches what was downloaded.
    const buffer = filePath.endsWith(".asar") ? readAsarFile(filePath) : readFileSyncBinary(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function calculateBufferHash(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function verifyManifestSignature(manifest: FileManifest, publicKey: string): boolean {
    if (!manifest.signature) return false;
    const { signature, ...payload } = manifest;
    const payloadJson = JSON.stringify(payload);
    try {
        return crypto.verify(
            "sha256",
            Buffer.from(payloadJson),
            { key: publicKey, format: "pem", type: "pkcs1" },
            Buffer.from(signature, "base64"),
        );
    } catch {
        return false;
    }
}

function stripSignature(manifest: FileManifest): FileManifest {
    const { signature, ...rest } = manifest;
    return rest;
}

// ---------------------------------------------------------------------------
// Binary diff (block-based, rsync-style)
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

export function createBinaryPatch(oldBuffer: Buffer, newBuffer: Buffer): Buffer {
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

function applyBinaryPatch(oldBuffer: Buffer, patch: Buffer): Buffer {
    const chunks: Buffer[] = [];
    let pos = 0;

    while (pos < patch.length) {
        const cmd = patch[pos];
        pos += 1;

        if (cmd === 0x00) {
            const len = patch.readUInt32LE(pos);
            pos += 4;
            chunks.push(patch.subarray(pos, pos + len));
            pos += len;
        } else if (cmd === 0x01) {
            const refOffset = patch.readUInt32LE(pos);
            pos += 4;
            const refLen = patch.readUInt32LE(pos);
            pos += 4;
            chunks.push(oldBuffer.subarray(refOffset, refOffset + refLen));
        }
    }

    return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

export class Updater {
    private sources: UpdateSource[];
    private publicKey?: string;
    private concurrency: number;
    private currentManifest: FileManifest | null = null;
    private latestManifestCache: FileManifest | null = null;
    private activeSourceIndex = 0;
    private appPath: string;
    private isDev: boolean;

    constructor(config: UpdateConfig) {
        this.sources = config.sources;
        this.publicKey = config.publicKey;
        this.concurrency = config.concurrency ?? 4;
        this.appPath = pRoot;
        this.isDev = fDevMode;
    }

    // ---- source helpers ----

    private get activeSource(): UpdateSource {
        return this.sources[this.activeSourceIndex];
    }

    private get activeBaseUrl(): string {
        return this.activeSource.url;
    }

    private manifestUrl(): string {
        return `${this.activeBaseUrl}/manifest.json`;
    }

    private fileUrl(relativePath: string): string {
        return `${this.activeBaseUrl}/${relativePath}`;
    }

    private tryNextSource(): boolean {
        this.activeSourceIndex++;
        if (this.activeSourceIndex >= this.sources.length) {
            this.activeSourceIndex = 0;
            return false;
        }
        log.info(`Switching to mirror: ${this.activeBaseUrl}`);
        return true;
    }

    // ---- manifest loading ----

    private async loadCurrentManifest(): Promise<FileManifest | null> {
        try {
            if (this.isDev) {
                const manifestPath = pathJoin(this.appPath, "manifest.json");
                if (pathExistsSync(manifestPath)) {
                    return await readJson(manifestPath);
                }
                const packageJsonPath = pathJoin(this.appPath, "package.json");
                if (pathExistsSync(packageJsonPath)) {
                    const pkg = await readJson(packageJsonPath);
                    return { version: pkg.version || "0.0.0", files: {} };
                }
                return null;
            }
            const manifestPath = pathJoin(this.appPath, "manifest.json");
            if (pathExistsSync(manifestPath)) {
                return await readJson(manifestPath);
            }
            return null;
        } catch (error) {
            log.error("Failed to load current manifest:", error);
            return null;
        }
    }

    private async fetchLatestManifest(): Promise<FileManifest | null> {
        if (this.latestManifestCache) return this.latestManifestCache;

        const url = this.manifestUrl();
        if (url.startsWith("file://")) {
            const localPath = url.replace("file://", "");
            const m = await readJson(localPath);
            if (m) this.latestManifestCache = m;
            return m;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.statusText}`);
        }
        const m: FileManifest = await response.json();
        this.latestManifestCache = m;
        return m;
    }

    // ---- check for updates ----

    public async checkForUpdates(): Promise<UpdateDiff | null> {
        this.latestManifestCache = null;
        this.currentManifest = await this.loadCurrentManifest();
        const latestManifest = await this.fetchLatestManifest();

        if (!latestManifest) return null;

        // signature verification
        if (this.publicKey && latestManifest.signature) {
            if (!verifyManifestSignature(latestManifest, this.publicKey)) {
                log.error("Manifest signature verification failed!");
                return null;
            }
            log.info("Manifest signature verified.");
        }

        const currentVersion = this.currentManifest?.version || "0.0.0";
        const latestVersion = latestManifest.version;

        const currentElectronVersion = this.currentManifest?.electronVersion || "";
        const latestElectronVersion = latestManifest.electronVersion || "";
        const requiresExeUpdate = currentElectronVersion !== latestElectronVersion && !!latestElectronVersion;

        if (compareVersion(currentVersion, latestVersion) >= 0) {
            return {
                needsUpdate: false,
                requiresExeUpdate: false,
                version: { current: currentVersion, latest: latestVersion },
                electronVersion: { current: currentElectronVersion, latest: latestElectronVersion },
                files: { added: [], modified: [], removed: [], patches: {} },
                totalSize: 0,
                versionSkip: false,
            };
        }

        const currentFiles = this.currentManifest?.files || {};
        const latestFiles = latestManifest.files;

        const added: string[] = [];
        const modified: string[] = [];
        const removed: string[] = [];
        const patches: { [filePath: string]: boolean } = {};
        let totalSize = 0;
        let optimisticSize = 0;

        // Detect version skip: patch was generated against previous version,
        // not necessarily against the user's current version.
        // A skip means the patch version differs from (current + 1) in any segment.
        let versionSkip = false;
        let gap = 0;
        if (this.currentManifest) {
            const curParts = currentVersion.split(".").map(Number);
            const latParts = latestVersion.split(".").map(Number);
            const maxLen = Math.max(curParts.length, latParts.length);
            for (let i = 0; i < maxLen; i++) {
                const c = curParts[i] || 0;
                const l = latParts[i] || 0;
                if (l !== c) {
                    gap = l - c;
                    break;
                }
            }
            versionSkip = gap > 1;
        }

        if (versionSkip) {
            log.info(
                `Version skip detected: ${currentVersion} → ${latestVersion} (gap=${String(gap)}), patches may not apply.`,
            );
        }

        for (const [filePath, fileInfo] of Object.entries(latestFiles)) {
            if (filePath.endsWith(".exe") && !requiresExeUpdate) continue;

            if (!currentFiles[filePath]) {
                added.push(filePath);
                totalSize += fileInfo.size;
                optimisticSize += fileInfo.size;
            } else if (currentFiles[filePath].hash !== fileInfo.hash) {
                modified.push(filePath);
                // Always count full size — patch is a download-time optimization
                // that only works when updating from the immediately previous version.
                totalSize += fileInfo.size;
                if (fileInfo.patch && !versionSkip) {
                    patches[filePath] = true;
                    optimisticSize += fileInfo.patch.size;
                } else {
                    patches[filePath] = false;
                    optimisticSize += fileInfo.size;
                }
            } else {
                optimisticSize += fileInfo.size;
            }
        }

        for (const filePath of Object.keys(currentFiles)) {
            if (!latestFiles[filePath]) removed.push(filePath);
        }

        return {
            needsUpdate: added.length > 0 || modified.length > 0 || removed.length > 0,
            requiresExeUpdate,
            version: { current: currentVersion, latest: latestVersion },
            electronVersion: { current: currentElectronVersion, latest: latestElectronVersion },
            files: { added, modified, removed, patches },
            totalSize,
            optimisticSize: optimisticSize < totalSize ? optimisticSize : undefined,
            versionSkip,
        };
    }

    // ---- download & prepare ----

    public async downloadAndPrepareUpdate(
        diff: UpdateDiff,
        onProgress?: (current: number, total: number, currentFile: string) => void,
    ): Promise<string | null> {
        // Use unique temp directory per update session to avoid EBUSY from locked .asar files
        const timestamp = Date.now();
        const tempDir = pathJoin(app.getPath("temp"), `olsync-update-${timestamp}`);
        await ensureDir(tempDir);

        const resumePath = pathJoin(tempDir, "resume.json");
        let resume: ResumeState | null = null;
        try {
            resume = await readJson(resumePath);
            if (resume?.version !== diff.version.latest) resume = null;
        } catch {
            resume = null;
        }

        if (!resume) {
            resume = { version: diff.version.latest, completedFiles: [] };
            await saveJson(resumePath, resume);
        }

        const filesToDownload = [...diff.files.added, ...diff.files.modified].filter(
            (f) => !resume.completedFiles.includes(f),
        );
        const totalFiles = filesToDownload.length + resume.completedFiles.length;
        let completedFiles = resume.completedFiles.length;

        if (onProgress) {
            for (const f of resume.completedFiles) {
                onProgress(completedFiles, totalFiles, f);
            }
        }

        // parallel download with concurrency limit
        const queue = [...filesToDownload];
        const active = new Set<Promise<void>>();

        const downloadOne = async (filePath: string): Promise<void> => {
            await this.downloadSingleFile(tempDir, filePath, diff);
            resume.completedFiles.push(filePath);
            await saveJson(resumePath, resume);
            completedFiles++;
            if (onProgress) onProgress(completedFiles, totalFiles, filePath);
        };

        while (queue.length > 0 || active.size > 0) {
            while (queue.length > 0 && active.size < this.concurrency) {
                const fp = queue.shift();
                if (!fp) break;
                const p = downloadOne(fp).finally(() => active.delete(p));
                active.add(p);
            }
            if (active.size > 0) await Promise.race(active);
        }

        // pre-apply integrity check
        const manifest = this.latestManifestCache ?? (await this.fetchLatestManifest());
        if (manifest) {
            const manifestPath = pathJoin(tempDir, "manifest.json");
            await saveJson(manifestPath, stripSignature(manifest));
        }

        const allOk = await this.verifyTempDir(tempDir, diff);
        if (!allOk) {
            throw new Error("Pre-apply verification failed — downloaded files are corrupted.");
        }

        await this.createUpdateScript(tempDir, diff);

        // cleanup resume file
        try {
            const fs = require("fs");
            fs.unlinkSync(resumePath);
        } catch {}

        return tempDir;
    }

    private async downloadSingleFile(tempDir: string, filePath: string, diff: UpdateDiff): Promise<void> {
        const targetPath = pathJoin(tempDir, filePath);
        await ensureDir(path.dirname(targetPath));

        if (filePath.endsWith(".exe") && !diff.requiresExeUpdate) return;

        // try patch first for modified files
        if (diff.files.modified.includes(filePath) && diff.files.patches[filePath]) {
            const ok = await this.tryDownloadPatch(tempDir, filePath);
            if (ok) return;
            log.info(`Patch failed for ${filePath}, falling back to full download.`);
        }

        // full file download
        const baseUrl = this.activeBaseUrl;
        if (baseUrl.startsWith("file://")) {
            await this.copyFromLocal(tempDir, filePath, baseUrl);
            return;
        }

        let response = await fetch(this.fileUrl(filePath));
        if (!response.ok && this.tryNextSource()) {
            response = await fetch(this.fileUrl(filePath));
        }
        if (!response.ok) {
            throw new Error(`Download failed ${filePath} (HTTP ${response.status})`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // verify hash
        const manifest = this.latestManifestCache ?? (await this.fetchLatestManifest());
        const expected = manifest?.files[filePath];
        if (expected) {
            const actualHash = calculateBufferHash(buffer);
            if (actualHash !== expected.hash) {
                throw new Error(
                    `Hash mismatch for ${filePath}: expected ${expected.hash.slice(0, 8)}..., got ${actualHash.slice(0, 8)}...`,
                );
            }
        }

        if (filePath.endsWith(".asar")) {
            writeAsarFile(targetPath, buffer);
        } else {
            outputFileSync(targetPath, buffer);
        }
    }

    private async tryDownloadPatch(tempDir: string, filePath: string): Promise<boolean> {
        try {
            const patchUrl = `${this.fileUrl(filePath)}.patch`;
            const response = await fetch(patchUrl);
            if (!response.ok) return false;

            const patchBuffer = Buffer.from(await response.arrayBuffer());
            const manifest = this.latestManifestCache ?? (await this.fetchLatestManifest());
            const expected = manifest?.files[filePath]?.patch;
            if (expected) {
                const actualHash = calculateBufferHash(patchBuffer);
                if (actualHash !== expected.hash) {
                    log.warn(`Patch hash mismatch for ${filePath}, discarding.`);
                    return false;
                }
            }

            const oldPath = pathJoin(this.appPath, filePath);
            if (!pathExistsSync(oldPath)) return false;
            const oldBuffer = readFileSyncBinary(oldPath);

            const newBuffer = applyBinaryPatch(oldBuffer, patchBuffer);

            // verify result
            if (expected) {
                const resultHash = calculateBufferHash(newBuffer);
                const fullExpected = manifest?.files[filePath];
                if (fullExpected && resultHash !== fullExpected.hash) {
                    log.warn(`Patched file hash mismatch for ${filePath}.`);
                    return false;
                }
            }

            const targetPath = pathJoin(tempDir, filePath);
            outputFileSync(targetPath, newBuffer);
            return true;
        } catch (e) {
            log.warn(`Patch download/apply failed for ${filePath}:`, e);
            return false;
        }
    }

    private async copyFromLocal(tempDir: string, filePath: string, baseUrl: string): Promise<void> {
        const basePath = baseUrl.replace("file://", "").replace(/\//g, "\\").replace(/\\+$/, "");
        const targetPath = pathJoin(tempDir, filePath);
        let localPath: string;

        if (filePath.endsWith(".asar")) {
            if (basePath.endsWith(".asar")) {
                localPath = basePath;
            } else if (pathExistsSync(pathJoin(basePath, "resources", filePath))) {
                localPath = pathJoin(basePath, "resources", filePath);
            } else if (pathExistsSync(pathJoin(basePath, filePath))) {
                localPath = pathJoin(basePath, filePath);
            } else {
                throw new Error(`Cannot find ${filePath} in ${basePath}`);
            }
        } else {
            localPath = pathJoin(basePath, filePath);
        }

        if (!pathExistsSync(localPath)) {
            throw new Error(`Source file not found: ${localPath}`);
        }

        if (filePath.endsWith(".asar")) {
            const buffer = readAsarFile(localPath);
            writeAsarFile(targetPath, buffer);
        } else {
            await copyFile(localPath, targetPath, { force: true });
        }
    }

    // ---- verify temp dir before applying ----

    private async verifyTempDir(tempDir: string, diff: UpdateDiff): Promise<boolean> {
        const manifest = this.latestManifestCache ?? (await this.fetchLatestManifest());
        if (!manifest) return false;

        const filesToCheck = [...diff.files.added, ...diff.files.modified];
        for (const fp of filesToCheck) {
            const p = pathJoin(tempDir, fp);
            if (!pathExistsSync(p)) {
                log.error(`Missing in temp: ${fp}`);
                return false;
            }
            const expected = manifest.files[fp];
            if (!expected) continue;
            const actualHash = calculateFileHashAsar(p);
            if (actualHash !== expected.hash) {
                log.error(`Temp hash mismatch: ${fp}`);
                return false;
            }
        }
        return true;
    }

    // ---- create update script (atomic with full rollback) ----

    private async createUpdateScript(tempDir: string, diff: UpdateDiff): Promise<void> {
        const scriptPath = pathJoin(tempDir, "update.bat");
        const exePath = process.execPath;
        const exeDir = path.dirname(exePath);
        const asarAppPath = app.getAppPath();
        const backupDir = pathJoin(tempDir, "backup");

        const lines = [
            "@echo off",
            "chcp 65001 > nul",
            "setlocal enabledelayedexpansion",
            "echo [olSync Updater] Waiting for app to close...",
            "timeout /t 3 /nobreak > nul",
            "",
            "echo [olSync Updater] Starting update...",
            "",
            `cd /d "${exeDir}"`,
            "",
            `set "BACKUP_DIR=${backupDir}"`,
            `if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"`,
            "",
        ];

        const filesToUpdate = [...diff.files.added, ...diff.files.modified];

        // Phase 1: backup all files that will be replaced
        lines.push("echo [olSync Updater] Phase 1: Backing up existing files...");
        lines.push("");

        for (const file of filesToUpdate) {
            if (file.endsWith(".asar")) {
                const asarPath = asarAppPath.endsWith(".asar") ? asarAppPath : pathJoin(exeDir, "resources", file);
                const backupPath = pathJoin(backupDir, file);
                const backupParent = path.dirname(backupPath);

                lines.push(`echo   Backing up: ${file}`);
                lines.push(`if exist "${asarPath}" (`);
                lines.push(`    if not exist "${backupParent}" mkdir "${backupParent}"`);
                lines.push(`    copy /Y "${asarPath}" "${backupPath}" > nul`);
                lines.push(`    if errorlevel 1 goto :rollback`);
                lines.push(")");
            } else {
                const targetPath = pathJoin(exeDir, file);
                const backupPath = pathJoin(backupDir, file);
                const backupParent = path.dirname(backupPath);

                lines.push(`echo   Backing up: ${file}`);
                lines.push(`if exist "${targetPath}" (`);
                lines.push(`    if not exist "${backupParent}" mkdir "${backupParent}"`);
                lines.push(`    copy /Y "${targetPath}" "${backupPath}" > nul`);
                lines.push(")");
            }
            lines.push("");
        }

        // Phase 2: apply new files
        lines.push("echo [olSync Updater] Phase 2: Applying new files...");
        lines.push("");

        for (const file of filesToUpdate) {
            const sourcePath = pathJoin(tempDir, file);

            if (file.endsWith(".asar")) {
                const asarPath = asarAppPath.endsWith(".asar") ? asarAppPath : pathJoin(exeDir, "resources", file);

                lines.push(`echo   Replacing: ${file}`);
                lines.push(`copy /Y "${sourcePath}" "${asarPath}" > nul`);
                lines.push("if errorlevel 1 goto :rollback");
            } else {
                const targetPath = pathJoin(exeDir, file);
                const targetDir = path.dirname(targetPath);

                lines.push(`echo   Updating: ${file}`);
                lines.push(`if not exist "${targetDir}" mkdir "${targetDir}"`);
                lines.push(`copy /Y "${sourcePath}" "${targetPath}" > nul`);
                lines.push("if errorlevel 1 goto :rollback");
            }
            lines.push("");
        }

        // external files (manifest.json)
        const externalFiles = ["manifest.json"];
        for (const file of externalFiles) {
            const sourcePath = pathJoin(tempDir, file);
            const targetPath = pathJoin(exeDir, file);
            if (pathExistsSync(sourcePath)) {
                lines.push(`echo   Updating external: ${file}`);
                lines.push(`copy /Y "${sourcePath}" "${targetPath}" > nul`);
                lines.push("");
            }
        }

        // success
        lines.push("echo [olSync Updater] Update applied successfully!");
        lines.push("goto :cleanup");
        lines.push("");

        // rollback
        lines.push(":rollback");
        lines.push("echo [olSync Updater] ERROR: Update failed, rolling back...");
        lines.push("");

        for (const file of filesToUpdate) {
            const backupPath = pathJoin(backupDir, file);

            if (file.endsWith(".asar")) {
                const asarPath = asarAppPath.endsWith(".asar") ? asarAppPath : pathJoin(exeDir, "resources", file);
                lines.push(`if exist "${backupPath}" copy /Y "${backupPath}" "${asarPath}" > nul`);
            } else {
                const targetPath = pathJoin(exeDir, file);
                lines.push(`if exist "${backupPath}" copy /Y "${backupPath}" "${targetPath}" > nul`);
            }
        }
        lines.push("echo [olSync Updater] Rollback complete.");
        lines.push("pause");
        lines.push("exit /b 1");
        lines.push("");

        // cleanup
        lines.push(":cleanup");
        lines.push("echo [olSync Updater] Cleaning up...");
        lines.push(`rd /s /q "${backupDir}" 2>nul`);
        lines.push("");
        lines.push("echo [olSync Updater] Restarting application...");
        lines.push("timeout /t 2 /nobreak > nul");
        lines.push(`start "" "${exePath}"`);
        lines.push("");
        lines.push(`timeout /t 1 /nobreak > nul`);
        lines.push(`rd /s /q "${tempDir}" 2>nul`);
        lines.push("exit");

        outputBatchFileSync(scriptPath, lines.join("\r\n"));
    }

    // ---- execute ----

    public async executeUpdate(tempDir: string): Promise<void> {
        const scriptPath = pathJoin(tempDir, "update.bat");
        const vbsPath = pathJoin(tempDir, "run-update.vbs");
        if (!pathExistsSync(scriptPath)) {
            throw new Error(`Update script not found: ${scriptPath}`);
        }
        try {
            const vbsScript = [
                'Set WshShell = CreateObject("WScript.Shell")',
                `WshShell.Run "cmd /c """"${scriptPath}""""", 0, False`,
                "Set WshShell = Nothing",
            ].join("\r\n");
            outputFileSync(vbsPath, vbsScript);
            const { exec } = require("child_process");
            const command = `wscript.exe "${vbsPath}"`;

            exec(command, (error: any) => {
                if (error) log.error("Failed to execute update script:", error);
            });
        } catch (error) {
            log.error("Failed to spawn update script:", error);
            throw error;
        }

        setTimeout(() => {
            log.info("Quitting application...");
            app.quit();
        }, 1000);
    }

    // ---- verify / version ----

    public async verifyUpdate(): Promise<boolean> {
        try {
            const manifest = await this.loadCurrentManifest();
            if (!manifest) return false;

            for (const [relativePath, fileInfo] of Object.entries(manifest.files)) {
                const filePath = pathJoin(this.appPath, relativePath);
                if (!pathExistsSync(filePath)) {
                    log.error(`Missing file: ${relativePath}`);
                    return false;
                }
                const actualHash = calculateFileHashAsar(filePath);
                if (actualHash !== fileInfo.hash) {
                    log.error(`Hash mismatch for ${relativePath}`);
                    return false;
                }
            }
            return true;
        } catch (error) {
            log.error("Failed to verify update:", error);
            return false;
        }
    }

    public async getCurrentVersion(): Promise<string> {
        try {
            const manifest = await this.loadCurrentManifest();
            return manifest?.version || "0.0.0";
        } catch {
            return "0.0.0";
        }
    }
}
