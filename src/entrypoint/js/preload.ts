import { contextBridge, ipcRenderer } from "electron";
import { PackTypes } from "../../api/v2/routes/beatmaps";
import { HostType, IOsuCollection, OsuClients } from "../../defines/types";
import {
    IPC_AC_NAMES,
    IPC_CN_NAMES,
    IPC_DL_NAMES,
    IPC_FS_NAMES,
    IPC_LA_NAMES,
    IPC_RD_NAMES,
    IPC_TR_NAMES,
    IPC_UP_NAMES,
} from "./ipc/ns";

const ipcInvoke = async (channel: string, ...args: any[]) => {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    } catch (error: any) {
        const errorMsg = /Error invoking remote method '.+?': (.+)/.exec(error?.message);
        return { error: errorMsg?.[1] ?? error };
    }
};

contextBridge.exposeInMainWorld("olsCore", {
    // filesystem
    openFile: (
        title?: string,
        propertie: "openFile" | "openDirectory" | "multiSelections" = "openFile",
        filters?: { name: string; extensions: string[] }[],
    ) => ipcInvoke(IPC_FS_NAMES.OPEN, title, propertie, filters),
    isDevMode: () => ipcInvoke(IPC_FS_NAMES.IS_DEV_MODE),
    exec: (progId: string) => ipcInvoke(IPC_FS_NAMES.EXEC, progId),
    openExternal: (url: string) => ipcInvoke(IPC_FS_NAMES.OPEN_EXTERNAL, url),
    readFile: (filePath: string, encoding: "utf8" | "base64" = "utf8") =>
        ipcInvoke(IPC_FS_NAMES.READ_FILE, filePath, encoding),

    // reader
    initReader: (path: string) => ipcInvoke(IPC_RD_NAMES.INIT, path),
    getSchemas: () => ipcInvoke(IPC_RD_NAMES.SCHEMAS),
    getSchema: (name: string) => ipcInvoke(IPC_RD_NAMES.GET_SCHEMA, name),
    getSchemaObjs: (name: string, limit?: number, offset?: number) =>
        ipcInvoke(IPC_RD_NAMES.GET_SCHEMA_OBJS, name, limit, offset),
    closeReader: () => ipcInvoke(IPC_RD_NAMES.CLOSE),
    initStableReader: (path: string) => ipcInvoke(IPC_RD_NAMES.INIT_STABLE, path),
    startStableWatch: () => ipcInvoke(IPC_RD_NAMES.START_STABLE_WATCH),
    getCollections: (type?: OsuClients, offset?: number, limit?: number) =>
        ipcInvoke(IPC_RD_NAMES.GET_COLLECTIONS, type, offset, limit),
    setCollections: (type: OsuClients, collections: IOsuCollection[]) =>
        ipcInvoke(IPC_RD_NAMES.SET_COLLECTIONS, type, collections),
    getBeatmaps: (type?: OsuClients, offset?: number, limit?: number) =>
        ipcInvoke(IPC_RD_NAMES.GET_BEATMAPS, type, offset, limit),
    getScores: (type?: OsuClients, offset?: number, limit?: number) =>
        ipcInvoke(IPC_RD_NAMES.GET_SCORES, type, offset, limit),
    queryStableBeatmaps: (filter: any, offset = 0, limit = 0) =>
        ipcInvoke(IPC_RD_NAMES.QUERY_BEATMAPS, filter, offset, limit),
    countStableBeatmaps: () => ipcInvoke(IPC_RD_NAMES.COUNT_BEATMAPS),
    getStableBeatmapIndex: (offset = 0, limit = 0) => ipcInvoke(IPC_RD_NAMES.GET_BEATMAP_INDEX, offset, limit),
    getStableBeatmapDetail: (md5Hash: string) => ipcInvoke(IPC_RD_NAMES.GET_BEATMAP_DETAIL, md5Hash),
    calcPP: (args: any) => ipcInvoke(IPC_RD_NAMES.CALC_PP, args),

    // config
    initConfig: () => ipcInvoke(IPC_CN_NAMES.INIT),
    saveConfig: (k: string, v: any) => ipcInvoke(IPC_CN_NAMES.SAVE, k, v),
    getConfig: (k: string) => ipcInvoke(IPC_CN_NAMES.GET, k),
    getConfigAll: () => ipcInvoke(IPC_CN_NAMES.GET_ALL),
    getSyncStateByUserId: (user_id: number) => ipcInvoke(IPC_CN_NAMES.GET_SYNC_STATE_BY_USER_ID, user_id),
    saveSyncStateByUserId: (user_id: number, last_count: number, last_offset: number, last_updated: number) =>
        ipcInvoke(IPC_CN_NAMES.SAVE_SYNC_STATE_BY_USER_ID, user_id, last_count, last_offset, last_updated),
    getPickerProfile: (profileId: string) => ipcInvoke(IPC_CN_NAMES.GET_PICKER_PROFILE, profileId),
    savePickerProfile: (profileId: string, data: any) => ipcInvoke(IPC_CN_NAMES.SAVE_PICKER_PROFILE, profileId, data),
    deletePickerProfile: (profileId: string) => ipcInvoke(IPC_CN_NAMES.DELETE_PICKER_PROFILE, profileId),
    listPickerProfiles: () => ipcInvoke(IPC_CN_NAMES.LIST_PICKER_PROFILES),
    getPickerLog: (profileId: string) => ipcInvoke(IPC_CN_NAMES.GET_PICKER_LOG, profileId),
    savePickerLog: (profileId: string, data: any[]) => ipcInvoke(IPC_CN_NAMES.SAVE_PICKER_LOG, profileId, data),
    migratePickerProfile: (profileId: string, outdatedKeys: string[]) =>
        ipcInvoke(IPC_CN_NAMES.MIGRATE_PICKER_PROFILE, profileId, outdatedKeys),

    // API
    initAC: (client_id: string, client_secret: string) => ipcInvoke(IPC_AC_NAMES.INIT, client_id, client_secret),
    getAC: () => ipcInvoke(IPC_AC_NAMES.GET),
    getUserMostPlayedMaps: (user_id: number, limit: number = 200, offset: number = 0) =>
        ipcInvoke(IPC_AC_NAMES.GET_USER_MOST_PLAYED_MAPS, user_id, limit, offset),
    getUserInfo: (user_id: number | string) => ipcInvoke(IPC_AC_NAMES.GET_USER_INFO, user_id),
    getUserMostPlayedBeatmaps: (user_id: number, limit: number = 200, offset: number = 0) =>
        ipcInvoke(IPC_AC_NAMES.GET_USER_MOST_PLAYED_MAPS, user_id, limit, offset),
    saveCachedMaps: (user_id: number, beatmap_ids: number[]) =>
        ipcInvoke(IPC_AC_NAMES.SAVE_CACHED_MAPS, user_id, beatmap_ids),
    getCachedMaps: (user_id: number) => ipcInvoke(IPC_AC_NAMES.GET_CACHED_MAPS, user_id),
    getDLinkByBeatmapsetId: (beatmapset_id: number) =>
        ipcInvoke(IPC_AC_NAMES.GET_DLINK_BY_BEATMAPSET_ID, beatmapset_id),
    fecthBeatmapPacks: (type: PackTypes = "standard", cursor_string?: string) =>
        ipcInvoke(IPC_AC_NAMES.FETCH_PACKS, type, cursor_string),
    getBeatmapPack: (tag_id: any) => ipcInvoke(IPC_AC_NAMES.GET_PACK, tag_id),
    fetchBeatmapByChecksum: (checksum: string) => ipcInvoke(IPC_AC_NAMES.LOOKUP_MAP_BY_CHECKSUM, checksum),

    // i18n
    fetchLangs: () => ipcInvoke(IPC_LA_NAMES.FETCH_LANGS),
    getLang: (lang: string) => ipcInvoke(IPC_LA_NAMES.GET_LANG, lang),

    // ipc
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.on(channel, listener),
    removeListener: (channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.removeListener(channel, listener),

    // dl
    initDL: (hostType: HostType) => ipcInvoke(IPC_DL_NAMES.INIT, hostType),
    sendMessage4DL: (hostType: HostType, message: any) => ipcInvoke(IPC_DL_NAMES.SEND, hostType, message),

    // updater
    initUpdater: (config: any) => ipcInvoke(IPC_UP_NAMES.INIT, config),
    checkForUpdates: () => ipcInvoke(IPC_UP_NAMES.CHECK_FOR_UPDATES),
    downloadUpdate: (diff: any) => ipcInvoke(IPC_UP_NAMES.DOWNLOAD_UPDATE, diff),
    executeUpdate: (tempDir: string) => ipcInvoke(IPC_UP_NAMES.EXECUTE_UPDATE, tempDir),
    verifyUpdate: () => ipcInvoke(IPC_UP_NAMES.VERIFY_UPDATE),
    getCurrentVersion: () => ipcInvoke(IPC_UP_NAMES.GET_CURRENT_VERSION),

    // tracker
    getTrackerUserSummary: (userName: string) => ipcInvoke(IPC_TR_NAMES.GET_USER_SUMMARY, userName),
    saveTrackerUserSummary: (data: any) => ipcInvoke(IPC_TR_NAMES.SAVE_USER_SUMMARY, data),
    listTrackerUserSummaries: () => ipcInvoke(IPC_TR_NAMES.LIST_USER_SUMMARIES),

    // dl (downloader - unified: FDM legacy + built-in)
    dlEnqueue: (req: any) => ipcInvoke(IPC_DL_NAMES.ENQUEUE, req),
    dlBatchEnqueue: (reqs: any[]) =>
        ipcInvoke(IPC_DL_NAMES.BATCH_ENQUEUE, reqs) as Promise<
            Array<{
                type: "enqueued" | "duplicate" | "exists";
                req: any;
                task?: any;
                filename?: string;
                savePath?: string;
            }>
        >,
    dlCancel: (id: string) => ipcInvoke(IPC_DL_NAMES.CANCEL, id),
    dlPause: (id: string) => ipcInvoke(IPC_DL_NAMES.PAUSE, id),
    dlResume: (id: string) => ipcInvoke(IPC_DL_NAMES.RESUME, id),
    dlRetry: (id: string) => ipcInvoke(IPC_DL_NAMES.RETRY, id),
    dlClearHistory: (statuses?: string[]) => ipcInvoke(IPC_DL_NAMES.CLEAR_HISTORY, statuses),
    dlGetAllTasks: () => ipcInvoke(IPC_DL_NAMES.GET_ALL_TASKS),
    dlOpenSaveDir: () => ipcInvoke(IPC_DL_NAMES.OPEN_SAVE_DIR),
    dlRevealFile: (filePath: string) => ipcInvoke(IPC_DL_NAMES.REVEAL_FILE, filePath),
    dlLoginOsu: () => ipcInvoke(IPC_DL_NAMES.LOGIN_OSU) as Promise<{ success: boolean }>,
    dlCheckExists: (filenames: string[]) => ipcInvoke(IPC_DL_NAMES.CHECK_EXISTS, filenames) as Promise<string[]>,
    dlInstallFile: (taskId: string) =>
        ipcInvoke(IPC_DL_NAMES.INSTALL_FILE, taskId) as Promise<{
            success: boolean;
            installedCount?: number;
            reason?: string;
        }>,
    dlDeleteFile: (taskId: string) => ipcInvoke(IPC_DL_NAMES.DELETE_FILE, taskId) as Promise<{ success: boolean }>,
    dlGetRateStatus: () =>
        ipcInvoke(IPC_DL_NAMES.GET_RATE_STATUS) as Promise<Array<{ hostname: string; count: number; limit: number }>>,
    dlOnEvent: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
        ipcRenderer.on(IPC_DL_NAMES.TASK_UPDATED, listener);
        ipcRenderer.on(IPC_DL_NAMES.SESSION_EXPIRED, listener);
        ipcRenderer.on(IPC_DL_NAMES.SESSION_READY, listener);
        ipcRenderer.on(IPC_DL_NAMES.AUTH_REQUIRED, listener);
        ipcRenderer.on(IPC_DL_NAMES.LOGIN_RESULT, listener);
    },
    dlOffEvent: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
        ipcRenderer.removeListener(IPC_DL_NAMES.TASK_UPDATED, listener);
        ipcRenderer.removeListener(IPC_DL_NAMES.SESSION_EXPIRED, listener);
        ipcRenderer.removeListener(IPC_DL_NAMES.SESSION_READY, listener);
        ipcRenderer.removeListener(IPC_DL_NAMES.AUTH_REQUIRED, listener);
        ipcRenderer.removeListener(IPC_DL_NAMES.LOGIN_RESULT, listener);
    },
    dlOnTaskUpdated: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.on(IPC_DL_NAMES.TASK_UPDATED, listener),
    dlOffTaskUpdated: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.removeListener(IPC_DL_NAMES.TASK_UPDATED, listener),
    dlOnSessionExpired: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.on(IPC_DL_NAMES.SESSION_EXPIRED, listener),
    dlOffSessionExpired: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.removeListener(IPC_DL_NAMES.SESSION_EXPIRED, listener),
    dlOnAuthRequired: (listener: (event: Electron.IpcRendererEvent, payload: { hostname: string }) => void) =>
        ipcRenderer.on(IPC_DL_NAMES.AUTH_REQUIRED, listener),
    dlOffAuthRequired: (listener: (event: Electron.IpcRendererEvent, payload: { hostname: string }) => void) =>
        ipcRenderer.removeListener(IPC_DL_NAMES.AUTH_REQUIRED, listener),
    dlOnLoginResult: (listener: (event: Electron.IpcRendererEvent, payload: { success: boolean }) => void) =>
        ipcRenderer.on(IPC_DL_NAMES.LOGIN_RESULT, listener),
    dlOffLoginResult: (listener: (event: Electron.IpcRendererEvent, payload: { success: boolean }) => void) =>
        ipcRenderer.removeListener(IPC_DL_NAMES.LOGIN_RESULT, listener),
});
