import { ipcMain } from "electron";
import { IPC_CN_NAMES } from "./ns";
import SharedManager from "../../../shared/sharedManager";


export function register() {
    ipcMain.handle(IPC_CN_NAMES.INIT,async () => {
        await SharedManager.config.init();
    });
    ipcMain.handle(IPC_CN_NAMES.GET,async (_,k: string) => {
        return SharedManager.config.get(k);
    });
    ipcMain.handle(IPC_CN_NAMES.SAVE,async (_,k: string,v: any) => {
        await SharedManager.config.save(k,v);
    });
    ipcMain.handle(IPC_CN_NAMES.GET_ALL,async () => {
        return SharedManager.config.get_all();
    });
    ipcMain.handle(IPC_CN_NAMES.GET_SYNC_STATE_BY_USER_ID,async (_,user_id: number) => {
        return SharedManager.config.get_sync_state(user_id);
    });
    ipcMain.handle(IPC_CN_NAMES.SAVE_SYNC_STATE_BY_USER_ID,async (_,user_id: number,last_count: number,last_offset: number,last_updated: number) => {
        return SharedManager.config.save_sync_state(user_id,last_count,last_offset,last_updated);
    });
}