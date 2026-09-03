import * as crypto from "crypto";
import { app } from "electron";
import * as fs from "fs";
import { resolveAppInstallLayout } from "../../../updater-core/appLayout";
import { compareVersion } from "../../../utils/common";
import { pathJoin } from "../../../utils/file";
import { UPDATE_PACKAGE_MAX_SIZE } from "./constants";
import { GithubProvider } from "./githubProvider";
import { launchUpdateWorker } from "./installer";
import { loadCurrentInstallInfo, selectPackage } from "./packageSelector";
import { stagePackage } from "./stager";
import type {
    PreparedUpdateResult,
    UpdateCheckResult,
    UpdateProgress,
    UpdateProgressListener,
    UpdateState,
} from "./types";
import { UpdateError } from "./types";

export class GithubUpdater {
    private state: UpdateState = { phase: "idle" };
    private provider: GithubProvider;
    private progressListeners: UpdateProgressListener[] = [];

    constructor(provider?: GithubProvider) {
        this.provider = provider ?? new GithubProvider();
    }

    addProgressListener(listener: UpdateProgressListener) {
        this.progressListeners.push(listener);
    }

    private emitProgress(progress: UpdateProgress) {
        for (const listener of this.progressListeners) {
            try {
                listener(progress);
            } catch (_e) {
                // Listener errors should not break the update flow.
            }
        }
    }

    private setState(next: UpdateState) {
        this.state = next;
    }

    async checkForGithubUpdate(): Promise<UpdateCheckResult> {
        if (this.state.phase !== "idle") {
            return { status: "error", error: `Updater is busy (${this.state.phase})` };
        }

        const previous = this.state;
        this.setState({ phase: "checking" });
        this.emitProgress({ phase: "checking", current: 0, total: 0 });

        try {
            const currentInfo = await loadCurrentInstallInfo();
            const release = await this.provider.getLatestRelease();
            const verified = await this.provider.fetchVerifiedIndex(release);

            if (compareVersion(currentInfo.version, verified.targetVersion) >= 0) {
                this.setState(previous);
                return { status: "upToDate", currentVersion: currentInfo.version };
            }

            const selection = selectPackage(verified.index, currentInfo);
            const descriptor = verified.index.packages[selection.kind];
            if (!descriptor) {
                throw new UpdateError(`Release missing package descriptor for ${selection.kind}`, "EPACKAGES");
            }
            const selected = this.provider.buildVerifiedPackage(verified, selection.kind, descriptor);

            this.setState({
                phase: "available",
                release: verified,
                selected,
            });

            if (selection.kind === "full") {
                return {
                    status: "manual",
                    currentVersion: currentInfo.version,
                    targetVersion: verified.targetVersion,
                    releasePageUrl: verified.releasePageUrl,
                    releaseNotes: release.body,
                    reason: selection.reason ?? "In-place update not available",
                };
            }

            return {
                status: "available",
                currentVersion: currentInfo.version,
                targetVersion: verified.targetVersion,
                kind: selection.kind,
                size: selected.descriptor.size,
                releasePageUrl: verified.releasePageUrl,
                releaseNotes: release.body,
            };
        } catch (error) {
            this.setState({ phase: "idle" });
            const message = error instanceof UpdateError ? error.message : String(error);
            return { status: "error", error: message };
        }
    }

    async downloadGithubUpdate(): Promise<PreparedUpdateResult> {
        if (this.state.phase !== "available") {
            return { success: false, error: `No available update (current: ${this.state.phase})` };
        }

        const { release, selected } = this.state;
        const currentInfo = await loadCurrentInstallInfo();
        const sessionId = crypto.randomUUID();
        this.setState({ phase: "downloading" });
        this.emitProgress({
            phase: "downloading",
            current: 0,
            total: selected.descriptor.size,
            currentFile: selected.assetName,
        });

        try {
            if (selected.descriptor.size > UPDATE_PACKAGE_MAX_SIZE) {
                // Size guard should be checked by the provider too; this is a last-ditch sanity check.
                throw new UpdateError("Package size exceeds maximum allowed", "ESIZE");
            }

            const packageBuffer = await this.provider.fetchPackageBuffer(
                selected.downloadUrl,
                selected.descriptor.sha256,
                selected.descriptor.size,
                (downloaded: number) =>
                    this.emitProgress({
                        phase: "downloading",
                        current: downloaded,
                        total: selected.descriptor.size,
                        currentFile: selected.assetName,
                    }),
            );

            this.emitProgress({ phase: "verifying", current: 0, total: 100, currentFile: selected.assetName });
            const appLayout = resolveAppInstallLayout(currentInfo.appAsarPath);
            const { stagingDir, payloadManifest } = await stagePackage(packageBuffer, selected, appLayout);

            this.setState({
                phase: "prepared",
                sessionId,
                stagingDir,
                release,
                selected,
                payloadManifest,
            });

            this.emitProgress({ phase: "preparing", current: 100, total: 100, currentFile: selected.assetName });
            return { success: true };
        } catch (error) {
            this.setState({ phase: "available", release, selected });
            const message = error instanceof UpdateError ? error.message : String(error);
            this.emitProgress({ phase: "error", current: 0, total: 0, message });
            return { success: false, error: message };
        }
    }

    async installPreparedUpdate(): Promise<void> {
        if (this.state.phase !== "prepared") {
            throw new UpdateError(`No prepared update (current: ${this.state.phase})`, "ESTATE");
        }

        const { sessionId, stagingDir, release, selected, payloadManifest } = this.state;
        const currentInfo = await loadCurrentInstallInfo();
        this.setState({ phase: "installing", sessionId });
        this.emitProgress({ phase: "installing", current: 0, total: 100 });

        try {
            await launchUpdateWorker({
                sessionId,
                stagingDir,
                appRoot: currentInfo.appDir,
                appAsarPath: currentInfo.appAsarPath,
                packageKind: selected.kind,
                packageAssetName: selected.assetName,
                payloadManifestSha256: selected.descriptor.payloadManifestSha256,
                releaseIndexCanonicalJson: release.indexCanonicalJson,
                releaseIndexSignature: release.indexSignature,
                payloadManifest,
            });
            // launchUpdateWorker spawns the detached helper and quits the app; control never returns.
        } catch (error) {
            this.setState({ phase: "prepared", sessionId, stagingDir, release, selected, payloadManifest });
            const message = error instanceof UpdateError ? error.message : String(error);
            this.emitProgress({ phase: "error", current: 0, total: 0, message });
            throw new UpdateError(message, "EINSTALL");
        }
    }

    async cleanupOldStagings(): Promise<void> {
        const tempRoot = app.getPath("temp");
        const entries = await fs.promises.readdir(tempRoot, { withFileTypes: true });
        const activeStaging = this.state.phase === "prepared" ? this.state.stagingDir : undefined;

        for (const entry of entries) {
            if (!entry.isDirectory() || !entry.name.startsWith("olsync-update-")) continue;
            const fullPath = pathJoin(tempRoot, entry.name);
            if (fullPath === activeStaging) continue;

            const stat = await fs.promises.stat(fullPath);
            const ageHours = (Date.now() - stat.mtimeMs) / 36e5;
            if (ageHours < 1) continue;

            await fs.promises.rm(fullPath, { recursive: true, force: true }).catch(() => {
                // Best-effort cleanup; do not fail the app if an old staging cannot be removed.
            });
        }
    }
}
