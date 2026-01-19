import { contextBridge,ipcRenderer } from 'electron';
import { IPC_FS_NAMES,IPC_RD_NAMES,IPC_CN_NAMES,IPC_AC_NAMES,IPC_LA_NAMES,IPC_DL_NAMES,IPC_UP_NAMES } from './ipc/ns';
import { HostType,IOsuCollection,OsuClients } from '../../defines/types';
import { PackTypes } from '../../api/v2/routes/beatmaps';

const ipcInvoke=async (channel: string,...args: any[]) => {
    try {
        return await ipcRenderer.invoke(channel,...args);
    } catch(error: any) {
        const errorMsg=/Error invoking remote method '.+?': (.+)/.exec(error?.message)
        return { error: errorMsg?.[1]??error };
    }
}

contextBridge.exposeInMainWorld('olsCore',{
    // filesystem
    openFile: (title?: string,propertie: "openFile"|"openDirectory"|"multiSelections"="openFile",filters?: { name: string; extensions: string[] }[]) => ipcInvoke(IPC_FS_NAMES.OPEN,title,propertie,filters),
    isDevMode: () => ipcInvoke(IPC_FS_NAMES.IS_DEV_MODE),
    exec: (progId: string) => ipcInvoke(IPC_FS_NAMES.EXEC,progId),
    openExternal: (url: string) => ipcInvoke(IPC_FS_NAMES.OPEN_EXTERNAL,url),

    // reader
    initReader: (path: string) => ipcInvoke(IPC_RD_NAMES.INIT,path),
    getSchemas: () => ipcInvoke(IPC_RD_NAMES.SCHEMAS),
    getSchema: (name: string) => ipcInvoke(IPC_RD_NAMES.GET_SCHEMA,name),
    getSchemaObjs: (name: string,limit?: number,offset?: number) => ipcInvoke(IPC_RD_NAMES.GET_SCHEMA_OBJS,name,limit,offset),
    closeReader: () => ipcInvoke(IPC_RD_NAMES.CLOSE),
    initStableReader: (path: string) => ipcInvoke(IPC_RD_NAMES.INIT_STABLE,path),
    getCollections: (type?: OsuClients,offset?: number,limit?: number) => ipcInvoke(IPC_RD_NAMES.GET_COLLECTIONS,type,offset,limit),
    setCollections: (type: OsuClients,collections: IOsuCollection[]) => ipcInvoke(IPC_RD_NAMES.SET_COLLECTIONS,type,collections),
    getBeatmaps: (type?: OsuClients,offset?: number,limit?: number) => ipcInvoke(IPC_RD_NAMES.GET_BEATMAPS,type,offset,limit),
    getScores: (type?: OsuClients,offset?: number,limit?: number) => ipcInvoke(IPC_RD_NAMES.GET_SCORES,type,offset,limit),

    // config
    initConfig: () => ipcInvoke(IPC_CN_NAMES.INIT),
    saveConfig: (k: string,v: any) => ipcInvoke(IPC_CN_NAMES.SAVE,k,v),
    getConfig: (k: string) => ipcInvoke(IPC_CN_NAMES.GET,k),
    getConfigAll: () => ipcInvoke(IPC_CN_NAMES.GET_ALL),
    getSyncStateByUserId: (user_id: number) => ipcInvoke(IPC_CN_NAMES.GET_SYNC_STATE_BY_USER_ID,user_id),
    saveSyncStateByUserId: (user_id: number,last_count: number,last_offset: number,last_updated: number) => ipcInvoke(IPC_CN_NAMES.SAVE_SYNC_STATE_BY_USER_ID,user_id,last_count,last_offset,last_updated),

    // API
    initAC: (client_id: string,client_secret: string) => ipcInvoke(IPC_AC_NAMES.INIT,client_id,client_secret),
    getAC: () => ipcInvoke(IPC_AC_NAMES.GET),
    getUserMostPlayedMaps: (user_id: number,limit: number=200,offset: number=0) => ipcInvoke(IPC_AC_NAMES.GET_USER_MOST_PLAYED_MAPS,user_id,limit,offset),
    getUserInfo: (user_id: number|string) => ipcInvoke(IPC_AC_NAMES.GET_USER_INFO,user_id),
    getUserMostPlayedBeatmaps: (user_id: number,limit: number=200,offset: number=0) => ipcInvoke(IPC_AC_NAMES.GET_USER_MOST_PLAYED_MAPS,user_id,limit,offset),
    saveCachedMaps: (user_id: number,beatmap_ids: number[]) => ipcInvoke(IPC_AC_NAMES.SAVE_CACHED_MAPS,user_id,beatmap_ids),
    getCachedMaps: (user_id: number) => ipcInvoke(IPC_AC_NAMES.GET_CACHED_MAPS,user_id),
    getDLinkByBeatmapsetId: (beatmapset_id: number) => ipcInvoke(IPC_AC_NAMES.GET_DLINK_BY_BEATMAPSET_ID,beatmapset_id),
    fecthBeatmapPacks: (type: PackTypes='standard',cursor_string?: string) => ipcInvoke(IPC_AC_NAMES.FETCH_PACKS,type,cursor_string),
    getBeatmapPack: (tag_id: any) => ipcInvoke(IPC_AC_NAMES.GET_PACK,tag_id),

    // i18n
    fetchLangs: () => ipcInvoke(IPC_LA_NAMES.FETCH_LANGS),
    getLang: (lang: string) => ipcInvoke(IPC_LA_NAMES.GET_LANG,lang),

    // ipc
    send: (channel: string,...args: any[]) => ipcRenderer.send(channel,...args),
    on: (channel: string,listener: (event: Electron.IpcRendererEvent,...args: any[]) => void) => ipcRenderer.on(channel,listener),
    removeListener: (channel: string,listener: (event: Electron.IpcRendererEvent,...args: any[]) => void) => ipcRenderer.removeListener(channel,listener),

    // dl
    initDL: (hostType: HostType) => ipcInvoke(IPC_DL_NAMES.INIT,hostType),
    sendMessage4DL: (hostType: HostType,message: any) => ipcInvoke(IPC_DL_NAMES.SEND,hostType,message),

    // updater
    initUpdater: (updateBaseUrl: string) => ipcInvoke(IPC_UP_NAMES.INIT,updateBaseUrl),
    checkForUpdates: () => ipcInvoke(IPC_UP_NAMES.CHECK_FOR_UPDATES),
    downloadUpdate: (diff: any) => ipcInvoke(IPC_UP_NAMES.DOWNLOAD_UPDATE,diff),
    executeUpdate: (tempDir: string) => ipcInvoke(IPC_UP_NAMES.EXECUTE_UPDATE,tempDir),
    verifyUpdate: () => ipcInvoke(IPC_UP_NAMES.VERIFY_UPDATE),
    getCurrentVersion: () => ipcInvoke(IPC_UP_NAMES.GET_CURRENT_VERSION),
});