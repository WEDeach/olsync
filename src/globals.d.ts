import { DefaultObject } from "realm/dist/public-types/schema/types";
import ApiClient from "./api/v2/client";
import { PackTypes } from "./api/v2/routes/beatmaps";
import { RespBeatmapLookup, RespBeatmapPacks, RespUserInfo, RespUserMostPlayedBeatmaps } from "./api/v2/types/api_resp";
import { StableBeatmapDetail, StableBeatmapFilter } from "./defines/stable_structs";
import { HostType, IOsuCollection, OsuClients } from "./defines/types";
import { UpdateDiff } from "./entrypoint/js/updater";
import { CachedBeatmapPack } from "./shared/singletons/api";
import { DefaultObjectWithOffset } from "./utils/reader";
import { SyncState } from "./utils/typed/config";

type IPCR<T> = { error: any } | T;

declare global {
    interface Window {
        olsCore: {
            openFile: (
                title?: string,
                propertie?: "openFile" | "openDirectory" | "multiSelections",
                filters?: { name: string; extensions: string[] }[],
            ) => Promise<string | undefined>;
            isDevMode: () => Promise<boolean>;
            exec: (progId: string) => Promise<string | undefined>;
            openExternal: (url: string) => Promise<void>;
            readFile: (filePath: string, encoding?: "utf8" | "base64") => Promise<string>;
            initReader: (path: string) => Promise<any>;
            getSchemas: () => Promise<Realm.CanonicalObjectSchema[]>;
            getSchema: (name: string) => Promise<Realm.CanonicalObjectSchema | undefined>;
            getSchemaObjs: (name: string, limit?: number, offset?: number) => Promise<DefaultObject[]>;
            closeReader: () => Promise<void>;
            initConfig: () => Promise<void>;
            getConfig: (k: string) => Promise<any>;
            getConfigAll: () => Promise<any>;
            saveConfig: (k: string, v: any) => Promise<void>;
            initStableReader: (path: string) => Promise<void>;
            startStableWatch: () => Promise<void>;
            getCollections: (type?: OsuClients, offset?: number, limit?: number) => Promise<DefaultObjectWithOffset>;
            setCollections: (type: OsuClients, collections: IOsuCollection[]) => Promise<void>;
            getBeatmaps: (type?: OsuClients, offset?: number, limit?: number) => Promise<DefaultObjectWithOffset>;
            queryStableBeatmaps: (
                filter: StableBeatmapFilter,
                offset?: number,
                limit?: number,
            ) => Promise<DefaultObjectWithOffset>;
            countStableBeatmaps: () => Promise<number>;
            getStableBeatmapIndex: (offset?: number, limit?: number) => Promise<DefaultObjectWithOffset>;
            getStableBeatmapDetail: (md5Hash: string) => Promise<StableBeatmapDetail | null>;
            getScores: (type?: OsuClients, offset?: number, limit?: number) => Promise<IPCR<DefaultObjectWithOffset>>;
            initAC: (client_id: string, client_secret: string) => Promise<any>;
            getAC: () => Promise<ApiClient>;
            fetchLangs: () => Promise<{ [key: string]: string }>;
            getLang: (lang: string) => Promise<{ [key: string]: string }>;
            send: (channel: string, ...args: any[]) => Promise<void>;
            on: (
                channel: string,
                listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
            ) => Promise<void>;
            removeListener: (
                channel: string,
                listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void,
            ) => void;
            getUserMostPlayedBeatmaps: (
                user_id: number,
                limit?: number,
                offset?: number,
            ) => Promise<RespUserMostPlayedBeatmaps>;
            getUserInfo: (user_id: number | string) => Promise<IPCR<RespUserInfo>>;
            getSyncStateByUserId: (user_id: number) => Promise<IPCR<SyncState | undefined>>;
            saveSyncStateByUserId: (
                user_id: number,
                last_count: number,
                last_offset: number,
                last_updated: number,
            ) => Promise<IPCR<void>>;
            saveCachedMaps: (user_id: number, beatmap_ids: number[]) => Promise<void>;
            getCachedMaps: (user_id: number) => Promise<RespUserMostPlayedBeatmaps>;
            initDL: (hostType: HostType) => Promise<boolean>;
            sendMessage4DL: (hostType: HostType, message: any) => Promise<void>;
            getDLinkByBeatmapsetId: (beatmapset_id: number) => Promise<IPCR<string>>;
            fecthBeatmapPacks: (type: PackTypes, cursor_string?: string) => Promise<IPCR<RespBeatmapPacks>>;
            getBeatmapPack: (tag_id: any) => Promise<IPCR<CachedBeatmapPack>>;
            initUpdater: (updateBaseUrl: string) => Promise<boolean>;
            checkForUpdates: () => Promise<IPCR<UpdateDiff | null>>;
            downloadUpdate: (diff: UpdateDiff) => Promise<{ success: boolean; tempDir?: string; error?: string }>;
            executeUpdate: (tempDir: string) => Promise<boolean>;
            verifyUpdate: () => Promise<boolean>;
            getCurrentVersion: () => Promise<string>;
            fetchBeatmapByChecksum: (checksum: string) => Promise<IPCR<RespBeatmapLookup>>;
        };
    }
}

export {};
