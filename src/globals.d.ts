import { DefaultObject } from "realm/dist/public-types/schema/types";
import ApiClient from "./api/v2/client";
import { PackTypes } from "./api/v2/routes/beatmaps";
import {
    RespBeatmapLookup,
    RespBeatmapPacks,
    RespUserInfo,
    RespUserMostPlayedBeatmaps,
    RespUserRecentScore,
} from "./api/v2/types/api_resp";
import { DownloadTask, EnqueueRequest } from "./defines/download_types";
import {
    PPCalcArgs,
    PPCalcResult,
    StableBeatmapDetail,
    StableBeatmapFilter,
    StableIpcClientData,
} from "./defines/stable_structs";
import { TrackerUserSummary } from "./defines/tracker_types";
import { HostType, IOsuCollection, OsuClients } from "./defines/types";
import { UpdateDiff } from "./entrypoint/js/updater";
import { UpdateCheckResult, UpdateProgress } from "./entrypoint/js/updater/types";
import { IPickerHistory, IPickerProfile } from "./renderer/components/beatmapPickerTypes";
import { CachedBeatmapPack } from "./shared/singletons/api";
import { OnlineDbStatus, OnlineTag } from "./shared/singletons/onlineDbReader";
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
            getOsuStableInstallPath: (key?: "default" | "osz") => Promise<string | undefined>;
            openExternal: (url: string) => Promise<void>;
            openBeatmapPage: (beatmapId: number) => Promise<void>;
            /** @deprecated Replaced by IMPORT_PICKER_PROFILES. */
            readFile: (filePath: string, encoding?: "utf8" | "base64") => Promise<string>;
            readBeatmapAsset: (
                songsPath: string,
                beatmapFolder: string,
                fileName: string,
                encoding: "utf8" | "base64",
            ) => Promise<string>;
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
            calcPP: (args: PPCalcArgs) => Promise<PPCalcResult | null>;
            getScores: (type?: OsuClients, offset?: number, limit?: number) => Promise<IPCR<DefaultObjectWithOffset>>;
            queryLazerBeatmaps: (
                spec: any,
                offset?: number,
                limit?: number,
            ) => Promise<{ data: any[]; total: number; offset: number; next_offset: number; limit: number }>;
            countLazerBeatmaps: (spec: any) => Promise<{ count: number }>;
            /** Dedicated one-map lazer read: full metadata plus stored-file object counts. */
            getLazerBeatmapDetail: (
                request: import("./defines/lazer_structs").LazerBeatmapDetailRequest,
            ) => Promise<IPCR<import("./defines/lazer_structs").LazerBeatmap | null>>;
            lazerRoll: (
                req: import("./defines/lazer_picker").LazerRollRequest,
            ) => Promise<import("./defines/lazer_picker").LazerRollResponse>;
            cmGetState: () => Promise<IPCR<import("./defines/collection_sync").CollectionMergeState>>;
            cmBuildPlan: (
                selections: import("./defines/collection_sync").CollectionMergeSelections,
            ) => Promise<IPCR<import("./defines/collection_sync").CollectionMergePlan>>;
            cmExecute: () => Promise<IPCR<import("./defines/collection_sync").CollectionMergeExecuteResponse>>;
            cmInvalidatePlan: () => Promise<void>;
            csGetState: () => Promise<IPCR<import("./defines/collection_sync").CollectionSyncState>>;
            csSetCollectionType: (
                name: string,
                type: import("./defines/collection_sync").CollectionSyncType,
            ) => Promise<IPCR<import("./defines/collection_sync").CollectionSyncSettings>>;
            csSetExcludeNotFound: (
                enabled: boolean,
            ) => Promise<IPCR<import("./defines/collection_sync").CollectionSyncState>>;
            csBuildPlan: (
                resolutions: import("./defines/collection_sync").CollectionSyncResolution[],
            ) => Promise<IPCR<import("./defines/collection_sync").CollectionSyncPlan>>;
            csCheckMissing: () => Promise<IPCR<import("./defines/collection_sync").MissingBeatmapReport>>;
            onCsMissingProgress: (listener: (resolved: number, total: number) => void) => () => void;
            csExecute: () => Promise<IPCR<import("./defines/collection_sync").CollectionSyncExecuteResponse>>;
            csInvalidatePlan: () => Promise<void>;
            csResetBaseline: () => Promise<IPCR<import("./defines/collection_sync").CollectionSyncBaseline>>;
            csExportSettings: () => Promise<string | null>;
            csImportSettings: () => Promise<IPCR<import("./defines/collection_sync").CollectionSyncSettings> | null>;
            csExportContent: () => Promise<{ filePath: string; collectionCount: number } | null>;
            csImportContent: () => Promise<IPCR<
                import("./defines/collection_sync").CollectionSyncImportSummary
            > | null>;
            queryLazerScoresByHashes: (
                hashes: string[],
                stableDedupKeys?: string[],
            ) => Promise<{ data: any[]; total: number }>;
            queryLazerScoresByUser: (
                userName: string,
                dateFrom?: number,
                dateTo?: number,
                stableDedupKeys?: string[],
                offset?: number,
                limit?: number,
            ) => Promise<DefaultObjectWithOffset>;
            queryStableScoresByUser: (
                userName: string,
                dateFrom?: number,
                dateTo?: number,
                offset?: number,
                limit?: number,
            ) => Promise<DefaultObjectWithOffset>;
            queryStableScoresByHashes: (
                hashes: string[],
                userName?: string,
                offset?: number,
                limit?: number,
            ) => Promise<DefaultObjectWithOffset>;
            queryStableUsers: () => Promise<string[]>;
            queryLazerUsers: () => Promise<{ data: string[]; total: number }>;
            startLazerWatch: () => Promise<void>;
            getStableClientData: () => Promise<StableIpcClientData>;
            initAC: (client_id: string, client_secret: string) => Promise<any>;
            getAC: () => Promise<ApiClient>;
            fetchLangs: () => Promise<{ [key: string]: string }>;
            getLang: (lang: string) => Promise<{ [key: string]: string }>;
            fetchCurrentI18n: () => Promise<string>;
            setI18nLang: (lang: string) => Promise<boolean>;
            onI18nChanged: (listener: (lang: string) => void) => () => void;
            onStableClientDataChanged: (listener: (data: StableIpcClientData) => void) => () => void;
            onStableRecentScoreChanged: (listener: (score: RespUserRecentScore | null) => void) => () => void;
            onStableBeatmapsChanged: (listener: () => void) => () => void;
            onStableScoresChanged: (listener: () => void) => () => void;
            onStableCollectionsChanged: (listener: () => void) => () => void;
            onLazerScoresChanged: (listener: () => void) => () => void;
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
            getPickerProfile: (profileId: string) => Promise<IPickerProfile | null>;
            savePickerProfile: (profileId: string, data: IPickerProfile) => Promise<void>;
            deletePickerProfile: (profileId: string) => Promise<void>;
            listPickerProfiles: () => Promise<string[]>;
            getPickerLog: (profileId: string) => Promise<IPickerHistory[]>;
            savePickerLog: (profileId: string, data: IPickerHistory[]) => Promise<void>;
            migratePickerProfile: (profileId: string, outdatedKeys: string[]) => Promise<IPickerProfile | null>;
            importPickerProfiles: () => Promise<IPickerProfile[]>;
            saveCachedMaps: (user_id: number, beatmap_ids: number[]) => Promise<void>;
            getCachedMaps: (user_id: number) => Promise<RespUserMostPlayedBeatmaps>;
            getDLinkByBeatmapsetId: (beatmapset_id: number) => Promise<IPCR<string>>;
            fecthBeatmapPacks: (type: PackTypes, cursor_string?: string) => Promise<IPCR<RespBeatmapPacks>>;
            getBeatmapPack: (tag_id: any) => Promise<IPCR<CachedBeatmapPack>>;
            /** @deprecated Legacy updater init; fail closed. */
            initUpdater: (config: {
                sources: { url: string }[];
                publicKey?: string;
                concurrency?: number;
            }) => Promise<{ error: string }>;
            /** @deprecated Use checkForGithubUpdate. */
            checkForUpdates: () => Promise<IPCR<UpdateDiff | null>>;
            /** @deprecated Legacy download; fail closed. */
            downloadUpdate: (diff: UpdateDiff) => Promise<{ error: string }>;
            /** @deprecated Legacy execute; fail closed. */
            executeUpdate: (tempDir: string) => Promise<{ error: string }>;
            /** @deprecated Use the new install flow. */
            verifyUpdate: () => Promise<{ error: string }>;
            getCurrentVersion: () => Promise<string>;

            checkForGithubUpdate: () => Promise<UpdateCheckResult>;
            downloadGithubUpdate: () => Promise<{ success: boolean; error?: string }>;
            installPreparedUpdate: () => Promise<boolean>;
            onGithubUpdateProgress: (listener: (progress: UpdateProgress) => void) => () => void;
            fetchBeatmapByChecksum: (checksum: string) => Promise<IPCR<RespBeatmapLookup>>;
            fetchBeatmapById: (beatmapId: number) => Promise<IPCR<RespBeatmapLookup>>;
            getTrackerUserSummary: (userName: string) => Promise<TrackerUserSummary | null>;
            saveTrackerUserSummary: (data: TrackerUserSummary) => Promise<void>;
            listTrackerUserSummaries: () => Promise<TrackerUserSummary[]>;
            // dl (downloader - unified: FDM legacy + built-in)
            initDL: (hostType: HostType) => Promise<boolean>;
            sendMessage4DL: (hostType: HostType, message: any) => Promise<void>;
            dlEnqueue: (req: EnqueueRequest) => Promise<{
                type: "duplicate" | "exists" | "enqueued";
                task?: DownloadTask;
                filename?: string;
                savePath?: string;
            }>;
            dlBatchEnqueue: (reqs: EnqueueRequest[]) => Promise<
                Array<{
                    type: "enqueued" | "duplicate" | "exists";
                    req: EnqueueRequest;
                    task?: DownloadTask;
                    filename?: string;
                    savePath?: string;
                }>
            >;
            dlCancel: (id: string) => Promise<void>;
            dlPause: (id: string) => Promise<void>;
            dlResume: (id: string) => Promise<void>;
            dlRetry: (id: string) => Promise<void>;
            dlClearHistory: (statuses?: string[]) => Promise<void>;
            dlGetAllTasks: () => Promise<DownloadTask[]>;
            dlOpenSaveDir: () => Promise<void>;
            dlRevealFile: (
                filePath: string,
            ) => Promise<{ success: boolean; reason?: "outside_save_dir" | "not_found" | "error" }>;
            dlVerifyFiles: () => Promise<{ changed: number }>;
            dlLoginOsu: () => Promise<{ success: boolean }>;
            dlCheckExists: (filenames: string[]) => Promise<string[]>;
            dlInstallFile: (
                taskId: string,
                clientType?: "stable" | "lazer",
                mode?: "copy" | "ipc",
            ) => Promise<{ success: boolean; installedCount?: number; reason?: string }>;
            dlCheckClient: (clientType: "stable" | "lazer") => Promise<{ ok: boolean }>;
            dlDeleteFile: (taskId: string) => Promise<{ success: boolean }>;
            dlGetRateStatus: () => Promise<Array<{ hostname: string; count: number; limit: number }>>;
            dlOnEvent: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => void;
            dlOffEvent: (listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => void;
            dlOnTaskUpdated: (listener: (event: Electron.IpcRendererEvent, task: DownloadTask) => void) => void;
            dlOffTaskUpdated: (listener: (event: Electron.IpcRendererEvent, task: DownloadTask) => void) => void;
            dlOnTaskRemoved: (listener: (event: Electron.IpcRendererEvent, payload: { id: string }) => void) => void;
            dlOffTaskRemoved: (listener: (event: Electron.IpcRendererEvent, payload: { id: string }) => void) => void;
            dlOnSessionExpired: (listener: (event: Electron.IpcRendererEvent) => void) => void;
            dlOffSessionExpired: (listener: (event: Electron.IpcRendererEvent) => void) => void;
            dlOnAuthRequired: (
                listener: (event: Electron.IpcRendererEvent, payload: { hostname: string }) => void,
            ) => void;
            dlOffAuthRequired: (
                listener: (event: Electron.IpcRendererEvent, payload: { hostname: string }) => void,
            ) => void;
            dlOnLoginResult: (
                listener: (event: Electron.IpcRendererEvent, payload: { success: boolean }) => void,
            ) => void;
            dlOffLoginResult: (
                listener: (event: Electron.IpcRendererEvent, payload: { success: boolean }) => void,
            ) => void;
            // Online DB
            downloadOnlineDb: () => Promise<{
                success: boolean;
                lastUpdate?: number;
                tagCount?: number;
                error?: string;
            }>;
            checkOnlineDbUpdate: () => Promise<{
                needsUpdate: boolean;
                lastUpdate: number;
                dbExists: boolean;
                loaded: boolean;
            }>;
            getOnlineDbStatus: () => Promise<OnlineDbStatus & { lastUpdate: number }>;
            getOnlineTags: () => Promise<OnlineTag[]>;
            searchOnlineTags: (query: string) => Promise<OnlineTag[]>;
            getBeatmapOnlineTags: (beatmapId: number) => Promise<string[]>;
            getAllBeatmapOnlineTags: () => Promise<Array<[number, string[]]>>;
            getBeatmapsByOnlineTag: (tagName: string) => Promise<number[]>;
            getBeatmapSetIdsByApprovedDate: (since?: number, until?: number) => Promise<number[]>;
            getAllOnlineBeatmaps: (
                offset?: number,
                limit?: number,
            ) => Promise<{
                offset: number;
                next_offset: number;
                data: Array<{
                    beatmapId: number;
                    beatmapSetId: number;
                    md5Hash: string;
                    artist: string;
                    songTitle: string;
                    creatorName: string;
                    difficultyName: string;
                    rankedStatus: number;
                    mode: number;
                    tags: string;
                }>;
                total: number;
                limit: number;
            }>;
            // Protocol (osu:// deep link)
            onDeepLink: (listener: (beatmapsetId: number) => void) => () => void;
        };
    }
}
