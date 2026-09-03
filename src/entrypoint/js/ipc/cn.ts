import { dialog, ipcMain } from "electron";
import { promises as fsp } from "fs";
import SharedManager from "../../../shared/sharedManager";
import { sanitizeProfileId } from "../../../utils/profileId";
import { IPC_CN_NAMES } from "./ns";

export function register() {
    ipcMain.handle(IPC_CN_NAMES.INIT, async () => {
        await SharedManager.config.init();
    });
    ipcMain.handle(IPC_CN_NAMES.GET, async (_, k: string) => {
        return SharedManager.config.get(k);
    });
    ipcMain.handle(IPC_CN_NAMES.SAVE, async (_, k: string, v: any) => {
        await SharedManager.config.save(k, v);
    });
    ipcMain.handle(IPC_CN_NAMES.GET_ALL, async () => {
        return SharedManager.config.get_all();
    });
    ipcMain.handle(IPC_CN_NAMES.GET_SYNC_STATE_BY_USER_ID, async (_, user_id: number) => {
        return SharedManager.config.get_sync_state(user_id);
    });
    ipcMain.handle(
        IPC_CN_NAMES.SAVE_SYNC_STATE_BY_USER_ID,
        async (_, user_id: number, last_count: number, last_offset: number, last_updated: number) => {
            return SharedManager.config.save_sync_state(user_id, last_count, last_offset, last_updated);
        },
    );
    ipcMain.handle(IPC_CN_NAMES.GET_PICKER_PROFILE, async (_, profileId: string) => {
        return SharedManager.config.get_picker_profile(profileId);
    });
    ipcMain.handle(IPC_CN_NAMES.SAVE_PICKER_PROFILE, async (_, profileId: string, data: any) => {
        await SharedManager.config.save_picker_profile(profileId, data);
    });
    ipcMain.handle(IPC_CN_NAMES.DELETE_PICKER_PROFILE, async (_, profileId: string) => {
        await SharedManager.config.delete_picker_profile(profileId);
    });
    ipcMain.handle(IPC_CN_NAMES.LIST_PICKER_PROFILES, async () => {
        return SharedManager.config.list_picker_profiles();
    });
    ipcMain.handle(IPC_CN_NAMES.GET_PICKER_LOG, async (_, profileId: string) => {
        return SharedManager.config.get_picker_log(profileId);
    });
    ipcMain.handle(IPC_CN_NAMES.SAVE_PICKER_LOG, async (_, profileId: string, data: any[]) => {
        await SharedManager.config.save_picker_log(profileId, data);
    });
    ipcMain.handle(IPC_CN_NAMES.MIGRATE_PICKER_PROFILE, async (_, profileId: string, outdatedKeys: string[]) => {
        return SharedManager.config.migrate_picker_profile(profileId, outdatedKeys);
    });
    ipcMain.handle(IPC_CN_NAMES.IMPORT_PICKER_PROFILES, async () => {
        const result = await dialog.showOpenDialog({
            properties: ["openFile"],
            filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        const content = await fsp.readFile(result.filePaths[0], "utf8");
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
            throw new Error("Invalid picker profiles: expected array");
        }
        for (const p of parsed) {
            if (p && typeof p.name === "string") {
                sanitizeProfileId(p.name);
            }
        }
        return parsed;
    });
}
