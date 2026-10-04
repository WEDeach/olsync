import { dialog, ipcMain } from "electron";
import type { CollectionSyncResolution, CollectionSyncType } from "../../../defines/collection_sync";
import SharedManager from "../../../shared/sharedManager";
import { IPC_CS_NAMES } from "./ns";

export function register() {
    ipcMain.handle(IPC_CS_NAMES.GET_STATE, async () => {
        return await SharedManager.collectionSync.get_state();
    });

    ipcMain.handle(IPC_CS_NAMES.SET_COLLECTION_TYPE, async (_, name: string, type: CollectionSyncType) => {
        return await SharedManager.collectionSync.set_collection_type(name, type);
    });

    ipcMain.handle(IPC_CS_NAMES.SET_EXCLUDE_NOT_FOUND, async (_, enabled: boolean) => {
        return await SharedManager.collectionSync.set_exclude_not_found(enabled === true);
    });

    ipcMain.handle(IPC_CS_NAMES.BUILD_PLAN, async (_, resolutions: CollectionSyncResolution[]) => {
        return await SharedManager.collectionSync.build_plan(Array.isArray(resolutions) ? resolutions : []);
    });

    ipcMain.handle(IPC_CS_NAMES.CHECK_MISSING, async (event) => {
        return await SharedManager.collectionSync.check_missing_beatmaps((resolved, total) => {
            if (event.sender.isDestroyed()) return;
            event.sender.send(IPC_CS_NAMES.MISSING_PROGRESS, resolved, total);
        });
    });

    ipcMain.handle(IPC_CS_NAMES.EXECUTE, async () => {
        return await SharedManager.collectionSync.execute();
    });

    ipcMain.handle(IPC_CS_NAMES.INVALIDATE_PLAN, async () => {
        SharedManager.collectionSync.invalidate_plan();
    });

    ipcMain.handle(IPC_CS_NAMES.RESET_BASELINE, async () => {
        return await SharedManager.collectionSync.reset_baseline();
    });

    ipcMain.handle(IPC_CS_NAMES.EXPORT_SETTINGS, async () => {
        const result = await dialog.showSaveDialog({
            defaultPath: "olsync-collection-sync-settings.json",
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return null;
        await SharedManager.collectionSync.export_settings(result.filePath);
        return result.filePath;
    });

    ipcMain.handle(IPC_CS_NAMES.IMPORT_SETTINGS, async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return await SharedManager.collectionSync.import_settings(result.filePaths[0]);
    });

    ipcMain.handle(IPC_CS_NAMES.EXPORT_CONTENT, async () => {
        const result = await dialog.showSaveDialog({
            defaultPath: "olsync-collection-sync-content.json",
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || !result.filePath) return null;
        const content = await SharedManager.collectionSync.export_content(result.filePath);
        return { filePath: result.filePath, collectionCount: content.collections.length };
    });

    ipcMain.handle(IPC_CS_NAMES.IMPORT_CONTENT, async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return await SharedManager.collectionSync.import_content(result.filePaths[0]);
    });
}
