import { Box, Typography } from "@mui/material";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import React from "react";
import { RespUserMostPlayedBeatmaps } from "../../api/v2/types/api_resp";
import { LazerScore } from "../../defines/lazer_structs";
import { StableLocalBeatmap, StableScoreBeatmapData } from "../../defines/stable_structs";
import { OsuClients } from "../../defines/types";
import { UpdateProgress } from "../../entrypoint/js/updater/types";
import { getApiPreDelayMs, InitApi } from "../../utils/api";
import { getUseLazerModeExperiment } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { LogError } from "../../utils/log";
import { lazerScoreToOsuScore, makeScoreDedupKey } from "../../utils/osu";
import { readAllWithOffset } from "../../utils/reader";
import { sleep } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import { TGroupedLocalMap } from "../components/beatmapRestorer";
import { ReleaseNotes } from "../components/releaseNotes";
import { IPropertyWithName } from "../components/table";
import g, { IDialogState, NewSyncState } from "../state";

export enum SubViewType {
    NONE = 0,
    COLLECTION = 1,
    OSU_DATABASE = 11,
    SONG_RECOVERY_BY_SCORES = 21,
    SONG_RECOVERY_BY_API,
    MAP_PACKS = 31,
    MAP_PICKER = 41,
    TRACKER = 51,
    DOWNLOAD_HISTORY = 61,
    //
    D_STABLE = 1001,
    D_LAZER,
    D_API,
    D_DLX,
}

export enum MainViewState {
    NONE = 0,
    //
    COLLECTION_IDLE = 10,
    COLLECTION_READ = 11,
    COLLECTION_SELECT = 12,
    COLLECTION_MERGE_CONFIRM = 13,
    COLLECTION_MERGE = 14,
    COLLECTION_SYNC = 15,
    //
    SRS_IDLE = 20,
    SRS_READ = 21,
    SRS_RESULTS = 25,
    //
    BPAKS_IDLE = 30,
    BPAKS_READ = 31,
    BPAKS_RESULTS = 35,
}

interface LoadingState {
    loading: boolean;
    message?: string;
    aborter?: AbortController;
}

interface ListItem {
    label: string;
    img?: string;
}

interface CachedVal {
    key: string;
    val: any;
}

enum CachedLegacyKey {
    LocalMaps = "#local_maps",
    OnlineMaps = "#online_maps",
    LocalScores = "#local_scores",
}

interface State {
    path_lazer?: string;
    path_stable?: string;
    s_tables?: string[];
    s_schema_name?: string;
    s_schema_keys?: IPropertyWithName[];
    s_schema_rows?: Record<string, unknown>[];
    s_schema_rows_loaded?: boolean;
    s_schema_rows_page?: number;
    s_sub_view?: SubViewType;
    s_main?: MainViewState;
    s_loading?: LoadingState;
    s_cached_vals?: CachedVal[];
    v_sub?: React.ComponentType<any>;
    v_list?: ListItem[];
    s_show_user_dialog?: boolean;
    s_show_api_secret?: boolean;
}

let PAGE_SIZE = 50;

export default class Controller {
    state: State;
    private _local_beatmaps: TGroupedLocalMap | null = null;
    private _local_scores: string[] | null = null;
    private _online_beatmaps: RespUserMostPlayedBeatmaps | null = null;

    constructor() {
        this.state = {};

        g.initConfig().then(async () => {
            PAGE_SIZE = Number(g.config?.[ConfigKey.PAGE_SIZE]) || 50;
            this.checkUpdate();

            const configLang = g.config?.[ConfigKey.I18N_LANG];
            if (configLang) {
                const langs = await window.olsCore.fetchLangs();
                if (!langs[configLang]) {
                    g.setDialog(true, {
                        content: __(I18nStrings.MAIN_I18N_FILE_MISSING, { lang: configLang }),
                        actions: [
                            { label: __(I18nStrings.BTN_CANCEL), callback: () => g.setDialog(false) },
                            {
                                label: __(I18nStrings.BTN_RESET),
                                callback: () => {
                                    g.saveConfig(ConfigKey.I18N_LANG, null);
                                    g.setDialog(false);
                                },
                            },
                        ],
                    });
                }
            }
        });

        makeAutoObservable(this, {
            _local_beatmaps: observable.ref,
            _online_beatmaps: observable.ref,
        } as any);
    }

    get LazerPath() {
        return g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";
    }

    get StablePath() {
        return g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
    }

    get IsDev() {
        return g.isDev ?? false;
    }

    get ClientId() {
        return g.config?.[ConfigKey.API_CLIENT_ID] ?? "";
    }

    get ClientSecret() {
        return g.config?.[ConfigKey.API_CLIENT_SECRET] ?? "";
    }

    get CClientId() {
        return g.cacheVal.str_client_id ?? "";
    }

    get CClientSecret() {
        return g.cacheVal.str_client_secret ?? "";
    }

    get Version() {
        return g.version;
    }

    get SyncTargetId() {
        return g.config?.[ConfigKey.SYNC_PLAYER_ID] ?? "";
    }

    get CSyncTargetId() {
        return g.cacheVal.ss_player_id ?? "";
    }

    get SSubView() {
        return this.state.s_sub_view ?? SubViewType.NONE;
    }

    get SMain() {
        return this.state.s_main ?? MainViewState.NONE;
    }

    get SubView() {
        return this.state.v_sub;
    }

    get STables() {
        return this.state.s_tables ?? [];
    }

    get SSchemaKeys() {
        if (this.STables.length === 0) return [];
        return this.state.s_schema_keys ?? [];
    }

    get SSchemaRows() {
        if (this.STables.length === 0) return [];
        return this.state.s_schema_rows ?? [];
    }

    get SSchemaName() {
        return this.state.s_schema_name;
    }

    get SSchemaRowsLoaded() {
        return this.state.s_schema_rows_loaded ?? true;
    }

    get SSchemaRowsPage() {
        return this.state.s_schema_rows_page ?? 0;
    }

    get SLoading() {
        return (
            g.loadingState ?? {
                loading: false,
            }
        );
    }

    get SDialog() {
        return (
            g.dialog ?? {
                show: false,
            }
        );
    }

    get SShowUserDialog() {
        return this.state.s_show_user_dialog ?? false;
    }

    get SCachedVals() {
        return this.state.s_cached_vals ?? [];
    }

    get VList() {
        return this.state.v_list;
    }

    get LocalMaps() {
        return this._local_beatmaps;
    }

    get OnlineMaps() {
        return this._online_beatmaps;
    }

    get LocalScores() {
        return this._local_scores;
    }

    get SShowApiSecret() {
        return this.state.s_show_api_secret ?? false;
    }

    onBtnSRSReadClicked = async (removeLocalMaps: boolean = true) => {
        runInAction(() => {
            this.state.s_main = MainViewState.SRS_READ;
            this.SetLoadingState(true, __(I18nStrings.MAIN_SRS_READING_SCORES));
        });

        try {
            this.RemoveCacheVal(CachedLegacyKey.LocalScores);
            if (removeLocalMaps) {
                this._local_beatmaps = null;
            }
            if (this.StablePath.length > 0) {
                await window.olsCore.initStableReader(this.StablePath);
                let scoreData: StableScoreBeatmapData[] = [];
                const stableRaw = await window.olsCore.getScores(OsuClients.Stable, 0, PAGE_SIZE);
                if (!("error" in stableRaw)) {
                    const fetch_fn = async (offset: number, limit: number) =>
                        (await window.olsCore.getScores(OsuClients.Stable, offset, limit)) as any;
                    const allStable = await readAllWithOffset(fetch_fn, stableRaw);
                    scoreData = allStable.data as StableScoreBeatmapData[];
                }

                const lazerPath = g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";
                if (lazerPath && getUseLazerModeExperiment()) {
                    try {
                        await window.olsCore.initReader(lazerPath);
                        const stableHashes = scoreData.map((d) => d.md5Hash);
                        const stableDedupKeys: string[] = [];
                        for (const sd of scoreData) {
                            for (const sc of sd.scores) {
                                stableDedupKeys.push(
                                    makeScoreDedupKey(sd.md5Hash, sc.totalScore, sc.date, sc.maxCombo),
                                );
                            }
                        }
                        const HASH_BATCH = 500;
                        const allLazerScores: LazerScore[] = [];
                        for (let i = 0; i < stableHashes.length; i += HASH_BATCH) {
                            const batch = stableHashes.slice(i, i + HASH_BATCH);
                            const result = await window.olsCore.queryLazerScoresByHashes(batch, stableDedupKeys);
                            allLazerScores.push(...(result.data as LazerScore[]));
                        }
                        if (allLazerScores.length > 0) {
                            const byHash = new Map(scoreData.map((d) => [d.md5Hash, d]));
                            for (const ls of allLazerScores) {
                                const hash = ls.BeatmapInfo?.MD5Hash ?? ls.BeatmapHash;
                                if (!hash) continue;
                                const converted = lazerScoreToOsuScore(ls);
                                const existing = byHash.get(hash);
                                if (existing) {
                                    existing.scoreCount++;
                                    existing.scores.push(converted);
                                } else {
                                    const entry: StableScoreBeatmapData = {
                                        md5Hash: hash,
                                        scoreCount: 1,
                                        scores: [converted],
                                    };
                                    scoreData.push(entry);
                                    byHash.set(hash, entry);
                                }
                            }
                        }
                    } catch {
                        // lazer not available
                    }
                }

                if (scoreData.length === 0) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_SRS_READING_FAILED, {
                            reason: __(I18nStrings.MAIN_SRS_SCORES_DB_NOT_FOUND),
                        }),
                        severity: "error",
                    });
                    this.SetLoadingState(false);
                    return;
                }

                this.SetCacheVal("scores", scoreData.length);
                this.SetCacheVal(CachedLegacyKey.LocalScores, scoreData);
                // scores -> GET maps's hash
                //
                // a. local: hash -> map_id
                // b. online: api fetch by hash -> map_id
                //
                // results: non-local maps

                if (removeLocalMaps) {
                    runInAction(() => {
                        this.SetLoadingState(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                    });
                    const local = await window.olsCore.getStableBeatmapIndex();
                    this.SetCacheVal("local_maps", local.data.length);
                    this.SetCacheVal(CachedLegacyKey.LocalMaps, local.data);
                }

                runInAction(() => {
                    this.state.s_main = MainViewState.SRS_RESULTS;
                });
            }
        } catch (error) {
            LogError(error);
        } finally {
            runInAction(() => {
                this.SetLoadingState(false);
            });
        }
    };

    onBtnSRSReadByOnlineClicked = async () => {
        // 1. Init API client
        // 2. Fetch token cached or exchange new token and save client id and secret
        //    -  Fetch token: use client id and secret to check cached token
        //       -  Found: use cached token
        //       -  Not found: exchange new token
        //    -  Exchange token: use client id and secret to exchange token
        // 3. Fetch user's logs
        this.SetLoadingState(true, __(I18nStrings.MAIN_SRS_READING_ONLINE));
        try {
            await InitApi(() => {
                this.SetShowUserDialogState(true);
            });
        } catch (error) {
            LogError(error);
        }
        this.SetLoadingState(false);
    };

    onBtnSRSPlayerConfirmClicked = async () => {
        const f_save_cache_alawys = g.config?.[ConfigKey.SYNC_ALAWAYS_SAVE_CACHE] ?? true;
        const i_pre_count = g.config?.[ConfigKey.SYNC_PRE_COUNT] ? Number(g.config?.[ConfigKey.SYNC_PRE_COUNT]) : 100;
        const user_cache = this.SCachedVals.find((v) => v.key === "#sync_player");
        if (!user_cache) return;

        this.SetShowUserDialogState(false);
        g.saveConfig(ConfigKey.SYNC_PLAYER_ID, this.CSyncTargetId);

        const sync_count = user_cache.val.beatmap_playcounts_count;
        const ss_result = await window.olsCore.getSyncStateByUserId(this.SyncTargetId);
        let sync_state: NewSyncState = {
            player_id: this.SyncTargetId,
            last_count: 0,
            last_offset: 0,
            last_updated: 0,
            new_count: sync_count,
        };
        if (ss_result) {
            if ("error" in ss_result) {
                LogError(ss_result.error);
            } else {
                sync_state = ss_result;
            }
        }
        sync_state.new_count = sync_count;
        sync_state = observable(sync_state);
        const worker = async (clearState: boolean) => {
            runInAction(() => {
                this._online_beatmaps = null;
            });
            if (sync_state.new_count) {
                let _fc = -1;
                let results: RespUserMostPlayedBeatmaps = [];
                if (clearState) {
                    runInAction(() => {
                        sync_state.last_offset = 0;
                        sync_state.last_count = 0;
                    });
                } else {
                    this.SetLoadingState(true, `${__(I18nStrings.MAIN_SRS_READING_LOCAL)}...`);
                    results = await window.olsCore.getCachedMaps(this.SyncTargetId);
                    this.SetLoadingState(false);
                }
                const aborter = new AbortController();
                while (_fc !== 0 && !aborter.signal.aborted) {
                    const result = await window.olsCore.getUserMostPlayedBeatmaps(
                        this.SyncTargetId,
                        i_pre_count,
                        sync_state.last_offset || 0,
                    );
                    _fc = result.length;
                    results = results.concat(result);
                    runInAction(() => {
                        sync_state.last_offset = (sync_state.last_offset || 0) + _fc;
                        sync_state.last_count = results.length;
                    });
                    this.SetLoadingState(
                        true,
                        `${__(I18nStrings.MAIN_SRS_READING_ONLINE)}...\n${sync_state.last_offset || 0} | ${results.length}/${sync_state.new_count}`,
                        aborter,
                    );
                    if (f_save_cache_alawys) {
                        await window.olsCore.saveCachedMaps(
                            this.SyncTargetId,
                            results.map((v) => v.beatmap_id),
                        );
                    }
                    await sleep(getApiPreDelayMs(), aborter.signal);
                }
                this.SetLoadingState(false);
                runInAction(() => {
                    sync_state.last_updated = Date.now();
                    this._online_beatmaps = results;
                });
                await window.olsCore.saveSyncStateByUserId(
                    this.SyncTargetId,
                    sync_state.last_count,
                    sync_state.last_offset,
                    sync_state.last_updated,
                );
                if (!f_save_cache_alawys) {
                    await window.olsCore.saveCachedMaps(
                        this.SyncTargetId,
                        results.map((v) => v.beatmap_id),
                    );
                }
                this.SetCacheVal("online_maps", results.length);
                if (!aborter.signal.aborted) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_SRS_READING_ONLINE_SUCCESS),
                        severity: "success",
                    });
                    try {
                        runInAction(() => {
                            this.state.s_main = MainViewState.SRS_READ;
                            this.SetLoadingState(true, __(I18nStrings.MAIN_SRS_READING_SCORES));
                        });
                        if (this.StablePath.length > 0) {
                            await window.olsCore.initStableReader(this.StablePath);
                            runInAction(() => {
                                this.SetLoadingState(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                            });
                            const local = await window.olsCore.getStableBeatmapIndex();
                            this.SetCacheVal("local_maps", local.data.length);
                            this.SetCacheVal(CachedLegacyKey.LocalMaps, local.data);
                            await this.onBtnSRSReadClicked(false);
                            runInAction(() => {
                                this.state.s_main = MainViewState.SRS_RESULTS;
                            });
                        }
                    } catch (error) {
                        LogError(error);
                    } finally {
                        runInAction(() => {
                            this.SetLoadingState(false);
                            this.SetDialogState(false);
                        });
                    }
                } else {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_SRS_READING_ONLINE_ABORTED),
                        severity: "warning",
                    });
                }
            } else {
                g.setNotify({
                    message: __(I18nStrings.MAIN_SRS_READING_ONLINE_NO_DATA),
                    severity: "warning",
                });
            }
        };
        this.SetDialogState(true, {
            title: __(I18nStrings.MAIN_SRS_READING_ONLINE),
            syncState: sync_state,
            actions: [
                {
                    label: __(I18nStrings.BTN_SRS_READ_BY_ONLINE_WITH_CACHED),
                    callback: async () => {
                        await worker(false);
                    },
                },
                {
                    label: __(I18nStrings.BTN_SRS_READ_BY_ONLINE),
                    callback: async () => {
                        if (confirm(__(I18nStrings.MAIN_SRS_READING_ONLINE_ALERT))) {
                            await worker(true);
                        }
                    },
                },
            ],
        });
    };

    onBtnCollectionMergeClicked = () => {
        runInAction(() => {
            this.state.s_main = MainViewState.COLLECTION_MERGE;
        });
    };

    onBtnCollectionSyncClicked = () => {
        runInAction(() => {
            this.state.s_main = MainViewState.COLLECTION_SYNC;
        });
    };

    onBtnCollectionBackClicked = () => {
        runInAction(() => {
            this.state.s_main = MainViewState.COLLECTION_IDLE;
        });
    };

    onBtnDebugClicked = async (_: any, value: SubViewType) => {
        let view: any;
        switch (value) {
            case SubViewType.NONE:
                runInAction(() => {
                    this.state.v_sub = undefined;
                });
                break;
            case SubViewType.D_STABLE:
                this.onBtnOsuDebugClicked();
                break;
            case SubViewType.D_LAZER:
                this.onBtnLazerDebugClicked();
                break;
            case SubViewType.D_API:
                view = await import("../debug_views/api/main");
                runInAction(() => {
                    this.state.v_sub = () => React.createElement(view.default);
                });
                break;
            case SubViewType.D_DLX:
                view = await import("../debug_views/dl_test/main");
                runInAction(() => {
                    this.state.v_sub = () => React.createElement(view.default);
                });
                break;
        }
        runInAction(() => {
            this.state.s_sub_view = value;
        });
    };

    @action
    SetSubView = (value: SubViewType) => {
        this.state.s_sub_view = value;
        this.state.v_sub = undefined;
    };

    @action
    SwitchView = (value: SubViewType) => {
        switch (value) {
            case SubViewType.NONE:
                this.state.s_main = MainViewState.NONE;
                break;
            case SubViewType.COLLECTION:
                this.state.s_main = MainViewState.COLLECTION_IDLE;
                break;
            case SubViewType.SONG_RECOVERY_BY_SCORES:
                this.state.s_main = MainViewState.SRS_IDLE;
                break;
            case SubViewType.MAP_PACKS:
                this.state.s_main = MainViewState.BPAKS_IDLE;
                break;
        }
        this.state.s_sub_view = value;

        // clear state values
        this.state.v_sub = undefined;
        this.state.v_list = undefined;

        // clear bulky cached collections/scores so they don't stay in renderer memory
        this.RemoveCacheVal(CachedLegacyKey.LocalMaps);
        this.RemoveCacheVal(CachedLegacyKey.LocalScores);
        this.RemoveCacheVal(CachedLegacyKey.OnlineMaps);
    };

    onBtnViewClicked = async (_: any, value: SubViewType) => {
        runInAction(() => {
            this.SwitchView(value);
        });
    };

    onBtnLazerDebugClicked = async () => {
        const view = await import("../debug_views/lazer/main");
        runInAction(() => {
            this.state.v_sub = () => React.createElement(view.default);
        });
    };

    onBtnOsuDebugClicked = async () => {
        const view = await import("../debug_views/stable/main");
        runInAction(() => {
            this.state.v_sub = () => React.createElement(view.default);
        });
    };

    onBtnSchemaClicked = async (name: string) => {
        this.state.s_schema_keys = [];
        this.state.s_schema_rows = [];
        const schema = await window.olsCore.getSchema(name);
        if (schema) {
            Object.entries(schema.properties).forEach(([_, propSchema]) => {
                runInAction(() => {
                    this.state.s_schema_name = name;
                    this.state.s_schema_rows = [];
                    this.state.s_schema_rows_page = 0;
                    this.state.s_schema_rows_loaded = true;
                    this.state.s_schema_keys = [
                        ...this.SSchemaKeys,
                        {
                            ...propSchema,
                        },
                    ];
                });
            });

            await this.loadSchemaObjs();
        }
    };

    loadSchemaObjs = async () => {
        if (!this.SSchemaRowsLoaded) return;

        const currentSchema = this.SSchemaName;
        if (!currentSchema) return;

        runInAction(() => {
            this.state.s_schema_rows_loaded = false;
        });

        const nextPage = this.SSchemaRowsPage + 1;
        const offset = (nextPage - 1) * PAGE_SIZE;

        try {
            const moreData = await window.olsCore.getSchemaObjs(currentSchema, PAGE_SIZE, offset);

            runInAction(() => {
                const rs = observable([...this.SSchemaRows, ...moreData], {
                    deep: false,
                });
                this.state.s_schema_rows = rs;
                this.state.s_schema_rows_page = nextPage;
            });
        } finally {
            runInAction(() => {
                this.state.s_schema_rows_loaded = true;
            });
        }
    };

    onBtnCloseLazerClicked = async () => {
        await window.olsCore.closeReader();

        this.state.s_tables = [];
    };

    onBtnCheckUserIdClicked = async () => {
        const cache = this.SCachedVals.find((v) => v.key === "#sync_player");
        if (cache?.val.id === this.CSyncTargetId || cache?.val.name === this.CSyncTargetId) return;

        this.SetLoadingState(true);
        const user = await window.olsCore.getUserInfo(this.CSyncTargetId);
        if (user && "error" in user) {
            LogError(user.error);
        } else {
            const user_cache = {
                name: user.username,
                pic: user.avatar_url,
                id: user.id,
                country: user.country_code,
                beatmap_playcounts_count: user.beatmap_playcounts_count,
            };
            if (this.CSyncTargetId !== user.id.toString()) {
                // Fix the user name to user id
                await this.OnSyncPlayerIdChanged(user.id.toString());
            }
            this.SetCacheVal("#sync_player", user_cache);
        }
        this.SetLoadingState(false);
    };

    @action
    SetLoadingState = (is_loading: boolean, msg?: string, aborter?: AbortController) => {
        g.setLoading(is_loading, msg, aborter);
    };

    SetDialogState = (is_show: boolean, opt?: Omit<IDialogState, "show">) => {
        g.setDialog(is_show, opt);
    };

    @action
    SetShowUserDialogState = (is_show: boolean) => {
        this.state.s_show_user_dialog = is_show;
    };

    @action
    SetCacheVal = (cache_key: string, val: any) => {
        switch (cache_key) {
            case CachedLegacyKey.LocalMaps:
                this._local_beatmaps = new Map<number, StableLocalBeatmap>();
                val.forEach((map: StableLocalBeatmap) => {
                    if (this._local_beatmaps) {
                        this._local_beatmaps.set(map.beatmapId, {
                            beatmapSetId: map.beatmapSetId,
                            beatmapId: map.beatmapId,
                            md5Hash: map.md5Hash,
                        });
                    }
                });
                break;
            case CachedLegacyKey.LocalScores:
                this._local_scores = [];
                val.forEach((score: StableScoreBeatmapData) => {
                    if (this._local_scores) {
                        this._local_scores.push(score.md5Hash);
                    }
                });
                break;
            default: {
                let cv = this.SCachedVals.find((v) => v.key === cache_key);
                if (!cv) {
                    cv = {
                        key: cache_key,
                        val: val,
                    };
                    this.state.s_cached_vals = [...this.SCachedVals, cv];
                } else {
                    cv.val = val;
                }
                break;
            }
        }
    };

    @action
    RemoveCacheVal = (cache_key: string) => {
        this.state.s_cached_vals = this.SCachedVals.filter((v) => v.key !== cache_key);
        switch (cache_key) {
            case CachedLegacyKey.LocalMaps:
                this._local_beatmaps = null;
                break;
            case CachedLegacyKey.LocalScores:
                this._local_scores = null;
                break;
            case CachedLegacyKey.OnlineMaps:
                this._online_beatmaps = null;
                break;
            default:
                break;
        }
    };

    OnSyncPlayerIdChanged = async (player_id: string) => {
        runInAction(() => {
            g.cacheVal.ss_player_id = player_id;
        });
    };

    async checkUpdate(isForce: boolean = false) {
        this.SetLoadingState(isForce, __(I18nStrings.MAIN_UPDATE_CHECKING));
        const us = await g.checkUpdate(isForce);
        this.SetLoadingState(false);

        const btns = [
            {
                label: __(I18nStrings.BTN_CANCEL),
                callback: () => this.SetDialogState(false),
            },
        ];

        if (us.type === "error") {
            return this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_FAILED),
                content: us.error,
                actions: btns,
            });
        }

        if (us.type === "manual") {
            return this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_AVAILABLE),
                content: (
                    <>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_VERSION_LATEST, { version: us.targetVersion })}
                        </Typography>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_VERSION_CURRENT, { version: us.currentVersion })}
                        </Typography>
                        <Typography variant="body1">{us.reason}</Typography>
                        {this.renderReleaseNotes(us.releaseNotes)}
                    </>
                ),
                actions: [
                    {
                        label: __(I18nStrings.BTN_UPDATE_REPO),
                        callback: async () => {
                            await window.olsCore.openExternal(us.releasePageUrl);
                        },
                    },
                    ...btns,
                ],
            });
        }

        if (us.type === "available") {
            const sizeMB = (us.size / 1024 / 1024).toFixed(2);
            return this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_AVAILABLE),
                content: (
                    <>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_VERSION_LATEST, { version: us.targetVersion })}
                        </Typography>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_VERSION_CURRENT, { version: us.currentVersion })}
                        </Typography>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_INFO_KIND, { kind: us.kind })}
                        </Typography>
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_UPDATE_INFO_SIZE, { size: sizeMB })}
                        </Typography>
                        {this.renderReleaseNotes(us.releaseNotes)}
                    </>
                ),
                actions: [
                    {
                        label: __(I18nStrings.BTN_UPDATE_DOWNLOAD),
                        callback: async () => {
                            await this.downloadUpdate();
                        },
                    },
                    {
                        label: __(I18nStrings.BTN_UPDATE_REPO),
                        callback: async () => {
                            await window.olsCore.openExternal(us.releasePageUrl);
                        },
                    },
                    ...btns,
                ],
            });
        }

        if (isForce) {
            const version = us.type === "upToDate" ? us.currentVersion : this.Version;
            return this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_NO_UPDATE),
                content: __(I18nStrings.MAIN_UPDATE_VERSION_CURRENT, {
                    version: version || `${this.Version}@local`,
                }),
                actions: btns,
            });
        }
    }

    private renderReleaseNotes(notes: string | undefined) {
        if (!notes || !notes.trim()) {
            return null;
        }
        return (
            <Box sx={{ mt: 1.5 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {__(I18nStrings.MAIN_UPDATE_RELEASE_NOTES)}
                </Typography>
                <ReleaseNotes notes={notes} />
            </Box>
        );
    }

    private async downloadUpdate() {
        this.SetDialogState(false);
        this.SetLoadingState(true, __(I18nStrings.MAIN_UPDATE_DOWNLOADING, { current: 0, total: 1 }));

        const progressHandler = (progress: UpdateProgress) => {
            const percent = progress.total > 0 ? ((progress.current / progress.total) * 100).toFixed(0) : "0";
            const extra = progress.currentFile ? `${progress.currentFile} (${percent}%)` : `${percent}%`;
            this.SetLoadingState(
                true,
                `${__(I18nStrings.MAIN_UPDATE_DOWNLOADING, {
                    current: progress.current,
                    total: progress.total,
                })} ${extra}`,
            );
        };

        const unsubscribe = window.olsCore.onGithubUpdateProgress(progressHandler);

        let result: { success: boolean; error?: string } | undefined;
        try {
            result = await window.olsCore.downloadGithubUpdate();
        } finally {
            unsubscribe();
            this.SetLoadingState(false);
        }

        if (result?.success) {
            this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_SUCCESS),
                content: __(I18nStrings.MAIN_UPDATE_RESTART_REQUIRED),
                actions: [
                    {
                        label: __(I18nStrings.BTN_UPDATE_RESTART),
                        callback: async () => {
                            this.SetDialogState(false);
                            try {
                                await window.olsCore.installPreparedUpdate();
                            } catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                this.SetDialogState(true, {
                                    title: __(I18nStrings.MAIN_UPDATE_FAILED),
                                    content: message,
                                    actions: [
                                        {
                                            label: __(I18nStrings.BTN_CONFIRM),
                                            callback: () => this.SetDialogState(false),
                                        },
                                    ],
                                });
                            }
                        },
                    },
                    {
                        label: __(I18nStrings.BTN_CANCEL),
                        callback: () => this.SetDialogState(false),
                    },
                ],
            });
        } else {
            this.SetDialogState(true, {
                title: __(I18nStrings.MAIN_UPDATE_FAILED),
                content: result?.error || __(I18nStrings.MAIN_UPDATE_DOWNLOAD_FAILED_NO_ERROR),
                actions: [
                    {
                        label: __(I18nStrings.BTN_CONFIRM),
                        callback: () => this.SetDialogState(false),
                    },
                ],
            });
        }
    }
}
