import type {
    PayloadManifest,
    ReleaseUpdateIndexV1,
    UpdatePackageDescriptor,
    UpdatePackageKind,
} from "../../../updater-core/types";
import { ProtocolError } from "../../../updater-core/types";

export type {
    InstallResultV1,
    InstallSessionV1,
    PayloadManifest,
    PayloadManifestEntry,
    ProtocolError,
    ReleaseUpdateIndexV1,
    RuntimeFingerprintEntry,
    RuntimeInfo,
    UpdatePackageDescriptor,
    UpdatePackageKind,
} from "../../../updater-core/types";

// Backward-compatible name for the same protocol-level error class.
export { ProtocolError as UpdateError };

export interface UpdateProgress {
    phase: "checking" | "downloading" | "verifying" | "preparing" | "installing" | "error";
    current: number;
    total: number;
    currentFile?: string;
    message?: string;
}

export type UpdateProgressListener = (progress: UpdateProgress) => void;

export type UpdateCheckResult =
    | { status: "upToDate"; currentVersion: string }
    | {
          status: "available";
          currentVersion: string;
          targetVersion: string;
          kind: UpdatePackageKind;
          size: number;
          releasePageUrl: string;
          releaseNotes?: string;
      }
    | {
          status: "manual";
          currentVersion: string;
          targetVersion: string;
          releasePageUrl: string;
          reason: string;
          releaseNotes?: string;
      }
    | { status: "error"; error: string };

export interface PreparedUpdateResult {
    success: boolean;
    error?: string;
}

export interface VerifiedRelease {
    tag: string;
    targetVersion: string;
    releasePageUrl: string;
    index: ReleaseUpdateIndexV1;
    indexAssetName: string;
    indexCanonicalJson: string;
    indexSignature: string;
}

export interface VerifiedPackage {
    kind: UpdatePackageKind;
    descriptor: UpdatePackageDescriptor;
    assetName: string;
    downloadUrl: string;
}

export type UpdateState =
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "available"; release: VerifiedRelease; selected: VerifiedPackage }
    | { phase: "downloading" }
    | {
          phase: "prepared";
          sessionId: string;
          stagingDir: string;
          release: VerifiedRelease;
          selected: VerifiedPackage;
          payloadManifest: PayloadManifest;
      }
    | { phase: "installing"; sessionId: string };
