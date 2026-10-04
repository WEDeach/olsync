import {
    CollectionMergeCollectionPlan,
    CollectionMergeHashInfo,
    CollectionMergeKind,
    CollectionMergePlan,
    CollectionMergePlanStats,
    CollectionMergeSelections,
    CollectionSyncChanges,
} from "../../defines/collection_sync";
import { IOsuCollection } from "../../defines/types";
import { normalizeCollections, sortHashes } from "./collectionSync";

function unionHashes(a: readonly string[], b: readonly string[]): string[] {
    return sortHashes([...a, ...b]);
}

function computeStableChanges(current: readonly string[], target: string[] | null): CollectionSyncChanges {
    if (target === null) return { add: [], remove: [] };
    const currentSet = new Set(current);
    const targetSet = new Set(target);
    return {
        add: target.filter((hash) => !currentSet.has(hash)),
        remove: current.filter((hash) => !targetSet.has(hash)),
    };
}

export interface CollectionMergePlanInput {
    stable: IOsuCollection[];
    lazer: IOsuCollection[];
    selections?: CollectionMergeSelections;
    detailsByHash?: ReadonlyMap<string, CollectionMergeHashInfo>;
}

export function buildCollectionMergePlan(input: CollectionMergePlanInput): CollectionMergePlan {
    const stable = normalizeCollections(input.stable);
    const lazer = normalizeCollections(input.lazer);

    const stableByName = new Map(stable.map((entry) => [entry.name, entry]));
    const lazerByName = new Map(lazer.map((entry) => [entry.name, entry]));

    const order: string[] = [];
    const seen = new Set<string>();
    for (const entry of [...stable, ...lazer]) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        order.push(entry.name);
    }

    const collections: CollectionMergeCollectionPlan[] = [];
    const targetByName = new Map<string, string[] | null>();

    for (const name of order) {
        const stableEntry = stableByName.get(name);
        const lazerEntry = lazerByName.get(name);
        const stableHashes = stableEntry ? stableEntry.maps : [];
        const lazerHashes = lazerEntry ? lazerEntry.maps : [];
        const existsStable = stableEntry !== undefined;
        const existsLazer = lazerEntry !== undefined;
        const union = unionHashes(stableHashes, lazerHashes);

        const selection = input.selections?.[name];
        const include = selection?.include !== false;
        let target: string[] | null;
        if (!include) {
            target = null;
        } else if (selection?.hashes === undefined) {
            target = union;
        } else {
            const allowed = new Set(union);
            target = sortHashes(selection.hashes.filter((hash) => allowed.has(hash)));
        }
        targetByName.set(name, target);

        const changes = computeStableChanges(stableHashes, target);
        const kind: CollectionMergeKind = !include
            ? "skipped"
            : !existsStable
              ? target !== null && target.length > 0
                  ? "create"
                  : "skipped"
              : changes.add.length === 0 && changes.remove.length === 0
                ? "in-sync"
                : "update";

        const details: Record<string, CollectionMergeHashInfo> = {};
        for (const hash of union) {
            const info = input.detailsByHash?.get(hash);
            if (info) details[hash] = info;
        }

        collections.push({
            name,
            existsStable,
            existsLazer,
            stable: stableHashes,
            lazer: lazerHashes,
            include,
            kind,
            target,
            changes,
            details,
        });
    }

    const stablePayload: IOsuCollection[] = stable.map((entry) => ({
        name: entry.name,
        maps: targetByName.get(entry.name) ?? entry.maps,
    }));
    for (const entry of lazer) {
        if (stableByName.has(entry.name)) continue;
        const target = targetByName.get(entry.name);
        if (target === null || target === undefined || target.length === 0) continue;
        stablePayload.push({ name: entry.name, maps: target });
    }

    const stats: CollectionMergePlanStats = {
        create: 0,
        update: 0,
        inSync: 0,
        skipped: 0,
        added: 0,
        removed: 0,
    };
    for (const entry of collections) {
        if (entry.kind === "create") stats.create += 1;
        else if (entry.kind === "update") stats.update += 1;
        else if (entry.kind === "in-sync") stats.inSync += 1;
        else stats.skipped += 1;
        stats.added += entry.changes.add.length;
        stats.removed += entry.changes.remove.length;
    }

    return { collections, stablePayload, stats };
}
