import { app } from "electron";
import { resolveAppInstallLayout } from "../../../updater-core/appLayout";
import { computeRuntimeFingerprint } from "../../../updater-core/fingerprint";
import { compareVersion } from "../../../utils/common";
import { pathJoin, readJson } from "../../../utils/file";
import { APP_ALLOWLIST } from "./constants";
import { sha256CanonicalJson } from "./signature";
import type { ReleaseUpdateIndexV1, RuntimeInfo, UpdatePackageKind } from "./types";

export interface CurrentInstallInfo {
    version: string;
    manifestHash: string;
    runtimeInfo: RuntimeInfo;
    appDir: string;
    appAsarPath: string;
}

export async function loadCurrentInstallInfo(): Promise<CurrentInstallInfo> {
    const layout = resolveAppInstallLayout(app.getAppPath());
    const appDir = layout.appRoot;
    const manifestPath = pathJoin(appDir, "manifest.json");
    const manifest = await readJson(manifestPath);
    const version = manifest?.version || app.getVersion() || "0.0.0";
    const manifestHash = computeManifestHash(manifest);
    const runtimeInfo = await computeRuntimeInfo(appDir);
    return { version, manifestHash, runtimeInfo, appDir, appAsarPath: layout.appAsarPath };
}

function computeManifestHash(manifest: unknown): string {
    if (!manifest || typeof manifest !== "object") return "";
    const { signature: _signature, ...payload } = manifest as Record<string, unknown>;
    if (!payload.version) return "";
    return sha256CanonicalJson(payload);
}

export function selectPackage(
    releaseIndex: ReleaseUpdateIndexV1,
    currentInfo: CurrentInstallInfo,
): { kind: UpdatePackageKind; reason?: string } {
    const diff = releaseIndex.packages.diff;
    if (
        diff &&
        currentInfo.version === diff.baseVersion &&
        currentInfo.manifestHash &&
        currentInfo.manifestHash === diff.baseManifestSha256
    ) {
        return { kind: "diff" };
    }

    if (isOverallCompatible(releaseIndex, currentInfo.runtimeInfo)) {
        return { kind: "overall" };
    }

    return { kind: "full", reason: "Runtime not compatible with in-place update" };
}

export function isOverallCompatible(index: ReleaseUpdateIndexV1, runtime: RuntimeInfo): boolean {
    if (index.platform !== runtime.platform) return false;
    if (index.arch !== runtime.arch) return false;
    if (index.electronVersion !== runtime.electronVersion) return false;
    // We intentionally do not compare the byte-level runtime fingerprint here.
    // electron-builder stamps the product version into the executable, so the
    // main .exe hash changes on every version bump even when the underlying
    // Electron runtime is identical. Relying on platform/arch/electronVersion
    // is sufficient for overall (in-place) updates.
    const updaterVersion = app.getVersion() || "0.0.0";
    if (compareVersion(updaterVersion, index.minimumUpdaterVersion) < 0) return false;
    return true;
}

async function computeRuntimeInfo(appDir: string): Promise<RuntimeInfo> {
    const fingerprint = await computeRuntimeFingerprint(appDir, {
        allowlist: ["**"],
        negateAllowlist: APP_ALLOWLIST,
    });
    return {
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron || "0.0.0",
        runtimeFingerprint: fingerprint,
    };
}
