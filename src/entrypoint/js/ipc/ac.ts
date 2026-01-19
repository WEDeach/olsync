import { ipcMain } from "electron";
import { IPC_AC_NAMES } from "./ns";
import SharedManager from "../../../shared/sharedManager";
import { PackTypes } from "../../../api/v2/routes/beatmaps";


export function register() {
    ipcMain.handle(IPC_AC_NAMES.INIT,async (_,client_id: string,client_secret: string) => {
        return await SharedManager.api.init(client_id,client_secret);
    });
    ipcMain.handle(IPC_AC_NAMES.GET,async () => {
        return await SharedManager.api.client();
    });
    ipcMain.handle(IPC_AC_NAMES.GET_USER_MOST_PLAYED_MAPS,async (_,user_id: number,limit: number=200,offset: number=0) => {
        return await SharedManager.api.get_user_most_played_beatmaps(user_id,limit,offset);
    });
    ipcMain.handle(IPC_AC_NAMES.GET_USER_INFO,async (_,user_id: number|string) => {
        return await SharedManager.api.get_user_info(user_id);
    });
    ipcMain.handle(IPC_AC_NAMES.SAVE_CACHED_MAPS,async (_,user_id: number,beatmap_ids: number[]) => {
        return await SharedManager.api.save_cached_beatmaps(user_id,beatmap_ids);
    });
    ipcMain.handle(IPC_AC_NAMES.GET_CACHED_MAPS,async (_,user_id: number) => {
        return await SharedManager.api.get_cached_beatmaps(user_id);
    });
    ipcMain.handle(IPC_AC_NAMES.GET_DLINK_BY_BEATMAPSET_ID,async (_,beatmapset_id: number) => {
        return await SharedManager.api.get_dlink_by_beatmapset_id(beatmapset_id);
    });
    ipcMain.handle(IPC_AC_NAMES.FETCH_PACKS,async (_,type: PackTypes,cursor_string?: string) => {
        return await SharedManager.api.fetch_packs(type,cursor_string);
    });
    ipcMain.handle(IPC_AC_NAMES.GET_PACK,async (_,tag_id: any) => {
        return await SharedManager.api.get_pack(tag_id);
    });
}