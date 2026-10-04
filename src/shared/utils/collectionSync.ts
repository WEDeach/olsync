import {
    COLLECTION_SYNC_SCHEMA_VERSION,
    CollectionSyncBaseline,
    CollectionSyncChanges,
    CollectionSyncChoice,
    CollectionSyncCollectionPlan,
    CollectionSyncConflict,
    CollectionSyncContent,
    CollectionSyncContentEntry,
    CollectionSyncDeletionItem,
    CollectionSyncKind,
    CollectionSyncPlan,
    CollectionSyncPlanStats,
    CollectionSyncResolution,
    CollectionSyncSettings,
    CollectionSyncType,
    MissingBeatmapCollection,
    MissingBeatmapSide,
} from "../../defines/collection_sync";
import { IOsuCollection } from "../../defines/types";

const SYNC_TYPES: CollectionSyncType[] = ["default", "excluded", "delete"];

export function isCollectionSyncType(value: unknown): value is CollectionSyncType {
    return typeof value === "string" && (SYNC_TYPES as string[]).includes(value);
}

export function sortHashes(values: Iterable<string>): string[] {
    return Array.from(new Set(values)).sort();
}

function sameHashes(a: readonly string[], b: readonly string[]): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    for (const value of b) {
        if (!set.has(value)) return false;
    }
    return true;
}

function unionHashes(a: readonly string[], b: readonly string[]): string[] {
    const set = new Set(a);
    for (const value of b) set.add(value);
    return sortHashes(set);
}

function toLowerHashSet(values: Iterable<string> | null | undefined): Set<string> {
    const set = new Set<string>();
    for (const value of values ?? []) {
        if (typeof value === "string" && value.length > 0) set.add(value.toLowerCase());
    }
    return set;
}

function emptyChanges(): CollectionSyncChanges {
    return { add: [], remove: [] };
}

function computeChanges(current: readonly string[], target: string[] | null): CollectionSyncChanges {
    if (target === null) return emptyChanges();
    const currentSet = new Set(current);
    const targetSet = new Set(target);
    return {
        add: target.filter((hash) => !currentSet.has(hash)),
        remove: current.filter((hash) => !targetSet.has(hash)),
    };
}

export function normalizeCollections(input: IOsuCollection[] | null | undefined): IOsuCollection[] {
    const out: IOsuCollection[] = [];
    const seen = new Set<string>();
    for (const entry of input ?? []) {
        if (!entry || typeof entry.name !== "string") continue;
        const name = entry.name.trim();
        if (name.length === 0 || seen.has(name)) continue;
        seen.add(name);
        const maps = Array.isArray(entry.maps)
            ? entry.maps
                  .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
                  .map((hash) => hash.toLowerCase())
            : [];
        out.push({ name, maps: sortHashes(maps) });
    }
    return out;
}

export function resolveCollectionType(settings: CollectionSyncSettings | null, name: string): CollectionSyncType {
    const value = settings?.collections ? settings.collections[name] : undefined;
    return isCollectionSyncType(value) ? value : "default";
}

function targetForChoice(choice: CollectionSyncChoice, stableHashes: string[], lazerHashes: string[]): string[] {
    if (choice === "union") return unionHashes(stableHashes, lazerHashes);
    if (choice === "stable") return sortHashes(stableHashes);
    return sortHashes(lazerHashes);
}

interface TargetDecision {
    kind: CollectionSyncKind;
    target: string[] | null;
    conflict: CollectionSyncConflict | null;
}

function decideDefaultTarget(
    stableHashes: string[],
    lazerHashes: string[],
    existsStable: boolean,
    existsLazer: boolean,
    base: string[] | null,
    resolution: CollectionSyncChoice | null,
): TargetDecision {
    const bothExist = existsStable && existsLazer;

    if (bothExist && sameHashes(stableHashes, lazerHashes)) {
        return { kind: "in-sync", target: sortHashes(stableHashes), conflict: null };
    }

    let conflict: CollectionSyncConflict | null = null;
    if (!bothExist) {
        if (base === null) {
            return {
                kind: "create",
                target: sortHashes(existsStable ? stableHashes : lazerHashes),
                conflict: null,
            };
        }
        conflict = {
            kind: "missing-side",
            stable: stableHashes,
            lazer: lazerHashes,
            baseline: base,
            presentOn: existsStable ? "stable" : "lazer",
        };
    } else if (base === null) {
        conflict = { kind: "content", stable: stableHashes, lazer: lazerHashes, baseline: null };
    } else {
        const stableChanged = !sameHashes(stableHashes, base);
        const lazerChanged = !sameHashes(lazerHashes, base);
        if (stableChanged === lazerChanged) {
            conflict = { kind: "content", stable: stableHashes, lazer: lazerHashes, baseline: base };
        } else {
            return {
                kind: "update",
                target: sortHashes(stableChanged ? stableHashes : lazerHashes),
                conflict: null,
            };
        }
    }

    if (resolution) {
        return { kind: "update", target: targetForChoice(resolution, stableHashes, lazerHashes), conflict };
    }
    return { kind: "conflict", target: null, conflict };
}

export interface CollectionSyncPlanInput {
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    settings: CollectionSyncSettings | null;
    baseline: CollectionSyncBaseline | null;
    resolutions?: CollectionSyncResolution[];
    contentOverride?: Record<string, string[]>;
    excludeHashes?: Iterable<string>;
    installedStable?: Iterable<string>;
    installedLazer?: Iterable<string>;
    mapIdByHash?: ReadonlyMap<string, number>;
}

export interface MissingBeatmapCollectionCounts extends MissingBeatmapCollection {
    name: string;
}

export interface MissingBeatmapInput {
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    installedStable: Iterable<string>;
    installedLazer: Iterable<string>;
    settings?: CollectionSyncSettings | null;
}

export interface MissingBeatmapResult {
    collections: MissingBeatmapCollectionCounts[];
    sideByHash: Map<string, MissingBeatmapSide>;
    missingStableHashes: Set<string>;
    missingLazerHashes: Set<string>;
}

export function collectMissingBeatmaps(input: MissingBeatmapInput): MissingBeatmapResult {
    const stable = normalizeCollections(input.stable);
    const lazer = normalizeCollections(input.lazer);
    const installedStable = toLowerHashSet(input.installedStable);
    const installedLazer = toLowerHashSet(input.installedLazer);

    const stableByName = new Map(stable.map((entry) => [entry.name, entry.maps]));
    const lazerByName = new Map(lazer.map((entry) => [entry.name, entry.maps]));

    const names: string[] = [];
    const seen = new Set<string>();
    for (const entry of [...stable, ...lazer]) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        names.push(entry.name);
    }

    const collections: MissingBeatmapCollectionCounts[] = [];
    const sideByHash = new Map<string, MissingBeatmapSide>();
    const missingStableHashes = new Set<string>();
    const missingLazerHashes = new Set<string>();

    for (const name of names) {
        if (resolveCollectionType(input.settings ?? null, name) !== "default") continue;

        const stableHashes = stableByName.get(name) ?? [];
        const lazerHashes = lazerByName.get(name) ?? [];

        const stableMissing: string[] = [];
        for (const hash of stableHashes) {
            if (installedStable.has(hash)) continue;
            stableMissing.push(hash);
            missingStableHashes.add(hash);
        }
        const lazerMissing: string[] = [];
        for (const hash of lazerHashes) {
            if (installedLazer.has(hash)) continue;
            lazerMissing.push(hash);
            missingLazerHashes.add(hash);
        }

        const union = new Set<string>([...stableMissing, ...lazerMissing]);
        const stableMissingSet = new Set(stableMissing);
        const lazerMissingSet = new Set(lazerMissing);
        for (const hash of union) {
            const stableLacks = stableMissingSet.has(hash);
            const lazerLacks = lazerMissingSet.has(hash);
            sideByHash.set(hash, stableLacks && lazerLacks ? "common" : stableLacks ? "stable" : "lazer");
        }

        collections.push({
            name,
            total: new Set([...stableHashes, ...lazerHashes]).size,
            missingStable: stableMissing.length,
            missingLazer: lazerMissing.length,
            missing: union.size,
        });
    }

    return { collections, sideByHash, missingStableHashes, missingLazerHashes };
}

function collectDeletions(
    target: Map<string, CollectionSyncDeletionItem>,
    hash: string,
    client: "stable" | "lazer",
    installedStable: Set<string>,
    installedLazer: Set<string>,
    mapIdByHash: ReadonlyMap<string, number>,
) {
    const onStable = installedStable.has(hash);
    const onLazer = installedLazer.has(hash);
    if (!onStable && !onLazer) return;

    const existing = target.get(hash);
    if (existing) {
        if (!existing.listedBy.includes(client)) existing.listedBy.push(client);
        return;
    }
    const mapId = mapIdByHash.get(hash);
    target.set(hash, {
        hash,
        mapId: typeof mapId === "number" && mapId > 0 ? mapId : null,
        installedStable: onStable,
        installedLazer: onLazer,
        listedBy: [client],
    });
}

export function buildCollectionSyncPlan(input: CollectionSyncPlanInput): CollectionSyncPlan {
    const stable = normalizeCollections(input.stable);
    const lazer = normalizeCollections(input.lazer);
    const baseline = input.baseline?.collections ?? null;
    const override = input.contentOverride ?? {};
    const installedStable = toLowerHashSet(input.installedStable);
    const installedLazer = toLowerHashSet(input.installedLazer);
    const excluded = toLowerHashSet(input.excludeHashes);
    const mapIdByHash = input.mapIdByHash ?? new Map<string, number>();

    const resolutions = new Map<string, CollectionSyncChoice>();
    for (const item of input.resolutions ?? []) {
        if (item && typeof item.name === "string" && item.name.length > 0) {
            resolutions.set(item.name, item.choice);
        }
    }

    const stableByName = new Map(stable.map((entry) => [entry.name, entry]));
    const lazerByName = new Map(lazer.map((entry) => [entry.name, entry]));

    const order: string[] = [];
    const ordered = new Set<string>();
    for (const entry of [...stable, ...lazer]) {
        if (ordered.has(entry.name)) continue;
        ordered.add(entry.name);
        order.push(entry.name);
    }
    for (const name of Object.keys(override)) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || ordered.has(trimmed)) continue;
        ordered.add(trimmed);
        order.push(trimmed);
    }

    const collections: CollectionSyncCollectionPlan[] = [];
    const deletionMap = new Map<string, CollectionSyncDeletionItem>();

    for (const name of order) {
        const stableEntry = stableByName.get(name);
        const lazerEntry = lazerByName.get(name);
        const stableHashes = stableEntry ? stableEntry.maps : [];
        const lazerHashes = lazerEntry ? lazerEntry.maps : [];
        const existsStable = stableEntry !== undefined;
        const existsLazer = lazerEntry !== undefined;
        const type = resolveCollectionType(input.settings, name);
        const base = baseline && Object.hasOwn(baseline, name) ? sortHashes(baseline[name] ?? []) : null;

        if (type === "delete") {
            for (const hash of stableHashes) {
                collectDeletions(deletionMap, hash, "stable", installedStable, installedLazer, mapIdByHash);
            }
            for (const hash of lazerHashes) {
                collectDeletions(deletionMap, hash, "lazer", installedStable, installedLazer, mapIdByHash);
            }
            collections.push({
                name,
                type,
                kind: "delete",
                existsStable,
                existsLazer,
                stable: stableHashes,
                lazer: lazerHashes,
                baseline: base,
                target: null,
                changes: { stable: emptyChanges(), lazer: emptyChanges() },
                conflict: null,
                resolution: null,
            });
            continue;
        }

        if (type === "excluded") {
            collections.push({
                name,
                type,
                kind: "excluded",
                existsStable,
                existsLazer,
                stable: stableHashes,
                lazer: lazerHashes,
                baseline: base,
                target: null,
                changes: { stable: emptyChanges(), lazer: emptyChanges() },
                conflict: null,
                resolution: null,
            });
            continue;
        }

        const resolution = resolutions.get(name) ?? null;
        const decision = decideDefaultTarget(stableHashes, lazerHashes, existsStable, existsLazer, base, resolution);
        const overrideHashes = Object.hasOwn(override, name) ? sortHashes(override[name] ?? []) : null;
        if (!existsStable && !existsLazer && overrideHashes === null) continue;
        const rawTarget = overrideHashes ?? decision.target;
        const target =
            rawTarget === null || excluded.size === 0 ? rawTarget : rawTarget.filter((hash) => !excluded.has(hash));
        const kind =
            overrideHashes === null
                ? rawTarget !== null && target !== null && target.length !== rawTarget.length
                    ? "update"
                    : decision.kind
                : "update";

        collections.push({
            name,
            type,
            kind,
            existsStable,
            existsLazer,
            stable: stableHashes,
            lazer: lazerHashes,
            baseline: base,
            target,
            changes: {
                stable: computeChanges(stableHashes, target),
                lazer: computeChanges(lazerHashes, target),
            },
            conflict: decision.conflict,
            resolution,
        });
    }

    const planByName = new Map(collections.map((entry) => [entry.name, entry]));
    const buildPayload = (side: "stable" | "lazer", source: IOsuCollection[]): IOsuCollection[] => {
        const out: IOsuCollection[] = [];
        const emitted = new Set<string>();
        const emit = (name: string) => {
            if (emitted.has(name)) return;
            const plan = planByName.get(name);
            if (!plan) return;
            emitted.add(name);
            if (plan.target !== null) {
                out.push({ name, maps: plan.target });
                return;
            }
            const exists = side === "stable" ? plan.existsStable : plan.existsLazer;
            if (!exists) return;
            out.push({ name, maps: side === "stable" ? plan.stable : plan.lazer });
        };
        for (const entry of source) emit(entry.name);
        for (const name of order) emit(name);
        return out;
    };

    const deletions = Array.from(deletionMap.values()).sort((a, b) => a.hash.localeCompare(b.hash));

    const stats: CollectionSyncPlanStats = {
        create: 0,
        update: 0,
        inSync: 0,
        conflict: 0,
        excluded: 0,
        delete: 0,
        deletions: deletions.length,
    };
    for (const entry of collections) {
        if (entry.kind === "create") stats.create += 1;
        else if (entry.kind === "update") stats.update += 1;
        else if (entry.kind === "in-sync") stats.inSync += 1;
        else if (entry.kind === "conflict") stats.conflict += 1;
        else if (entry.kind === "excluded") stats.excluded += 1;
        else if (entry.kind === "delete") stats.delete += 1;
    }

    return {
        collections,
        deletions,
        stablePayload: buildPayload("stable", stable),
        lazerPayload: buildPayload("lazer", lazer),
        stats,
    };
}

export function collectDeletionListHashes(
    stable: IOsuCollection[],
    lazer: IOsuCollection[],
    settings: CollectionSyncSettings | null,
): string[] {
    const hashes = new Set<string>();
    for (const entry of [...normalizeCollections(stable), ...normalizeCollections(lazer)]) {
        if (resolveCollectionType(settings, entry.name) !== "delete") continue;
        for (const hash of entry.maps) hashes.add(hash);
    }
    return sortHashes(hashes);
}

export function buildBaselineFromPlan(
    plan: CollectionSyncPlan,
    previous: CollectionSyncBaseline | null,
    syncedAt: number,
): CollectionSyncBaseline {
    const collections: Record<string, string[]> = {};
    for (const entry of plan.collections) {
        if (entry.type !== "default") continue;
        if (entry.target !== null) {
            collections[entry.name] = entry.target;
            continue;
        }
        const kept = previous?.collections ? previous.collections[entry.name] : undefined;
        if (kept) collections[entry.name] = sortHashes(kept);
    }
    return { schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, syncedAt, collections };
}

export function buildContentFromPlan(
    plan: CollectionSyncPlan,
    mapIdByHash: ReadonlyMap<string, number>,
    exportedAt: number,
): CollectionSyncContent {
    const collections: CollectionSyncContentEntry[] = [];
    for (const entry of plan.collections) {
        if (entry.type !== "default") continue;
        if (entry.target === null) continue;
        const mapIds: number[] = [];
        const unresolvedHashes: string[] = [];
        for (const hash of entry.target) {
            const mapId = mapIdByHash.get(hash);
            if (typeof mapId === "number" && mapId > 0) mapIds.push(mapId);
            else unresolvedHashes.push(hash);
        }
        const content: CollectionSyncContentEntry = {
            name: entry.name,
            mapIds: mapIds.sort((a, b) => a - b),
        };
        if (unresolvedHashes.length > 0) content.unresolvedHashes = unresolvedHashes;
        collections.push(content);
    }
    return { schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, exportedAt, collections };
}

export function contentToOverride(
    content: CollectionSyncContent,
    hashByMapId: ReadonlyMap<number, string>,
): Record<string, string[]> {
    const override: Record<string, string[]> = {};
    for (const entry of content.collections) {
        const hashes = new Set<string>();
        for (const mapId of entry.mapIds) {
            const hash = hashByMapId.get(mapId);
            if (hash) hashes.add(hash);
        }
        for (const hash of entry.unresolvedHashes ?? []) {
            if (typeof hash === "string" && hash.length > 0) hashes.add(hash.toLowerCase());
        }
        override[entry.name] = sortHashes(hashes);
    }
    return override;
}

export function parseCollectionSyncSettings(raw: unknown): CollectionSyncSettings {
    const collections: Record<string, CollectionSyncType> = {};
    const source = (raw ?? {}) as { collections?: unknown };
    if (source.collections && typeof source.collections === "object") {
        for (const [name, value] of Object.entries(source.collections as Record<string, unknown>)) {
            const trimmed = name.trim();
            if (trimmed.length === 0) continue;
            if (isCollectionSyncType(value)) collections[trimmed] = value;
        }
    }
    return { schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, collections };
}

export function parseCollectionSyncBaseline(raw: unknown): CollectionSyncBaseline | null {
    if (!raw || typeof raw !== "object") return null;
    const source = raw as { collections?: unknown; syncedAt?: unknown };
    if (!source.collections || typeof source.collections !== "object") return null;
    const collections: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(source.collections as Record<string, unknown>)) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || !Array.isArray(value)) continue;
        const hashes = value
            .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
            .map((hash) => hash.toLowerCase());
        collections[trimmed] = sortHashes(hashes);
    }
    const syncedAt = typeof source.syncedAt === "number" && Number.isFinite(source.syncedAt) ? source.syncedAt : 0;
    return { schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, syncedAt, collections };
}

export function parseCollectionSyncContent(raw: unknown): CollectionSyncContent {
    const source = (raw ?? {}) as { collections?: unknown; exportedAt?: unknown };
    const collections: CollectionSyncContentEntry[] = [];
    if (Array.isArray(source.collections)) {
        for (const item of source.collections) {
            const entry = item as { name?: unknown; mapIds?: unknown; unresolvedHashes?: unknown };
            if (typeof entry.name !== "string" || entry.name.trim().length === 0) continue;
            const mapIds = Array.isArray(entry.mapIds)
                ? entry.mapIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
                : [];
            const parsed: CollectionSyncContentEntry = {
                name: entry.name.trim(),
                mapIds: Array.from(new Set(mapIds)).sort((a, b) => a - b),
            };
            if (Array.isArray(entry.unresolvedHashes)) {
                const unresolved = entry.unresolvedHashes
                    .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
                    .map((hash) => hash.toLowerCase());
                if (unresolved.length > 0) parsed.unresolvedHashes = sortHashes(unresolved);
            }
            collections.push(parsed);
        }
    }
    const exportedAt =
        typeof source.exportedAt === "number" && Number.isFinite(source.exportedAt) ? source.exportedAt : 0;
    return { schemaVersion: COLLECTION_SYNC_SCHEMA_VERSION, exportedAt, collections };
}
