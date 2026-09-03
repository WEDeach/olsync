import { execFile, spawn } from "child_process";
import * as crypto from "crypto";
import * as net from "net";
import * as fs from "original-fs";
import * as os from "os";
import * as path from "path";
import {
    type AppInstallLayout,
    resolveExpectedAppInstallLayout,
    resolveInstallTargetPath,
    sameInstallPath,
} from "../../../updater-core/appLayout";
import { canonicalJson } from "../../../updater-core/canonicalJson";
import { sha256Buffer } from "../../../updater-core/hash";
import { applyBinaryPatch } from "../../../updater-core/patch";
import { matchesAllowlist, normalizeArchivePath } from "../../../updater-core/pathPolicy";
import { verifyRsaSignature } from "../../../updater-core/signature";
import type {
    InstallResultV1,
    InstallSessionV1,
    PayloadManifestEntry,
    ReleaseUpdateIndexV1,
} from "../../../updater-core/types";
import { ProtocolError } from "../../../updater-core/types";
import { isUpdateReadyMarker } from "../../../updater-core/updateReady";
import {
    APP_ALLOWLIST,
    UPDATE_CHANNEL,
    UPDATE_FILE_RETRY_ATTEMPTS,
    UPDATE_FILE_RETRY_DELAY_MS,
    UPDATE_READY_FILE_ENV,
    UPDATE_READY_SESSION_ENV,
    UPDATE_RELAUNCH_GRACE_MS,
    UPDATE_RELAUNCH_POLL_MS,
    UPDATE_RELAUNCH_READY_TIMEOUT_MS,
} from "./constants";

const WORKER_ARG_INDEX = 2;

interface AppliedOperation {
    entry: PayloadManifestEntry;
    targetPath: string;
    backupRelPath: string;
    existedBefore: boolean;
}

async function main(): Promise<void> {
    const sessionPath = process.argv[WORKER_ARG_INDEX];
    if (!sessionPath) {
        console.error("Usage: updateWorker.js <install-session.json>");
        process.exit(1);
    }

    const session = readSession(sessionPath);
    const resultPath = path.join(session.stagingDir, "install-result.json");
    const backupDir = path.join(session.stagingDir, "backup");

    try {
        await waitForParentExit(session.parentPid, session.executablePath, 60_000);
        await applyUpdate(session, backupDir);
        await relaunch(session);
        writeResult(resultPath, {
            schemaVersion: 1,
            sessionId: session.sessionId,
            status: "succeeded",
            completedAt: new Date().toISOString(),
        });
    } catch (error) {
        const code = error instanceof ProtocolError ? error.code : "EUNKNOWN";
        const message = error instanceof Error ? error.message : String(error);
        console.error("Update failed:", message);
        writeResult(resultPath, {
            schemaVersion: 1,
            sessionId: session.sessionId,
            status: code === "EROLLEDBACK" ? "rolledBack" : "failed",
            error: { code, message },
            completedAt: new Date().toISOString(),
        });
        writeWorkerCrashLog(session, code, message);
        process.exit(1);
    }
}

function readSession(sessionPath: string): InstallSessionV1 {
    if (!fs.existsSync(sessionPath)) {
        throw new ProtocolError(`Session file not found: ${sessionPath}`, "ESESSION");
    }
    const raw = fs.readFileSync(sessionPath, "utf8");
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") {
        throw new ProtocolError("Invalid session payload", "ESESSION");
    }
    const parsed = value as InstallSessionV1;
    if (parsed.schemaVersion !== 1) {
        throw new ProtocolError("Unsupported session schema", "ESCHEMA");
    }
    if (
        typeof parsed.sessionId !== "string" ||
        typeof parsed.tempRoot !== "string" ||
        typeof parsed.stagingDir !== "string" ||
        typeof parsed.appRoot !== "string" ||
        typeof parsed.appAsarPath !== "string" ||
        typeof parsed.executablePath !== "string" ||
        typeof parsed.packageKind !== "string" ||
        typeof parsed.packageAssetName !== "string" ||
        typeof parsed.payloadManifestSha256 !== "string" ||
        typeof parsed.releaseIndexCanonicalJson !== "string" ||
        typeof parsed.releaseIndexSignature !== "string" ||
        parsed.sessionId.length === 0 ||
        parsed.tempRoot.length === 0 ||
        typeof parsed.parentPid !== "number" ||
        !Number.isInteger(parsed.parentPid) ||
        parsed.parentPid <= 0 ||
        parsed.stagingDir.length === 0 ||
        parsed.appRoot.length === 0 ||
        parsed.appAsarPath.length === 0 ||
        parsed.executablePath.length === 0 ||
        parsed.packageAssetName.length === 0 ||
        parsed.payloadManifestSha256.length === 0 ||
        parsed.releaseIndexCanonicalJson.length === 0 ||
        parsed.releaseIndexSignature.length === 0 ||
        !/^[0-9a-f]{64}$/i.test(parsed.payloadManifestSha256) ||
        !["diff", "overall", "full"].includes(parsed.packageKind) ||
        !Array.isArray(parsed.relaunchArgs) ||
        !parsed.relaunchArgs.every((arg) => typeof arg === "string") ||
        !parsed.payloadManifest ||
        !Array.isArray(parsed.payloadManifest.entries) ||
        !path.isAbsolute(parsed.tempRoot) ||
        !path.isAbsolute(parsed.stagingDir) ||
        !path.isAbsolute(parsed.appRoot) ||
        !path.isAbsolute(parsed.appAsarPath) ||
        !path.isAbsolute(parsed.executablePath)
    ) {
        throw new ProtocolError("Invalid session payload", "ESESSION");
    }

    const tempRoot = path.resolve(parsed.tempRoot);
    const stagingDir = path.resolve(parsed.stagingDir);
    const sessionFile = path.resolve(sessionPath);
    const sessionRelative = path.relative(stagingDir, sessionFile);
    const stagingRelative = path.relative(tempRoot, stagingDir);
    if (
        sessionRelative !== "install-session.json" ||
        stagingRelative === "" ||
        stagingRelative.startsWith("..") ||
        path.isAbsolute(stagingRelative) ||
        !path.basename(stagingDir).startsWith("olsync-update-")
    ) {
        throw new ProtocolError("Invalid session location", "ESESSION");
    }

    if (!sameInstallPath(parsed.executablePath, process.execPath)) {
        throw new ProtocolError("Session executable does not match worker executable", "ESESSION");
    }

    const expectedLayout = resolveExpectedAppInstallLayout(parsed.executablePath);
    if (
        !sameInstallPath(parsed.appRoot, expectedLayout.appRoot) ||
        !sameInstallPath(parsed.appAsarPath, expectedLayout.appAsarPath)
    ) {
        throw new ProtocolError("Session application paths do not match executable", "ESESSION");
    }

    verifyReleaseMetadata(parsed);
    verifyStagedPayloadManifest(parsed);
    return parsed;
}

function verifyReleaseMetadata(session: InstallSessionV1): void {
    if (!verifyRsaSignature(session.releaseIndexCanonicalJson, session.releaseIndexSignature)) {
        throw new ProtocolError("Release index signature verification failed", "ESIGNATURE");
    }

    let index: ReleaseUpdateIndexV1;
    try {
        index = JSON.parse(session.releaseIndexCanonicalJson) as ReleaseUpdateIndexV1;
    } catch {
        throw new ProtocolError("Invalid signed release index JSON", "EJSON");
    }

    if (index.schemaVersion !== 1 || index.product !== "olsync" || index.channel !== UPDATE_CHANNEL) {
        throw new ProtocolError("Invalid signed release index", "EINDEX");
    }

    const descriptor = index.packages?.[session.packageKind];
    if (
        !descriptor ||
        descriptor.kind !== session.packageKind ||
        descriptor.assetName !== session.packageAssetName ||
        typeof descriptor.payloadManifestSha256 !== "string" ||
        descriptor.payloadManifestSha256.toLowerCase() !== session.payloadManifestSha256.toLowerCase()
    ) {
        throw new ProtocolError("Install session does not match signed release metadata", "ESESSION");
    }
}

function verifyStagedPayloadManifest(session: InstallSessionV1): void {
    const manifestPath = path.join(session.stagingDir, "payload-manifest.json");
    if (!fs.existsSync(manifestPath)) {
        throw new ProtocolError("Signed payload manifest is missing from staging", "EMISSING");
    }

    const raw = fs.readFileSync(manifestPath, "utf8");
    if (sha256Buffer(Buffer.from(raw, "utf8")).toLowerCase() !== session.payloadManifestSha256.toLowerCase()) {
        throw new ProtocolError("Staged payload manifest hash mismatch", "EHASH");
    }

    let stagedManifest: unknown;
    try {
        stagedManifest = JSON.parse(raw) as unknown;
    } catch {
        throw new ProtocolError("Invalid staged payload manifest JSON", "EJSON");
    }

    if (manifestIdentity(stagedManifest) !== manifestIdentity(session.payloadManifest)) {
        throw new ProtocolError("Install session payload manifest mismatch", "ESESSION");
    }
}

function manifestIdentity(value: unknown): string {
    if (!value || typeof value !== "object") {
        throw new ProtocolError("Invalid payload manifest", "ESESSION");
    }

    const manifest = value as Record<string, unknown>;
    if (
        manifest.schemaVersion !== 1 ||
        typeof manifest.baseVersion !== "string" ||
        typeof manifest.targetVersion !== "string" ||
        !Array.isArray(manifest.entries)
    ) {
        throw new ProtocolError("Invalid payload manifest", "ESESSION");
    }

    const entries = manifest.entries.map((valueEntry) => {
        if (!valueEntry || typeof valueEntry !== "object") {
            throw new ProtocolError("Invalid payload manifest entry", "ESESSION");
        }
        const entry = valueEntry as Record<string, unknown>;
        if (
            typeof entry.path !== "string" ||
            typeof entry.targetSha256 !== "string" ||
            typeof entry.targetSize !== "number" ||
            !Number.isInteger(entry.targetSize) ||
            entry.targetSize < 0 ||
            !["add", "replace", "delete"].includes(String(entry.operation)) ||
            (entry.baseSha256 !== undefined && typeof entry.baseSha256 !== "string")
        ) {
            throw new ProtocolError("Invalid payload manifest entry", "ESESSION");
        }

        return {
            path: entry.path,
            targetSha256: entry.targetSha256,
            targetSize: entry.targetSize,
            operation: entry.operation,
            baseSha256: entry.baseSha256,
        };
    });

    return canonicalJson({
        schemaVersion: manifest.schemaVersion,
        baseVersion: manifest.baseVersion,
        targetVersion: manifest.targetVersion,
        entries,
    });
}

async function waitForParentExit(parentPid: number, executablePath: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    const interval = 500;
    while (true) {
        if (!(await isProcessAlive(parentPid, executablePath))) return;
        if (Date.now() - start > timeoutMs) {
            throw new ProtocolError("Timed out waiting for parent process to exit", "ETIMEOUT");
        }
        await delay(interval);
    }
}

async function isProcessAlive(pid: number, executablePath: string): Promise<boolean> {
    if (process.platform !== "win32") {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ESRCH") return false;
            if (code === "EPERM") return true;
            throw new ProtocolError(`Failed to check parent process: ${String(error)}`, "EPROCESS");
        }
    }

    const expectedExeName = path.basename(executablePath).toLowerCase();
    return await new Promise<boolean>((resolve, reject) => {
        execFile(
            "tasklist",
            ["/FI", `PID eq ${String(pid)}`, "/FO", "CSV", "/NH"],
            { windowsHide: true },
            (error, stdout) => {
                if (error) {
                    reject(new ProtocolError(`Failed to check parent process: ${error.message}`, "EPROCESS"));
                    return;
                }
                const hasPid = stdout
                    .split(/\r?\n/)
                    .filter((line) => line.trim() !== "")
                    .some((line) => {
                        const firstField = line.split(",")[0];
                        return firstField?.replace(/"/g, "").toLowerCase() === expectedExeName;
                    });
                resolve(hasPid);
            },
        );
    });
}

function writeWorkerCrashLog(session: InstallSessionV1, code: string, message: string): void {
    try {
        const crashLogPath = path.join(path.dirname(session.executablePath), "worker-crash-log.json");
        fs.writeFileSync(
            crashLogPath,
            JSON.stringify(
                {
                    schemaVersion: 1,
                    sessionId: session.sessionId,
                    executablePath: session.executablePath,
                    error: { code, message },
                    timestamp: new Date().toISOString(),
                },
                null,
                2,
            ),
            "utf8",
        );
    } catch {}
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyUpdate(session: InstallSessionV1, backupDir: string): Promise<void> {
    const applied: AppliedOperation[] = [];
    try {
        validatePayloadManifest(session.payloadManifest, session.appRoot);

        for (const entry of session.payloadManifest.entries) {
            await applyEntry(entry, session, backupDir, applied);
        }

        await verifyTargets(session);
    } catch (error) {
        try {
            await rollback(applied, backupDir);
        } catch (rollbackError) {
            const updateMessage = error instanceof Error ? error.message : String(error);
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            throw new ProtocolError(
                `Update failed and rollback failed: ${updateMessage}; ${rollbackMessage}`,
                "EROLLBACK",
            );
        }

        if (applied.length > 0) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ProtocolError(`Update rolled back: ${message}`, "EROLLEDBACK");
        }
        throw error;
    }
}

function validatePayloadManifest(manifest: InstallSessionV1["payloadManifest"], appRoot: string): void {
    if (manifest.schemaVersion !== 1) {
        throw new ProtocolError("Unsupported payload manifest schema", "ESCHEMA");
    }
    const seen = new Set<string>();
    for (const entry of manifest.entries) {
        if (entry.operation !== "add" && entry.operation !== "replace" && entry.operation !== "delete") {
            throw new ProtocolError(`Invalid operation: ${String(entry.operation)}`, "EOPERATION");
        }
        if (entry.patchSha256 !== undefined || entry.patchSize !== undefined) {
            throw new ProtocolError(`Unnormalized patch entry: ${entry.path}`, "ESESSION");
        }
        if (
            typeof entry.targetSha256 !== "string" ||
            typeof entry.targetSize !== "number" ||
            !Number.isInteger(entry.targetSize) ||
            entry.targetSize < 0 ||
            (entry.operation !== "delete" && !/^[0-9a-f]{64}$/i.test(entry.targetSha256)) ||
            (entry.baseSha256 !== undefined && !/^[0-9a-f]{64}$/i.test(entry.baseSha256))
        ) {
            throw new ProtocolError(`Invalid payload manifest entry: ${entry.path}`, "ESESSION");
        }
        normalizeArchivePath(entry.path, appRoot);
        if (!matchesAllowlist(entry.path, APP_ALLOWLIST)) {
            throw new ProtocolError(`Payload path not in allowlist: ${entry.path}`, "EALLOWLIST");
        }
        const lower = entry.path.toLowerCase();
        if (seen.has(lower)) throw new ProtocolError(`Duplicate path: ${entry.path}`, "EDUPE");
        seen.add(lower);
    }
}

function getSessionLayout(session: InstallSessionV1): AppInstallLayout {
    return {
        appRoot: session.appRoot,
        resourcesDir: path.dirname(session.appAsarPath),
        appAsarPath: session.appAsarPath,
    };
}

async function applyEntry(
    entry: PayloadManifestEntry,
    session: InstallSessionV1,
    backupDir: string,
    applied: AppliedOperation[],
): Promise<void> {
    const targetPath = resolveInstallTargetPath(entry.path, getSessionLayout(session));
    const sourcePath = path.join(session.stagingDir, entry.path);
    const backupRelPath = entry.path.replace(/\//g, path.sep);

    if (entry.operation === "delete") {
        if (!fs.existsSync(targetPath)) return;
        if (entry.baseSha256) {
            const currentHash = await hashFile(targetPath);
            if (currentHash !== entry.baseSha256) {
                throw new ProtocolError(`Base hash mismatch for delete: ${entry.path}`, "EHASH");
            }
        }
        const existedBefore = true;
        await safeCopy(targetPath, path.join(backupDir, backupRelPath));
        fs.unlinkSync(targetPath);
        applied.push({ entry, targetPath, backupRelPath, existedBefore });
        return;
    }

    const existedBefore = fs.existsSync(targetPath);
    if (existedBefore && entry.baseSha256) {
        const currentHash = await hashFile(targetPath);
        if (currentHash !== entry.baseSha256) {
            throw new ProtocolError(`Base hash mismatch for ${entry.operation}: ${entry.path}`, "EHASH");
        }
    }
    if (existedBefore) {
        await safeCopy(targetPath, path.join(backupDir, backupRelPath));
    }

    if (!fs.existsSync(sourcePath)) {
        throw new ProtocolError(`Source file missing in staging: ${entry.path}`, "EMISSING");
    }

    if (entry.patchSha256) {
        const patchBuffer = await fs.promises.readFile(sourcePath);
        if (patchBuffer.length !== (entry.patchSize ?? patchBuffer.length)) {
            throw new ProtocolError(`Patch size mismatch: ${entry.path}`, "ESIZE");
        }
        const patchHash = sha256Buffer(patchBuffer);
        if (patchHash !== entry.patchSha256) {
            throw new ProtocolError(`Patch hash mismatch: ${entry.path}`, "EHASH");
        }

        if (!existedBefore) {
            throw new ProtocolError(`Cannot apply patch to missing target: ${entry.path}`, "EMISSING");
        }
        const oldBuffer = await fs.promises.readFile(targetPath);
        const newBuffer = applyBinaryPatch(oldBuffer, patchBuffer);
        await writeBufferToFile(newBuffer, targetPath);
    } else {
        await replaceFile(sourcePath, targetPath);
    }

    applied.push({ entry, targetPath, backupRelPath, existedBefore });

    const stat = fs.statSync(targetPath);
    if (stat.size !== entry.targetSize) {
        throw new ProtocolError(`Size mismatch after install: ${entry.path}`, "ESIZE");
    }
    const hash = await hashFile(targetPath);
    if (hash !== entry.targetSha256) {
        throw new ProtocolError(`Hash mismatch after install: ${entry.path}`, "EHASH");
    }
}

async function verifyTargets(session: InstallSessionV1): Promise<void> {
    for (const entry of session.payloadManifest.entries) {
        if (entry.operation === "delete") continue;
        const targetPath = resolveInstallTargetPath(entry.path, getSessionLayout(session));
        if (!fs.existsSync(targetPath)) {
            throw new ProtocolError(`Installed file missing: ${entry.path}`, "EMISSING");
        }
        const stat = fs.statSync(targetPath);
        if (stat.size !== entry.targetSize) {
            throw new ProtocolError(`Final size mismatch: ${entry.path}`, "ESIZE");
        }
        const hash = await hashFile(targetPath);
        if (hash !== entry.targetSha256) {
            throw new ProtocolError(`Final hash mismatch: ${entry.path}`, "EHASH");
        }
    }
}

async function rollback(applied: AppliedOperation[], backupDir: string): Promise<void> {
    const failures: string[] = [];

    for (let i = applied.length - 1; i >= 0; i--) {
        const op = applied[i];
        const backupPath = path.join(backupDir, op.backupRelPath);
        try {
            if (op.entry.operation === "delete" || op.existedBefore) {
                if (!fs.existsSync(backupPath)) {
                    throw new ProtocolError(`Rollback backup missing: ${op.entry.path}`, "EROLLBACK");
                }
                await ensureParentDir(op.targetPath);
                await safeCopy(backupPath, op.targetPath);
            } else if (fs.existsSync(op.targetPath)) {
                fs.unlinkSync(op.targetPath);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failure = `${op.entry.path}: ${message}`;
            failures.push(failure);
            console.error("Rollback failed:", failure);
        }
    }

    if (failures.length > 0) {
        throw new ProtocolError(`Rollback incomplete: ${failures.join("; ")}`, "EROLLBACK");
    }
}

async function replaceFile(sourcePath: string, targetPath: string): Promise<void> {
    await ensureParentDir(targetPath);
    const tmpPath = `${targetPath}.olsynctmp`;
    try {
        await safeCopy(sourcePath, tmpPath);
        await renameWithRetry(tmpPath, targetPath);
    } finally {
        await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    }
}

async function writeBufferToFile(buffer: Buffer, targetPath: string): Promise<void> {
    await ensureParentDir(targetPath);
    const tmpPath = `${targetPath}.olsynctmp`;
    try {
        await fs.promises.writeFile(tmpPath, buffer);
        await renameWithRetry(tmpPath, targetPath);
    } finally {
        await fs.promises.rm(tmpPath, { force: true }).catch(() => {});
    }
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < UPDATE_FILE_RETRY_ATTEMPTS; attempt++) {
        try {
            fs.renameSync(source, destination);
            return;
        } catch (error) {
            if (!isRetryableFileError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
            await delay(UPDATE_FILE_RETRY_DELAY_MS * (attempt + 1));
        }
    }
    throw new ProtocolError(`Failed to rename ${source} to ${destination}: ${lastError?.message}`, "EIO");
}

async function safeCopy(source: string, destination: string): Promise<void> {
    await ensureParentDir(destination);
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < UPDATE_FILE_RETRY_ATTEMPTS; attempt++) {
        try {
            fs.copyFileSync(source, destination);
            return;
        } catch (error) {
            if (!isRetryableFileError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
            await delay(UPDATE_FILE_RETRY_DELAY_MS * (attempt + 1));
        }
    }
    throw new ProtocolError(`Failed to copy ${source} to ${destination}: ${lastError?.message}`, "EIO");
}

function isRetryableFileError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

async function ensureParentDir(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
}

async function hashFile(filePath: string): Promise<string> {
    const data = await fs.promises.readFile(filePath);
    return sha256Buffer(data);
}

function getDirectoryLockPipePath(executablePath: string): string {
    const dir = path.dirname(executablePath);
    const dirHash = crypto.createHash("md5").update(dir.toLowerCase()).digest("hex").slice(0, 16);
    return process.platform === "win32"
        ? `\\\\.\\pipe\\olsync-${dirHash}`
        : path.join(os.tmpdir(), `olsync-${dirHash}.sock`);
}

function canListenOnDirectoryLockPipe(pipePath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => {
            server.close();
            resolve(false);
        });
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(pipePath);
    });
}

async function waitForDirectoryLockRelease(executablePath: string, timeoutMs: number): Promise<void> {
    const pipePath = getDirectoryLockPipePath(executablePath);
    const start = Date.now();
    while (true) {
        const canListen = await canListenOnDirectoryLockPipe(pipePath);
        if (canListen) {
            // Re-check after a short delay to avoid racing a pipe that is still being released.
            await delay(300);
            const stillCanListen = await canListenOnDirectoryLockPipe(pipePath);
            if (stillCanListen) return;
        }
        if (Date.now() - start > timeoutMs) {
            throw new ProtocolError(`Timed out waiting for directory lock to release: ${pipePath}`, "ETIMEOUT");
        }
        await delay(500);
    }
}

function writeRelaunchLog(logPath: string, log: unknown): void {
    try {
        fs.writeFileSync(logPath, JSON.stringify(log, null, 2), "utf8");
    } catch {
        // Best-effort log for diagnostics.
    }
}

async function relaunch(session: InstallSessionV1): Promise<void> {
    const logDir = path.dirname(session.executablePath);
    const logPath = path.join(logDir, "relaunch-log.json");
    const readyPath = path.join(session.stagingDir, "relaunch-ready.json");
    const log: Record<string, unknown> = {
        stagedForRelaunchAt: new Date().toISOString(),
        logDir,
        executablePath: session.executablePath,
        args: session.relaunchArgs,
    };

    try {
        await waitForDirectoryLockRelease(session.executablePath, 30_000);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.success = false;
        log.errorCode = "ELOCK";
        log.error = message;
        writeRelaunchLog(logPath, log);
        throw new ProtocolError(message, "ELOCK");
    }

    await delay(1000);
    await fs.promises.rm(readyPath, { force: true }).catch(() => {});

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env[UPDATE_READY_FILE_ENV] = readyPath;
    env[UPDATE_READY_SESSION_ENV] = session.sessionId;

    let child: ReturnType<typeof spawn>;
    try {
        child = spawn(session.executablePath, session.relaunchArgs, {
            detached: true,
            stdio: "ignore",
            shell: false,
            windowsHide: true,
            env,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.success = false;
        log.errorCode = "ESPAWN";
        log.error = message;
        writeRelaunchLog(logPath, log);
        throw new ProtocolError(`Failed to spawn relaunched app: ${message}`, "ESPAWN");
    }

    return await new Promise<void>((resolve, reject) => {
        const startMs = Date.now();
        let settled = false;
        let pollTimer: NodeJS.Timeout | null = null;
        let graceTimer: NodeJS.Timeout | null = null;

        const cleanup = () => {
            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }
            if (graceTimer) {
                clearTimeout(graceTimer);
                graceTimer = null;
            }
            clearTimeout(readinessTimeout);
            child.removeListener("error", onError);
            child.removeListener("exit", onExit);
            child.removeListener("spawn", onSpawn);
        };

        const fail = (message: string, code: string) => {
            if (settled) return;
            settled = true;
            log.success = false;
            log.errorCode = code;
            log.error = message;
            writeRelaunchLog(logPath, log);
            cleanup();
            child.unref();
            reject(new ProtocolError(message, code));
        };

        const finish = () => {
            if (settled) return;
            settled = true;
            log.aliveMs = Date.now() - startMs;
            log.success = true;
            writeRelaunchLog(logPath, log);
            cleanup();
            child.unref();
            resolve();
        };

        const pollReady = async () => {
            if (settled) return;
            try {
                const raw = await fs.promises.readFile(readyPath, "utf8");
                const marker = JSON.parse(raw) as unknown;
                if (isUpdateReadyMarker(marker, session.sessionId)) {
                    log.ready = true;
                    log.readyAt = marker.readyAt;
                    writeRelaunchLog(logPath, log);
                    graceTimer = setTimeout(finish, UPDATE_RELAUNCH_GRACE_MS);
                    return;
                }
            } catch {}
            if (!settled) {
                pollTimer = setTimeout(() => void pollReady(), UPDATE_RELAUNCH_POLL_MS);
            }
        };

        const onError = (error: Error) => {
            fail(`Relaunched app failed to start: ${error.message}`, "ESPAWN");
        };

        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            log.exitCode = code;
            log.exitSignal = signal;
            log.aliveMs = Date.now() - startMs;
            const suffix = signal ? `, signal ${signal}` : "";
            fail(`Relaunched app exited before readiness with code ${String(code)}${suffix}`, "ERELAUNCH");
        };

        const onSpawn = () => {
            log.spawned = true;
            log.pid = child.pid;
            log.spawnedAt = new Date().toISOString();
            writeRelaunchLog(logPath, log);
            void pollReady();
        };

        const readinessTimeout = setTimeout(() => {
            fail("Relaunched app did not signal readiness in time", "EREADY");
        }, UPDATE_RELAUNCH_READY_TIMEOUT_MS);

        child.on("error", onError);
        child.on("exit", onExit);
        child.on("spawn", onSpawn);
    });
}

function writeResult(resultPath: string, result: InstallResultV1): void {
    try {
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
    } catch (e) {
        console.error("Failed to write install result:", e);
    }
}

main().catch((error) => {
    console.error("Updater worker crashed:", error);
    process.exit(1);
});
