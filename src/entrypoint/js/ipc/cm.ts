import { ipcMain } from "electron";
import type { CollectionMergeSelection, CollectionMergeSelections } from "../../../defines/collection_sync";
import SharedManager from "../../../shared/sharedManager";
import { IPC_CM_NAMES } from "./ns";

function parse_selections(value: unknown): CollectionMergeSelections {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const selections: CollectionMergeSelections = {};
    for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || typeof raw !== "object" || raw === null) continue;
        const entry = raw as { include?: unknown; hashes?: unknown };
        const selection: CollectionMergeSelection = { include: entry.include !== false };
        if (Array.isArray(entry.hashes)) {
            selection.hashes = entry.hashes
                .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
                .map((hash) => hash.toLowerCase());
        }
        selections[trimmed] = selection;
    }
    return selections;
}

export function register() {
    ipcMain.handle(IPC_CM_NAMES.GET_STATE, async () => {
        return await SharedManager.collectionSync.get_merge_state();
    });

    ipcMain.handle(IPC_CM_NAMES.BUILD_PLAN, async (_, selections: unknown) => {
        return await SharedManager.collectionSync.build_merge_plan(parse_selections(selections));
    });

    ipcMain.handle(IPC_CM_NAMES.EXECUTE, async () => {
        return await SharedManager.collectionSync.execute_merge();
    });

    ipcMain.handle(IPC_CM_NAMES.INVALIDATE_PLAN, async () => {
        SharedManager.collectionSync.invalidate_merge_plan();
    });
}
