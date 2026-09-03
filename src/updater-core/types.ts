export type UpdatePackageKind = "diff" | "overall" | "full";

export interface UpdatePackageDescriptor {
    kind: UpdatePackageKind;
    assetName: string;
    sha256: string;
    size: number;
    baseVersion?: string;
    baseManifestSha256?: string;
    targetManifestSha256: string;
    payloadManifestSha256: string;
}

export interface ReleaseUpdateIndexV1 {
    schemaVersion: 1;
    product: "olsync";
    channel: "stable";
    targetVersion: string;
    platform: "win32" | "darwin" | "linux";
    arch: "x64" | "arm64";
    electronVersion: string;
    runtimeFingerprint: string;
    minimumUpdaterVersion: string;
    packages: {
        diff?: UpdatePackageDescriptor;
        overall: UpdatePackageDescriptor;
        full: UpdatePackageDescriptor;
    };
}

export interface PayloadManifestEntry {
    path: string;
    targetSha256: string;
    targetSize: number;
    operation: "add" | "replace" | "delete";
    baseSha256?: string;
    patchSha256?: string;
    patchSize?: number;
}

export interface PayloadManifest {
    schemaVersion: 1;
    baseVersion: string;
    targetVersion: string;
    entries: PayloadManifestEntry[];
}

export interface RuntimeInfo {
    platform: string;
    arch: string;
    electronVersion: string;
    runtimeFingerprint: string;
}

export interface RuntimeFingerprintEntry {
    relativePath: string;
    size: number;
    hash: string;
}

export interface InstallSessionV1 {
    schemaVersion: 1;
    sessionId: string;
    parentPid: number;
    tempRoot: string;
    stagingDir: string;
    appRoot: string;
    appAsarPath: string;
    executablePath: string;
    relaunchArgs: string[];
    packageKind: UpdatePackageKind;
    packageAssetName: string;
    payloadManifestSha256: string;
    releaseIndexCanonicalJson: string;
    releaseIndexSignature: string;
    payloadManifest: PayloadManifest;
}

export interface InstallResultV1 {
    schemaVersion: 1;
    sessionId: string;
    status: "succeeded" | "rolledBack" | "failed";
    error?: { code: string; message: string };
    completedAt: string;
}

export class ProtocolError extends Error {
    constructor(
        message: string,
        public readonly code: string,
    ) {
        super(message);
        this.name = "ProtocolError";
    }
}
