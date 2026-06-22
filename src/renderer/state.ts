import { AlertProps, SnackbarOrigin } from "@mui/material";
import { action, observable, runInAction } from "mobx";
import { DownloadTask } from "../defines/download_types";
import { UpdateDiff } from "../entrypoint/js/updater";
import { createLogger } from "../utils/logger";
import { ConfigKey, SyncState } from "../utils/typed/config";
import { IBeatmapListProps } from "./components/beatmapList";
import { ICompareListProps } from "./components/compareList";

const log = createLogger("State");

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

interface IGlobalNotify {
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

interface ICheckUpdateDiffResult extends UpdateDiff {
    type: "base";
}

interface ICheckUpdateVersionResult {
    type: "github";
    version: string;
}

type ICheckUpdateResult = ICheckUpdateBaseResult | ICheckUpdateDiffResult | ICheckUpdateVersionResult;

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
    content?: string | (() => React.JSX.Element);
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
    notify?: IGlobalNotify & IGlobalShowable;
    loadingState?: IGlobalLoading;
    dialog?: IDialogState;
    duplicateConfirm: DuplicateConfirmState;
    version: string;

    bumpI18nVersion: () => void;
    setError: (error?: IGlobalError) => void;
    hasError: () => boolean;
    clearError: () => void;
    initConfig: () => Promise<void>;
    saveConfig: (k: string, v: any) => Promise<void>;
    setNotify: (n?: IGlobalNotify) => void;
    hasNotify: () => boolean;
    clearNotify: () => void;
    setLoading: (loading: boolean, message?: string, aborter?: AbortController) => void;
    isLoading: () => boolean;
    checkUpdate: (isForce?: boolean) => Promise<ICheckUpdateResult>;
    setDialog: (is_show: boolean, opt?: Omit<IDialogState, "show">) => void;
    showDuplicateConfirm: (items: Array<{ filename: string; task?: DownloadTask; req: any }>) => Promise<boolean>;
    closeDuplicateConfirm: (confirmed: boolean) => void;
}

const g: IGlobalState = observable({
    cacheVal: {},
    i18nVersion: 0,
    duplicateConfirm: {
        show: false,
        items: [],
    },
}) as unknown as IGlobalState;

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
    setNotify: (n: IGlobalNotify) => {
        let delay = 0;
        if (g.notify?.show === true) {
            g.clearNotify();
            delay = 200;
        }
        setTimeout(
            action(() => {
                g.notify = {
                    ...n,
                    show: true,
                };
            }),
            delay,
        );
    },
    hasNotify: () => g.notify?.show === true,
    clearNotify: action(() => {
        if (g.notify === undefined || g.notify.show === false) return;
        g.notify.show = false;
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
        if (autoCheck || isForce) {
            const updateBaseUrl = g.config?.[ConfigKey.UPDATE_BASE_URL] || "https://olsdk1-page-static.deachsword.com";

            // Check for updates from manifest
            // 1. fetch by updateBaseUrl
            //   - dev or prod
            // 2. fetch by github repo
            //   - prod
            // 3. ingnore
            //   - prod

            await window.olsCore.initUpdater({
                sources: [{ url: updateBaseUrl }],
                publicKey: `-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEAy6o0Ax7zPtaOQdbbmJkNg4ii3AIQqoNHog9YuN5ZWIf+cFp/yUfz\nkWGsc55eDMUgZXD5FyupIYuZ0ACagxq3o6kVnhlfUth32UQeT0xJ5cgD3mRFxoTy\ndDTxja670ak2fAJQGk9nc7vocIdUi2I9eQoyyR1sVJ3FEJLlRf0qTTdIVHQTCEMx\nZuPNJUTPDtQmHyQyqcQpmwh\n+aqD7OhKG5GDZXmmnFTdwxlWqx8NbPnvXlcU0x+F9\n2HsuP6ZNwlgU+a0WBKtU6cPupG2X/ju8x6r+oPbiPq5LQpXKj2Y\n+2mdpiVIQvrEL\nz+qWe/NUXGz64Ar1w6PiAbReqBKLgH1ZkQIDAQAB\n-----END RSA PUBLIC KEY-----`,
            });
            const diff = await window.olsCore.checkForUpdates();
            if (diff && "error" in diff) {
                try {
                    const response = await fetch("https://api.github.com/repos/WEDeach/olsync/releases/latest");
                    if (response.ok) {
                        const data = await response.json();
                        log.debug(data);
                        const ov = data.tag_name?.replace(/^v/, "");
                        return { type: "github", version: ov };
                    }
                } catch (error) {
                    log.error("Failed to check for updates from manifest:", error);
                }
            } else if (diff?.needsUpdate) {
                return { type: "base", ...diff };
            }
        }
        return { type: "ignore" };
    },
    setDialog: action((is_show: boolean, opt?: Omit<IDialogState, "show">) => {
        if (!is_show && g.dialog?.show) {
            g.dialog.show = is_show;
            return;
        }
        g.dialog = {
            show: is_show,
            ...opt,
        };
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
