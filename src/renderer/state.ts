import { AlertProps, SnackbarOrigin } from "@mui/material";
import { action, observable, runInAction } from "mobx";
import { DownloadTask } from "../defines/download_types";
import { ConfigKey, SyncState } from "../utils/typed/config";
import { IBeatmapListProps } from "./components/beatmapList";
import { ICompareListProps } from "./components/compareList";

interface IGlobalError {
    message: string;
}

interface IGlobalCacheValue {
    str_path_osu?: string;
    str_path_lazer?: string;
    str_client_id?: string;
    str_client_secret?: string;
    ss_last_updated?: number;
    ss_last_offset?: number;
    ss_player_id?: string;
}

export interface IGlobalNotify {
    id: number;
    message: string;
    severity?: AlertProps["severity"];
    action?: React.ReactNode;
    anchorOrigin?: SnackbarOrigin;
    autoHideDuration?: number;
}

interface IGlobalLoading {
    loading: boolean;
    message?: string;
    aborter?: AbortController;
}

interface IGlobalShowable {
    show: boolean;
}

interface ICheckUpdateBaseResult {
    type: "ignore";
}

interface ICheckUpdateUpToDateResult {
    type: "upToDate";
    currentVersion: string;
}

interface ICheckUpdateAvailableResult {
    type: "available";
    currentVersion: string;
    targetVersion: string;
    kind: "diff" | "overall" | "full";
    size: number;
    releasePageUrl: string;
    releaseNotes?: string;
}

interface ICheckUpdateManualResult {
    type: "manual";
    currentVersion: string;
    targetVersion: string;
    releasePageUrl: string;
    reason: string;
    releaseNotes?: string;
}

interface ICheckUpdateErrorResult {
    type: "error";
    error: string;
}

type ICheckUpdateResult =
    | ICheckUpdateBaseResult
    | ICheckUpdateUpToDateResult
    | ICheckUpdateAvailableResult
    | ICheckUpdateManualResult
    | ICheckUpdateErrorResult;

export interface NewSyncState extends SyncState {
    new_count?: number;
}

interface DialogActionProps {
    label: string;
    callback: () => void;
}

export interface IDialogState {
    show: boolean;
    title?: string;
    content?: React.ReactNode | (() => React.ReactNode);
    beatmaps?: IBeatmapListProps;
    compares?: ICompareListProps;
    actions?: DialogActionProps[];
    syncState?: NewSyncState;
    renderFor?: string;
}

interface DuplicateConfirmState {
    show: boolean;
    items: Array<{ filename: string; task?: DownloadTask; req: any }>;
    resolve?: (confirmed: boolean) => void;
}

interface IGlobalState {
    config?: { [key: string]: any };
    isDev: boolean;
    i18nVersion: number;
    error?: IGlobalError & IGlobalShowable;
    cacheVal: IGlobalCacheValue;
    notifies: IGlobalNotify[];
    loadingState?: IGlobalLoading;
    dialog?: IDialogState;
    duplicateConfirm: DuplicateConfirmState;
    onboarding?: { open: boolean; topic?: string };
    version: string;

    bumpI18nVersion: () => void;
    setError: (error?: IGlobalError) => void;
    hasError: () => boolean;
    clearError: () => void;
    initConfig: () => Promise<void>;
    saveConfig: (k: string, v: any) => Promise<void>;
    setNotify: (n?: Omit<IGlobalNotify, "id">) => void;
    hasNotify: () => boolean;
    clearNotify: (id?: number) => void;
    setLoading: (loading: boolean, message?: string, aborter?: AbortController) => void;
    isLoading: () => boolean;
    checkUpdate: (isForce?: boolean) => Promise<ICheckUpdateResult>;
    setDialog: (is_show: boolean, opt?: Omit<IDialogState, "show">) => void;
    setOnboarding: (open: boolean, topic?: string) => void;
    showDuplicateConfirm: (items: Array<{ filename: string; task?: DownloadTask; req: any }>) => Promise<boolean>;
    closeDuplicateConfirm: (confirmed: boolean) => void;
}

const g: IGlobalState = observable(
    {
        cacheVal: {},
        i18nVersion: 0,
        notifies: [],
        // Keys must exist in the source object for their annotations to apply.
        dialog: undefined,
        loadingState: undefined,
        duplicateConfirm: {
            show: false,
            items: [],
        },
    },
    {
        // Fields that may carry React nodes (notify `action`, dialog `content`)
        // must not be deep-proxied: React calls internal methods on elements
        // (e.g. element._debugTask.run in dev builds) and throws "illegal
        // receiver" when `this` is a MobX proxy. Shallow keeps the items
        // themselves raw while the array/object properties stay reactive.
        notifies: observable.shallow,
        dialog: observable.shallow,
        loadingState: observable.shallow,
    },
) as unknown as IGlobalState;

Object.assign(g, {
    bumpI18nVersion: action(() => {
        g.i18nVersion += 1;
    }),
    setError: action((error: IGlobalError) => {
        g.error = {
            ...error,
            show: true,
        };
    }),
    hasError: () => g.error?.show === true,
    clearError: action(() => {
        if (g.error === undefined || g.error.show === false) return;
        g.error.show = false;
    }),
    initConfig: action(async () => {
        if (g.config !== undefined) return;
        await window.olsCore.initConfig();
        g.config = await window.olsCore.getConfigAll();
        const isDevMode = await window.olsCore.isDevMode();
        const version = await window.olsCore.getCurrentVersion();
        runInAction(() => {
            g.isDev = isDevMode;
            g.version = version;
            g.cacheVal.str_path_osu = g.config?.[ConfigKey.PATH_STABLE_DIR];
            g.cacheVal.str_path_lazer = g.config?.[ConfigKey.PATH_LAZER_REALM];
            g.cacheVal.str_client_id = g.config?.[ConfigKey.API_CLIENT_ID];
            g.cacheVal.str_client_secret = g.config?.[ConfigKey.API_CLIENT_SECRET];
            g.cacheVal.ss_last_offset = g.config?.[ConfigKey.SYNC_LAST_OFFSET];
            g.cacheVal.ss_last_updated = g.config?.[ConfigKey.SYNC_LAST_UPDATED];
            g.cacheVal.ss_player_id = g.config?.[ConfigKey.SYNC_PLAYER_ID];
        });
    }),
    saveConfig: action(async (k: string, v: any) => {
        if (g.config === undefined) {
            // not yet initialized
            throw new Error("Config has not been initialized.");
        }
        g.config[k] = v;
        await window.olsCore.saveConfig(k, v);
    }),
    setNotify: (n: Omit<IGlobalNotify, "id">) => {
        const id = Date.now() + Math.random();
        action(() => {
            g.notifies.push({ ...n, id });
        })();
    },
    hasNotify: () => g.notifies.length > 0,
    clearNotify: action((id?: number) => {
        if (id === undefined) {
            g.notifies.splice(0);
        } else {
            const idx = g.notifies.findIndex((n) => n.id === id);
            if (idx >= 0) g.notifies.splice(idx, 1);
        }
    }),
    setLoading: action((loading: boolean, message?: string, aborter?: AbortController) => {
        g.loadingState = {
            loading,
            message,
            aborter,
        };
    }),
    isLoading: () => g.loadingState?.loading === true,
    checkUpdate: async (isForce: boolean = false): Promise<ICheckUpdateResult> => {
        const autoCheck = g.config?.[ConfigKey.UPDATE_AUTO_CHECK] ?? true;
        if (!autoCheck && !isForce) {
            return { type: "ignore" };
        }

        const result = await window.olsCore.checkForGithubUpdate();
        if ("error" in result && typeof result.error === "string") {
            return { type: "error", error: result.error };
        }

        if (result.status === "upToDate") {
            return { type: "upToDate", currentVersion: result.currentVersion };
        }

        if (result.status === "manual") {
            return {
                type: "manual",
                currentVersion: result.currentVersion,
                targetVersion: result.targetVersion,
                releasePageUrl: result.releasePageUrl,
                reason: result.reason,
                releaseNotes: result.releaseNotes,
            };
        }

        if (result.status === "available") {
            return {
                type: "available",
                currentVersion: result.currentVersion,
                targetVersion: result.targetVersion,
                kind: result.kind,
                size: result.size,
                releasePageUrl: result.releasePageUrl,
                releaseNotes: result.releaseNotes,
            };
        }

        return { type: "ignore" };
    },
    setDialog: action((is_show: boolean, opt?: Omit<IDialogState, "show">) => {
        if (!is_show) {
            g.dialog = { show: false };
            return;
        }
        g.dialog = {
            show: is_show,
            ...opt,
        };
    }),
    setOnboarding: action((open: boolean, topic?: string) => {
        g.onboarding = { open, topic };
    }),
    showDuplicateConfirm: action((items: Array<{ filename: string; task?: DownloadTask; req: any }>) => {
        return new Promise<boolean>((resolve) => {
            g.duplicateConfirm = {
                show: true,
                items,
                resolve,
            };
        });
    }),
    closeDuplicateConfirm: action((confirmed: boolean) => {
        if (g.duplicateConfirm.resolve) {
            g.duplicateConfirm.resolve(confirmed);
        }
        g.duplicateConfirm = {
            show: false,
            items: [],
        };
    }),
});

export default g;
