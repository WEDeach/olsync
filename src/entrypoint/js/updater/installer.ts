import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { ensureDir } from "../../../utils/file";
import type { InstallSessionV1, PayloadManifest, UpdatePackageKind } from "./types";
import { UpdateError } from "./types";

const WORKER_BUNDLE_NAME = "updaterWorker.js";

export interface InstallLauncherInput {
    sessionId: string;
    stagingDir: string;
    appRoot: string;
    appAsarPath: string;
    packageKind: UpdatePackageKind;
    packageAssetName: string;
    payloadManifestSha256: string;
    releaseIndexCanonicalJson: string;
    releaseIndexSignature: string;
    payloadManifest: PayloadManifest;
}

/**
 * Prepare and launch a detached Node/Electron worker process that will apply the
 * staged update after the current app exits.
 *
 * The worker script is copied out of the app bundle into the staging directory
 * before spawn so it is available even while app.asar is being replaced.
 */
export async function launchUpdateWorker(input: InstallLauncherInput): Promise<void> {
    const workerSourcePath = path.join(__dirname, WORKER_BUNDLE_NAME);
    if (!fs.existsSync(workerSourcePath)) {
        throw new UpdateError(`Updater worker bundle not found: ${workerSourcePath}`, "EWORKER");
    }

    const workerPath = path.join(input.stagingDir, WORKER_BUNDLE_NAME);
    const sessionPath = path.join(input.stagingDir, "install-session.json");

    const session: InstallSessionV1 = {
        schemaVersion: 1,
        sessionId: input.sessionId,
        parentPid: process.pid,
        tempRoot: path.resolve(app.getPath("temp")),
        stagingDir: input.stagingDir,
        appRoot: input.appRoot,
        appAsarPath: input.appAsarPath,
        executablePath: process.execPath,
        relaunchArgs: process.argv.slice(1),
        packageKind: input.packageKind,
        packageAssetName: input.packageAssetName,
        payloadManifestSha256: input.payloadManifestSha256,
        releaseIndexCanonicalJson: input.releaseIndexCanonicalJson,
        releaseIndexSignature: input.releaseIndexSignature,
        payloadManifest: input.payloadManifest,
    };

    await ensureDir(input.stagingDir);
    fs.copyFileSync(workerSourcePath, workerPath);
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), "utf8");

    const { spawn } = await import("child_process");
    const child = spawn(process.execPath, [workerPath, sessionPath], {
        detached: true,
        stdio: "ignore",
        shell: false,
        windowsHide: true,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
        },
    });

    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanupListeners();
            reject(new UpdateError("Updater worker failed to start in time", "ETIMEOUT"));
        }, 10_000);

        const cleanupListeners = () => {
            clearTimeout(timeout);
            child.removeListener("spawn", onSpawn);
            child.removeListener("error", onError);
        };

        const onSpawn = () => {
            cleanupListeners();
            child.unref();
            // Give the worker a moment to read the session before the app quits.
            setTimeout(() => app.quit(), 500);
            resolve();
        };

        const onError = (error: Error) => {
            cleanupListeners();
            reject(new UpdateError(`Failed to spawn updater worker: ${error.message}`, "ESPAWN"));
        };

        child.on("spawn", onSpawn);
        child.on("error", onError);
    });
}
