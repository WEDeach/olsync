import { IOsuCollection } from "./types";

export type CollectionSyncType = "default" | "excluded" | "delete";

export const COLLECTION_SYNC_SCHEMA_VERSION = 1;

export interface CollectionSyncSettings {
    schemaVersion: number;
    collections: Record<string, CollectionSyncType>;
}

export interface CollectionSyncBaseline {
    schemaVersion: number;
    syncedAt: number;
    collections: Record<string, string[]>;
}

export interface CollectionSyncContentEntry {
    name: string;
    mapIds: number[];
    unresolvedHashes?: string[];
}

export interface CollectionSyncContent {
    schemaVersion: number;
    exportedAt: number;
    collections: CollectionSyncContentEntry[];
}

export type CollectionSyncKind = "create" | "update" | "in-sync" | "conflict" | "excluded" | "delete";

export type CollectionSyncConflictKind = "content" | "missing-side";

export type CollectionSyncChoice = "union" | "stable" | "lazer";

export interface CollectionSyncConflict {
    kind: CollectionSyncConflictKind;
    stable: string[];
    lazer: string[];
    baseline: string[] | null;
    presentOn?: "stable" | "lazer";
}

export interface CollectionSyncResolution {
    name: string;
    choice: CollectionSyncChoice;
}

export interface CollectionSyncChanges {
    add: string[];
    remove: string[];
}

export interface CollectionSyncCollectionPlan {
    name: string;
    type: CollectionSyncType;
    kind: CollectionSyncKind;
    existsStable: boolean;
    existsLazer: boolean;
    stable: string[];
    lazer: string[];
    baseline: string[] | null;
    target: string[] | null;
    changes: { stable: CollectionSyncChanges; lazer: CollectionSyncChanges };
    conflict: CollectionSyncConflict | null;
    resolution: CollectionSyncChoice | null;
}

export interface CollectionSyncDeletionItem {
    hash: string;
    mapId: number | null;
    installedStable: boolean;
    installedLazer: boolean;
    listedBy: ("stable" | "lazer")[];
}

export interface CollectionSyncPlanStats {
    create: number;
    update: number;
    inSync: number;
    conflict: number;
    excluded: number;
    delete: number;
    deletions: number;
}

export interface CollectionSyncPlan {
    collections: CollectionSyncCollectionPlan[];
    deletions: CollectionSyncDeletionItem[];
    stablePayload: IOsuCollection[];
    lazerPayload: IOsuCollection[];
    stats: CollectionSyncPlanStats;
}

export interface CollectionSyncDeleteOutcome {
    hash: string;
    mapId: number | null;
    client: "stable" | "lazer";
    ok: boolean;
    mode?: "difficulty" | "set";
    reason?: string;
}

export interface CollectionSyncExecuteResult {
    stableWritten: boolean;
    lazerWritten: boolean;
    deletions: CollectionSyncDeleteOutcome[];
    errors: string[];
    backupPaths: string[];
    stableRescanRequired: boolean;
    blocked?: "stable_running";
}

export interface CollectionSyncState {
    hasStable: boolean;
    hasLazer: boolean;
    hasContentOverride: boolean;
    runningStable: boolean;
    settings: CollectionSyncSettings;
    baseline: CollectionSyncBaseline | null;
    notFoundHashes: string[];
    excludeNotFound: boolean;
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    stableError?: string;
    lazerError?: string;
}

export interface CollectionSyncExecuteResponse {
    stale: boolean;
    plan?: CollectionSyncPlan;
    result?: CollectionSyncExecuteResult;
}

export interface CollectionSyncImportSummary {
    collectionCount: number;
    resolvedIds: number;
    unresolvedIds: number;
}

export interface CollectionMergeSelection {
    include?: boolean;
    hashes?: string[];
}

export type CollectionMergeSelections = Record<string, CollectionMergeSelection>;

export type CollectionMergeKind = "create" | "update" | "in-sync" | "skipped";

export interface CollectionMergeHashInfo {
    artist: string;
    title: string;
    difficulty: string;
}

export interface CollectionMergeCollectionPlan {
    name: string;
    existsStable: boolean;
    existsLazer: boolean;
    stable: string[];
    lazer: string[];
    include: boolean;
    kind: CollectionMergeKind;
    target: string[] | null;
    changes: CollectionSyncChanges;
    details: Record<string, CollectionMergeHashInfo>;
}

export interface CollectionMergePlanStats {
    create: number;
    update: number;
    inSync: number;
    skipped: number;
    added: number;
    removed: number;
}

export interface CollectionMergePlan {
    collections: CollectionMergeCollectionPlan[];
    stablePayload: IOsuCollection[];
    stats: CollectionMergePlanStats;
}

export interface CollectionMergeState {
    hasStable: boolean;
    hasLazer: boolean;
    runningStable: boolean;
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    stableError?: string;
    lazerError?: string;
}

export interface CollectionMergeExecuteResult {
    stableWritten: boolean;
    errors: string[];
    backupPaths: string[];
    blocked?: "stable_running";
}

export interface CollectionMergeExecuteResponse {
    stale: boolean;
    plan?: CollectionMergePlan;
    result?: CollectionMergeExecuteResult;
}

export type MissingBeatmapSide = "stable" | "lazer" | "common";

export interface MissingBeatmapCollection {
    name: string;
    total: number;
    missingStable: number;
    missingLazer: number;
    missing: number;
}

export interface MissingBeatmapDownload {
    beatmapsetId: number;
    missingSource: MissingBeatmapSide;
}

export interface MissingBeatmapReport {
    collections: MissingBeatmapCollection[];
    missingHashes: number;
    missingStableHashes: number;
    missingLazerHashes: number;
    downloads: MissingBeatmapDownload[];
    unresolvedHashes: string[];
    notFoundHashes: string[];
    resolvedFromClients: number;
    resolvedFromOnlineDb: number;
    resolvedFromCache: number;
}
