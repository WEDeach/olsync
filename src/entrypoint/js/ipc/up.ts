import { ipcMain } from "electron";
import { IPC_UP_NAMES } from "./ns";
import { Updater,UpdateDiff } from "../updater";

let updaterInstance: Updater|null=null;

export function register() {
    ipcMain.handle(IPC_UP_NAMES.INIT,async (_,updateBaseUrl: string) => {
        try {
            updaterInstance=new Updater(updateBaseUrl);
            return true;
        } catch(error) {
            console.error("Failed to initialize updater:",error);
            return false;
        }
    });

    ipcMain.handle(IPC_UP_NAMES.CHECK_FOR_UPDATES,async (_) => {
        if(!updaterInstance) {
            throw new Error("Updater not initialized");
        }

        const diff=await updaterInstance.checkForUpdates();
        return diff;
    });

    ipcMain.handle(IPC_UP_NAMES.DOWNLOAD_UPDATE,async (_,diff: UpdateDiff) => {
        if(!updaterInstance) {
            throw new Error("Updater not initialized");
        }

        return new Promise<{ success: boolean; tempDir?: string; error?: string }>((resolve) => {
            updaterInstance!.downloadAndPrepareUpdate(
                diff,
                (current,total,currentFile) => {
                    const sender=_?.sender;
                    if(sender&&!sender.isDestroyed()) {
                        sender.send(IPC_UP_NAMES.UPDATE_PROGRESS,{
                            current,
                            total,
                            currentFile
                        });
                    }
                }
            ).then((tempDir) => {
                if(tempDir) {
                    resolve({ success: true,tempDir });
                } else {
                    resolve({ success: false,error: "下載失敗但沒有具體錯誤訊息" });
                }
            }).catch((error) => {
                console.error("Failed to download update:",error);
                const errorMsg=error?.message||error?.toString()||"未知錯誤";
                resolve({ success: false,error: errorMsg });
            });
        });
    });

    ipcMain.handle(IPC_UP_NAMES.EXECUTE_UPDATE,async (_,tempDir: string) => {
        if(!updaterInstance) {
            throw new Error("Updater not initialized");
        }

        await updaterInstance.executeUpdate(tempDir);
        return true;
    });

    ipcMain.handle(IPC_UP_NAMES.VERIFY_UPDATE,async (_) => {
        if(!updaterInstance) {
            throw new Error("Updater not initialized");
        }

        return await updaterInstance.verifyUpdate();
    });

    ipcMain.handle(IPC_UP_NAMES.GET_CURRENT_VERSION,async (_) => {
        if(!updaterInstance) {
            const Updater=(await import("../updater")).Updater;
            const tempInstance=new Updater("");
            return await tempInstance.getCurrentVersion();
        }
        return await updaterInstance.getCurrentVersion();
    });
}
