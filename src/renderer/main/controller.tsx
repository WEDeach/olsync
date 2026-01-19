import { action,makeAutoObservable,observable,runInAction } from "mobx";
import { IPropertyWithName } from "../components/table";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import React from "react";
import { ConfigKey } from "../../utils/typed/config";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { StableCollectionData,StableCollectionMapData,StableLocalBeatmap,StableScoreBeatmapData } from "../../defines/stable_structs";
import { HostType,OsuClients,OsuLanguages } from "../../defines/types";
import { BeatmapCollection } from "../../defines/lazer_structs";
import { readAllWithOffset } from "../../utils/reader";
import g,{ IDialogState,NewSyncState } from "../state";
import { RankedStatus,RespUserMostPlayedBeatmap,RespUserMostPlayedBeatmaps } from "../../api/v2/types/api_resp";
import { LogError } from "../../utils/log";
import { IApiPreDelayMs,InitApi } from "../../utils/api";
import { UpdateDiff } from "../../entrypoint/js/updater";
import { sleep } from "../../utils/time";

export enum SubViewType {
    NONE=0,
    COLLECTION=1,
    OSU_DATABASE=11,
    SONG_RECOVERY_BY_SCORES=21,
    SONG_RECOVERY_BY_API,
    MAP_PACKS=31,
    //
    D_STABLE=1001,
    D_LAZER,
    D_API,
    D_DLX,
}

export enum MainViewState {
    NONE=0,
    //
    COLLECTION_IDLE=10,
    COLLECTION_READ=11,
    COLLECTION_SELECT=12,
    COLLECTION_MERGE_CONFIRM=13,
    COLLECTION_MERGE=14,
    //
    SRS_IDLE=20,
    SRS_READ=21,
    SRS_RESULTS=25,
    //
    BPAKS_IDLE=30,
    BPAKS_READ=31,
    BPAKS_RESULTS=35,
}

interface LoadingState {
    loading: boolean;
    message?: string;
    aborter?: AbortController;
}

interface SelectState {
    key: string;
    is_selected: boolean;
    is_sub_selected?: boolean;
    subs?: SelectState[];
}

type MapWithSelected=RespUserMostPlayedBeatmap&{
    is_selected: {
        value: boolean;
        callback: () => void;
    }
};

interface ListItem {
    label: string;
    img?: string;
}

interface CachedVal {
    key: string;
    val: any;
}

export enum PlayCountFS {
    Greater,
    Equal,
    Less
}

export enum FilterType {
    None,
    Name,
    Artist,
    ArtistUnicode,
    Title,
    TitleUnicode,
    Genre,
    GenreUnicode,
    Language,
    LanguageUnicode,
    RankState,
    Source,
    StarRating,
    PlayCount,
    PlayCountFS
}

enum CachedLegacyKey {
    LocalMaps="#local_maps",
    OnlineMaps="#online_maps",
    LocalScores="#local_scores",
}

interface State {
    path_lazer?: string;
    path_stable?: string;
    s_tables?: string[];
    s_schema_name?: string
    s_schema_keys?: IPropertyWithName[];
    s_schema_rows?: DefaultObject[];
    s_schema_rows_loaded?: boolean;
    s_schema_rows_page?: number;
    s_sub_view?: SubViewType;
    s_main?: MainViewState;
    s_loading?: LoadingState;
    s_cached_vals?: CachedVal[];
    v_sub?: React.ComponentType<any>;
    v_select_group_a?: SelectState[];
    v_select_group_b?: SelectState[];
    v_list?: ListItem[];
    s_show_user_dialog?: boolean;
    s_show_filter?: boolean;
    s_filter_settings?: {
        [key in FilterType]?: any;
    };
    c_filter_settings?: {
        [key in FilterType]?: any;
    };
    s_show_api_secret?: boolean;
    s_bpks_download_ranges?: Set<string>;
    s_bpks_download_mode?: 'full'|'diff';
}

let PAGE_SIZE=50;

export default class Controller {
    state: State;
    private _local_beatmaps: Map<number,{
        beatmapSetId: number;
        beatmapId: number;
        md5Hash: string;
        artist?: string;
        title?: string;
    }>|null=null;
    private _online_beatmaps: RespUserMostPlayedBeatmaps|null=null;
    private _srs_exclude_map_ids=new Set<number>();

    constructor() {
        this.state={
            s_filter_settings: {
                [FilterType.RankState]: ["all"],
                [FilterType.Name]: "",
                [FilterType.StarRating]: [0,15],
                [FilterType.Artist]: "",
                [FilterType.PlayCount]: 0,
                [FilterType.PlayCountFS]: PlayCountFS.Greater,
                [FilterType.Language]: ["all"],
            },
            s_bpks_download_ranges: new Set(['all']),
            s_bpks_download_mode: 'full'
        };
        this.state.c_filter_settings={ ...this.state.s_filter_settings };

        g.initConfig().then(() => {
            PAGE_SIZE=Number(g.config?.[ConfigKey.PAGE_SIZE])||50;
            this.checkUpdate();
        });

        makeAutoObservable(this,{
            _local_beatmaps: observable.ref,
            _online_beatmaps: observable.ref,
        } as any);
    }

    get LazerPath() {
        return g.config?.[ConfigKey.PATH_LAZER_REALM]??""
    }

    get StablePath() {
        return g.config?.[ConfigKey.PATH_STABLE_DIR]??""
    }

    get IsDev() {
        return g.isDev??false
    }

    get ClientId() {
        return g.config?.[ConfigKey.API_CLIENT_ID]??""
    }

    get ClientSecret() {
        return g.config?.[ConfigKey.API_CLIENT_SECRET]??""
    }

    get CClientId() {
        return g.cacheVal.str_client_id??""
    }

    get CClientSecret() {
        return g.cacheVal.str_client_secret??""
    }

    get Version() {
        return g.version
    }

    get SyncTargetId() {
        return g.config?.[ConfigKey.SYNC_PLAYER_ID]??""
    }

    get CSyncTargetId() {
        return g.cacheVal.ss_player_id??""
    }


    get SSubView() {
        return this.state.s_sub_view??SubViewType.NONE
    }

    get SMain() {
        return this.state.s_main??MainViewState.NONE
    }

    get SubView() {
        return this.state.v_sub
    }

    get STables() {
        return this.state.s_tables??[]
    }

    get SSchemaKeys() {
        if(this.STables.length===0) return [];
        return this.state.s_schema_keys??[]
    }

    get SSchemaRows() {
        if(this.STables.length===0) return [];
        return this.state.s_schema_rows??[]
    }

    get SSchemaName() {
        return this.state.s_schema_name;
    }

    get SSchemaRowsLoaded() {
        return this.state.s_schema_rows_loaded??true;
    }

    get SSchemaRowsPage() {
        return this.state.s_schema_rows_page??0;
    }

    get SLoading() {
        return g.loadingState??{
            loading: false
        }
    }

    get SDialog() {
        return g.dialog??{
            show: false,
        };
    }

    get SShowUserDialog() {
        return this.state.s_show_user_dialog??false;
    }

    get SShowFilter() {
        return this.state.s_show_filter??false
    }

    get SCachedVals() {
        return this.state.s_cached_vals??[]
    }

    get VSelectGroupA() {
        return this.state.v_select_group_a;
    }

    get VSelectGroupB() {
        return this.state.v_select_group_b;
    }

    get VList() {
        return this.state.v_list;
    }

    get SFilterSettings() {
        return this.state.s_filter_settings;
    }

    get CFilterSettings() {
        return this.state.c_filter_settings;
    }

    get CSrsLocalScoreCompareResults() {
        const local=this._local_beatmaps;
        const scores=this.SCachedVals.find((v) => v.key===CachedLegacyKey.LocalScores)?.val;
        if(!local||!scores) {
            return [];
        }
        const localHashSet=new Set(local.values().map((map) => map.md5Hash));
        const result: ListItem[]=scores
            .filter((score: StableScoreBeatmapData) => !localHashSet.has(score.md5Hash))
            .map((score: StableScoreBeatmapData) => {
                return {
                    label: score.md5Hash,
                }
            });
        return result;
    }

    get CSrsFilteredResults(): MapWithSelected[] {
        const online=this._online_beatmaps;
        const local=this._local_beatmaps;
        if(!local||!online) {
            return [];
        }
        const local_sets=new Set(
            local.values().map((v) => v.beatmapSetId)
        );

        let srs_results=online.filter((v) => {
            return !local_sets.has(v.beatmapset.id);
        });

        if(this.SFilterSettings) {
            if(this.SFilterSettings[FilterType.Title]&&this.SFilterSettings[FilterType.Title].length>0) {
                const title=this.SFilterSettings[FilterType.Title].toLowerCase();
                srs_results=srs_results.filter((v) => {
                    return v.beatmapset.title.toLowerCase().includes(title)||v.beatmapset.title_unicode.toLowerCase().includes(title);
                })
            }
            if(this.SFilterSettings[FilterType.RankState]) {
                const state=this.SFilterSettings[FilterType.RankState] as Array<Omit<RankedStatus,"all">>;
                srs_results=srs_results.filter((v) => {
                    return state.includes("all")||state.includes(v.beatmapset.status);
                })
            }
            if(this.SFilterSettings[FilterType.PlayCount]) {
                const pcfs=this.SrsFilterPlayCountFS;
                const pc=Number(this.SFilterSettings[FilterType.PlayCount])||0;
                srs_results=srs_results.filter((v) => {
                    return pcfs===PlayCountFS.Greater? v.count>=pc:(pcfs===PlayCountFS.Equal? v.count===pc:v.count<=pc);
                })
            }
            if(this.SFilterSettings[FilterType.Language]) {
                const las=this.SFilterSettings[FilterType.Language] as Array<number|"all">;
                srs_results=srs_results.filter((v) => {
                    return las.includes("all")||las.includes(v.beatmapset.language_id);
                })
            }
            if(this.SFilterSettings[FilterType.StarRating]) {
                const sr=this.SFilterSettings[FilterType.StarRating];
                const [min=0,max=15]=Array.isArray(sr)&&sr.length===2? sr:[0,15];
                srs_results=srs_results.filter((v) => {
                    return (min===0||v.beatmap.difficulty_rating>=min)&&(max===15||v.beatmap.difficulty_rating<=max);
                })
            }
        }
        const srs_results_merged=Array.from(
            srs_results.reduce((map,item) => {
                const beatmapsetId=item.beatmapset.id;

                if(!map.has(beatmapsetId)) {
                    map.set(beatmapsetId,{ ...item });
                } else {
                    const existing=map.get(beatmapsetId)!;
                    existing.count+=item.count;
                }

                return map;
            },new Map<number,RespUserMostPlayedBeatmap>()).values()
        );

        return srs_results_merged.map((v) => {
            return {
                ...v,
                is_selected: {
                    value: !this._srs_exclude_map_ids.has(v.beatmapset.id),callback: (bf: boolean) => {
                        this.OnFilteredSelectChanged(v.beatmapset.id,bf);
                    }
                }
            }
        }) as MapWithSelected[];
    }

    get SrsFilterCacheKey() {
        return JSON.stringify(this.SFilterSettings);
    }

    get SrsFilterPlayCountFS(): PlayCountFS {
        return this.SFilterSettings?.[FilterType.PlayCountFS]??PlayCountFS.Greater;
    }

    get OnlineBeatmapLangs() {
        // https://github.com/ppy/osu-web/blob/1266279a78659f66d91e22d0ca91ae6316e5dbca/database/seeders/ModelSeeders/MiscSeeder.php#L64
        const lids=new Set(this._online_beatmaps?.map((v) => v.beatmapset.language_id));
        return Array.from(lids).map((v) => {
            return {
                key: v,
                label: OsuLanguages.get(v)
            }
        })??[];
    }

    get SShowApiSecret() {
        return this.state.s_show_api_secret??false;
    }

    get SBPKSDownloadRanges() {
        return [...(this.state.s_bpks_download_ranges??new Set(['all'])).values()];
    }

    get SBPKSDownloadMode() {
        return this.state.s_bpks_download_mode??'full';
    }

    onBtnSRSReadClicked=async (removeLocalMaps: boolean=true) => {
        runInAction(() => {
            this.state.s_main=MainViewState.SRS_READ;
            this.SetLoadingState(true,__(I18nStrings.MAIN_SRS_READING_SCORES));
        });

        try {
            this.RemoveCacheVal(CachedLegacyKey.LocalScores);
            if(removeLocalMaps) {
                this._local_beatmaps=null;
            }
            if(this.StablePath.length>0) {
                await window.olsCore.initStableReader(this.StablePath);
                let scores=await window.olsCore.getScores(OsuClients.Stable,0,PAGE_SIZE);
                if("error" in scores) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_SRS_READING_FAILED,{
                            reason: "scores.db is not found in selected osu! directory"
                        }),
                        severity: "error"
                    });
                    this.SetLoadingState(false);
                    return;
                } else {
                    let fetch_fn=async (offset: number,limit: number) => await window.olsCore.getScores(OsuClients.Stable,offset,limit) as any;
                    scores=await readAllWithOffset(fetch_fn,scores);
                    this.SetCacheVal("scores",scores.data.length);
                    this.SetCacheVal(CachedLegacyKey.LocalScores,scores.data);
                }
                // scores -> GET maps's hash
                // 
                // a. local: hash -> map_id
                // b. online: api fetch by hash -> map_id
                //
                // results: non-local maps

                if(removeLocalMaps) {
                    runInAction(() => {
                        this.SetLoadingState(true,__(I18nStrings.MAIN_SRS_READING_LOCAL));
                    });
                    let local=await window.olsCore.getBeatmaps(OsuClients.Stable,0,PAGE_SIZE);
                    let fetch_fn=async (offset: number,limit: number) => {
                        return await window.olsCore.getBeatmaps(OsuClients.Stable,offset,limit);
                    };
                    local=await readAllWithOffset(fetch_fn,local);
                    this.SetCacheVal("local_maps",local.data.length);
                    this.SetCacheVal(CachedLegacyKey.LocalMaps,local.data);
                }

                runInAction(() => {
                    this.state.v_list=this.CSrsLocalScoreCompareResults;
                    this.state.s_main=MainViewState.SRS_RESULTS;
                });
            }
        } catch(error) {
            LogError(error);
        } finally {
            runInAction(() => {
                this.SetLoadingState(false);
            });
        }
    };

    onBtnSRSReadByOnlineClicked=async () => {
        // 1. Init API client
        // 2. Fetch token cached or exchange new token and save client id and secret
        //    -  Fetch token: use client id and secret to check cached token
        //       -  Found: use cached token
        //       -  Not found: exchange new token
        //    -  Exchange token: use client id and secret to exchange token
        // 3. Fetch user's logs
        this.SetLoadingState(true,__(I18nStrings.MAIN_SRS_READING_ONLINE));
        try {
            await InitApi(() => {
                this.SetShowUserDialogState(true);
            });
        } catch(error) {
            LogError(error);
        }
        this.SetLoadingState(false);
    };

    onBtnSRSPlayerConfirmClicked=async () => {
        const f_save_cache_alawys=g.config?.[ConfigKey.SYNC_ALAWAYS_SAVE_CACHE]??true;
        const i_pre_count=g.config?.[ConfigKey.SYNC_PRE_COUNT]? Number(g.config?.[ConfigKey.SYNC_PRE_COUNT]):100;
        const user_cache=this.SCachedVals.find((v) => v.key==="#sync_player");
        if(!user_cache) return;

        this.SetShowUserDialogState(false);
        g.saveConfig(ConfigKey.SYNC_PLAYER_ID,this.CSyncTargetId);

        const sync_count=user_cache.val.beatmap_playcounts_count;
        const ss_result=await window.olsCore.getSyncStateByUserId(this.SyncTargetId);
        let sync_state: NewSyncState={
            player_id: this.SyncTargetId,
            last_count: 0,
            last_offset: 0,
            last_updated: 0,
            new_count: sync_count
        };
        if(ss_result) {
            if("error" in ss_result) {
                LogError(ss_result.error);
            } else {
                sync_state=ss_result;
            }
        }
        sync_state.new_count=sync_count;
        sync_state=observable(sync_state);
        const worker=async (clearState: boolean) => {
            runInAction(() => {
                this._online_beatmaps=null;
            });
            if(sync_state.new_count) {
                let _fc=-1;
                let results: RespUserMostPlayedBeatmaps=[];
                if(clearState) {
                    runInAction(() => {
                        sync_state.last_offset=0;
                        sync_state.last_count=0;
                    });
                } else {
                    this.SetLoadingState(true,`${__(I18nStrings.MAIN_SRS_READING_LOCAL)}...`);
                    results=await window.olsCore.getCachedMaps(this.SyncTargetId);
                    this.SetLoadingState(false);
                }
                const aborter=new AbortController();
                while(_fc!=0&&!aborter.signal.aborted) {
                    const result=await window.olsCore.getUserMostPlayedBeatmaps(this.SyncTargetId,i_pre_count,sync_state.last_offset||0);
                    _fc=result.length;
                    results=results.concat(result);
                    runInAction(() => {
                        sync_state.last_offset=(sync_state.last_offset||0)+_fc;
                        sync_state.last_count=results.length;
                    });
                    this.SetLoadingState(true,`${__(I18nStrings.MAIN_SRS_READING_ONLINE)}...\n${sync_state.last_offset||0} | ${results.length}/${sync_state.new_count}`,aborter);
                    if(f_save_cache_alawys) {
                        await window.olsCore.saveCachedMaps(this.SyncTargetId,results.map((v) => v.beatmap_id));
                    }
                    await sleep(IApiPreDelayMs,aborter.signal);;
                }
                this.SetLoadingState(false);
                runInAction(() => {
                    sync_state.last_updated=new Date().getTime();
                    this._online_beatmaps=results;
                });
                await window.olsCore.saveSyncStateByUserId(this.SyncTargetId,sync_state.last_count,sync_state.last_offset,sync_state.last_updated);
                if(!f_save_cache_alawys) {
                    await window.olsCore.saveCachedMaps(this.SyncTargetId,results.map((v) => v.beatmap_id));
                }
                this.SetCacheVal("online_maps",results.length);
                if(!aborter.signal.aborted) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_SRS_READING_ONLINE_SUCCESS),
                        severity: "success"
                    });
                    try {
                        runInAction(() => {
                            this.state.s_main=MainViewState.SRS_READ;
                            this.SetLoadingState(true,__(I18nStrings.MAIN_SRS_READING_SCORES));
                        });
                        if(this.StablePath.length>0) {
                            await window.olsCore.initStableReader(this.StablePath);
                            runInAction(() => {
                                this.SetLoadingState(true,__(I18nStrings.MAIN_SRS_READING_LOCAL));
                            });
                            let local=await window.olsCore.getBeatmaps(OsuClients.Stable,0,PAGE_SIZE);
                            let fetch_fn=async (offset: number,limit: number) => {
                                return await window.olsCore.getBeatmaps(OsuClients.Stable,offset,limit);
                            };
                            local=await readAllWithOffset(fetch_fn,local);
                            this.SetCacheVal("local_maps",local.data.length);
                            this.SetCacheVal(CachedLegacyKey.LocalMaps,local.data);
                            await this.onBtnSRSReadClicked(false);
                            runInAction(() => {
                                this.state.s_main=MainViewState.SRS_RESULTS;
                            });
                        }
                    } catch(error) {
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
                        severity: "warning"
                    })
                }
            } else {
                g.setNotify({
                    message: __(I18nStrings.MAIN_SRS_READING_ONLINE_NO_DATA),
                    severity: "warning"
                })
            }
        }
        this.SetDialogState(true,{
            title: __(I18nStrings.MAIN_SRS_READING_ONLINE),
            syncState: sync_state,
            actions: [
                {
                    label: __(I18nStrings.BTN_SRS_READ_BY_ONLINE_WITH_CACHED),
                    callback: async () => {
                        await worker(false);
                    }
                },
                {
                    label: __(I18nStrings.BTN_SRS_READ_BY_ONLINE),
                    callback: async () => {
                        if(confirm(__(I18nStrings.MAIN_SRS_READING_ONLINE_ALERT))) {
                            await worker(true);
                        }
                    }
                }
            ]
        });
    }

    onBtnBPKSReadClicked=async () => {
        this.showBeatmapPackDownloadDialog();
    }

    @action
    OnBPKSDownloadRangeChanged=(range: string|string[]) => {
        let ranges=typeof range==="string"? [range]:range;
        const old_ranges=this.SBPKSDownloadRanges??[];

        if(ranges.includes('all')) {
            if(old_ranges.includes('all')) {
                ranges=ranges.filter((v) => v!=='all');
            } else {
                ranges=[];
            }
        }
        if(ranges.length===0) {
            ranges=["all"];
        }

        this.state.s_bpks_download_ranges=new Set(ranges);
    };

    @action
    setBPKSDownloadMode=(mode: 'full'|'diff') => {
        this.state.s_bpks_download_mode=mode;
    };

    showBeatmapPackDownloadDialog=() => {
        const gcb=() => {
            const ranges=this.SBPKSDownloadRanges;

            if(ranges.length===0) {
                g.setNotify({
                    message: __(I18nStrings.MAIN_BPKS_DL_NO_TYPE_SELECTED),
                    severity: 'warning'
                });
                return false;
            }

            this.SetDialogState(false);

            const mode=this.SBPKSDownloadMode;
            const selectedRanges=Array.from(ranges);

            g.setNotify({
                message: __(I18nStrings.MAIN_BPKS_DL_START,{
                    ranges: selectedRanges.join(', '),
                    mode: mode
                }),
                severity: 'info'
            });
            return true;
        }
        this.SetDialogState(true,{
            title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
            renderFor: "bpks_download_options",
            actions: [
                {
                    label: __(I18nStrings.BTN_CANCEL),
                    callback: () => {
                        this.SetDialogState(false);
                    }
                },
                {
                    label: __(I18nStrings.BTN_CONFIRM),
                    callback: async () => {
                        if(gcb()) {

                        }
                    }
                }
            ]
        });
    };

    onBtnCollectionReadClicked=async () => {
        runInAction(() => {
            this.state.s_main=MainViewState.COLLECTION_READ;
            this.SetLoadingState(true,__(I18nStrings.MAIN_DATA_READING));
        });

        try {
            // lazer
            this.SetLoadingState(true,__(I18nStrings.MAIN_COLLECTION_READING_OL));
            if(this.LazerPath.length>0) {
                await window.olsCore.initReader(this.LazerPath);
                let ol_collections=await window.olsCore.getCollections(OsuClients.Lazer,0,PAGE_SIZE);
                const ol_collections_fn=async (offset: number,limit: number) => await window.olsCore.getCollections(OsuClients.Lazer,offset,limit)
                ol_collections=await readAllWithOffset(ol_collections_fn,ol_collections);
                runInAction(() => {
                    this.state.v_select_group_a=ol_collections.data.map((data: BeatmapCollection) => {
                        return {
                            key: data.Name,
                            is_selected: false,
                            subs: data.BeatmapMD5Hashes.map((map: string) => {
                                return {
                                    key: map,
                                    is_selected: false,
                                }
                            })
                        };
                    });
                    this.state.s_main=MainViewState.COLLECTION_SELECT;
                    this.SetLoadingState(false);
                });
            }

            // stable
            this.SetLoadingState(true,__(I18nStrings.MAIN_COLLECTION_READING_OS));
            if(this.StablePath.length>0) {
                await window.olsCore.initStableReader(this.StablePath);
                let os_collections=await window.olsCore.getCollections(OsuClients.Stable,0,PAGE_SIZE);
                const os_collections_fn=async (offset: number,limit: number) => await window.olsCore.getCollections(OsuClients.Stable,offset,limit)
                os_collections=await readAllWithOffset(os_collections_fn,os_collections);
                runInAction(() => {
                    this.state.v_select_group_b=os_collections.data.map((data: StableCollectionData) => {
                        return {
                            key: data.name,
                            is_selected: false,
                            subs: data.maps.map((map: StableCollectionMapData) => {
                                return {
                                    key: map.checksum,
                                    is_selected: false,
                                }
                            })
                        };
                    });
                    this.state.s_main=MainViewState.COLLECTION_SELECT;
                });
            }
        } catch(error) {
            LogError(error);
        } finally {
            runInAction(() => {
                this.SetLoadingState(false);
            });
        }
    };

    onBtnCollectionMergeClicked=async () => {
        const group_a=this.VSelectGroupA??[];
        const group_b=this.VSelectGroupB??[];
        const group_a_selected=group_a.filter((item) => item.is_selected);
        const group_b_selected=group_b.filter((item) => item.is_selected);
        const collection_names=Array.from(new Set(group_a?.map((item) => item.key).concat(group_b?.map((item) => item.key))));
        const collection_name_selecteds=Array.from(new Set(group_a_selected?.map((item) => item.key).concat(group_b_selected?.map((item) => item.key))));
        const collection_values=new Map();
        const collection_value_selecteds=new Map();
        collection_names.forEach((name) => {
            let a=group_a?.find((item) => item.key===name);
            let b=group_b?.find((item) => item.key===name);
            const v=(state: SelectState) => state.subs?.map((item) => item.key);

            if(a&&b) {
                const _a=v(a)??[];
                const _b=v(b)??[];
                collection_values.set(name,_a.concat(_b.filter((item) => !_a.includes(item))));
            } else if(a) {
                collection_values.set(name,v(a));
            } else if(b) {
                collection_values.set(name,v(b));
            }

            a=group_a_selected?.find((item) => item.key===name);
            b=group_b_selected?.find((item) => item.key===name);
            if(a&&b) {
                const _a=v(a)??[];
                const _b=v(b)??[];
                collection_value_selecteds.set(name,_a.concat(_b.filter((item) => !_a.includes(item))));
            } else if(a) {
                collection_value_selecteds.set(name,v(a));
            } else if(b) {
                collection_value_selecteds.set(name,v(b));
            }
        });

        runInAction(() => {
            this.state.s_main=MainViewState.COLLECTION_MERGE_CONFIRM;

            this.SetDialogState(true,{
                title: __(I18nStrings.MAIN_COLLECTION_MERGE_CONFIRM),
                compares: {
                    source: collection_names.reduce((acc,name) => {
                        acc[name]=collection_values.get(name)??[];
                        return acc;
                    },{} as Record<string,any>),
                    target: collection_name_selecteds.reduce((acc,name) => {
                        acc[name]=collection_value_selecteds.get(name)??[];
                        return acc;
                    },{} as Record<string,any>),
                },
                actions: [
                    {
                        label: __(I18nStrings.BTN_COLLECTION_MERGE),
                        callback: async () => {
                            this.SetLoadingState(true,__(I18nStrings.MAIN_COLLECTION_MERGING));
                            await window.olsCore.setCollections(OsuClients.Stable,collection_name_selecteds.map((name) => {
                                return {
                                    name,
                                    maps: collection_value_selecteds.get(name)?.map((checksum: string) => {
                                        return checksum
                                    })
                                }
                            }));
                            setTimeout(() => {
                                this.SetLoadingState(false);
                            },2000);

                        }
                    }
                ]
            });
        });
    }

    @action
    onBtnSelectItemClicked=(selecte_item: SelectState,force_select?: boolean) => {
        selecte_item.is_selected=force_select??!selecte_item.is_selected;
        if(selecte_item.subs) {
            selecte_item.subs.forEach((sub) => this.onBtnSelectItemClicked(sub,selecte_item.is_selected));
        }
    };

    @action
    onBtnSelectItemSubClicked=(selecte_item: SelectState,force_select?: boolean) => {
        selecte_item.is_sub_selected=force_select??!(selecte_item.is_sub_selected??false);
    };

    onSelectItemContextMenu=(selecte_item: SelectState) => {
        const beatmaps=selecte_item.subs?.map((sub) => {
            return {
                "checksum": sub.key,"is_selected": {
                    get value() { return sub.is_selected; },
                    callback: (value: boolean) => this.onBtnSelectItemClicked(sub,value)
                }
            }
        })??[];
        this.SetDialogState(true,{
            title: selecte_item.key,
            beatmaps: { beatmaps: beatmaps },
        });
    };

    onBtnDebugClicked=async (_: any,value: SubViewType) => {
        let view: any;
        switch(value) {
            case SubViewType.NONE:
                runInAction(() => {
                    this.state.v_sub=undefined;
                });
                break;
            case SubViewType.D_STABLE:
                this.onBtnOsuDebugClicked();
                break;
            case SubViewType.D_LAZER:
                this.onBtnLazerDebugClicked();
                break;
            case SubViewType.D_API:
                view=await import('../debug_views/api/main');
                runInAction(() => {
                    this.state.v_sub=() => React.createElement(view.default);
                });
                break;
            case SubViewType.D_DLX:
                view=await import('../debug_views/dl_test/main');
                runInAction(() => {
                    this.state.v_sub=() => React.createElement(view.default);
                });
                break;
        }
        runInAction(() => {
            this.state.s_sub_view=value;
        });
    };

    onBtnViewClicked=async (_: any,value: SubViewType) => {
        runInAction(() => {
            switch(value) {
                case SubViewType.NONE:
                    this.state.s_main=MainViewState.NONE;
                    break;
                case SubViewType.COLLECTION:
                    this.state.s_main=MainViewState.COLLECTION_IDLE;
                    break;
                case SubViewType.SONG_RECOVERY_BY_SCORES:
                    this.state.s_main=MainViewState.SRS_IDLE;
                    break;
                case SubViewType.MAP_PACKS:
                    this.state.s_main=MainViewState.BPAKS_IDLE;
                    break;
            }
            this.state.s_sub_view=value;

            // clear state values
            this.state.v_sub=undefined;
            this.state.v_select_group_a=undefined;
            this.state.v_select_group_b=undefined;
            this.state.v_list=undefined;
        });
    };

    onBtnLazerDebugClicked=async () => {
        const view=await import('../debug_views/lazer/main');
        runInAction(() => {
            this.state.v_sub=() => React.createElement(view.default);
        });
    };

    onBtnOsuDebugClicked=async () => {
        const view=await import('../debug_views/stable/main');
        runInAction(() => {
            this.state.v_sub=() => React.createElement(view.default);
        });
    };

    onBtnSchemaClicked=async (name: string) => {
        this.state.s_schema_keys=[];
        this.state.s_schema_rows=[];
        const schema=await window.olsCore.getSchema(name);
        if(schema) {
            Object.entries(schema.properties).forEach(([propName,propSchema]) => {
                runInAction(() => {
                    this.state.s_schema_name=name;
                    this.state.s_schema_rows=[];
                    this.state.s_schema_rows_page=0;
                    this.state.s_schema_rows_loaded=true;
                    this.state.s_schema_keys=[...this.SSchemaKeys,{
                        ...propSchema
                    }];
                })
            });

            await this.loadSchemaObjs();
        }
    };

    loadSchemaObjs=async () => {
        if(!this.SSchemaRowsLoaded) return;

        const currentSchema=this.SSchemaName;
        if(!currentSchema) return;

        runInAction(() => {
            this.state.s_schema_rows_loaded=false;
        });


        const nextPage=this.SSchemaRowsPage+1;
        const offset=(nextPage-1)*PAGE_SIZE;

        try {
            const moreData=await window.olsCore.getSchemaObjs(currentSchema,PAGE_SIZE,offset);

            runInAction(() => {
                const rs=observable([...this.SSchemaRows,...moreData],{ deep: false });
                this.state.s_schema_rows=rs;
                this.state.s_schema_rows_page=nextPage;
            });
        } finally {
            runInAction(() => {
                this.state.s_schema_rows_loaded=true;
            });
        }
    };

    onBtnCloseLazerClicked=async () => {
        await window.olsCore.closeReader();

        this.state.s_tables=[];
    };

    onBtnCheckUserIdClicked=async () => {
        const cache=this.SCachedVals.find((v) => v.key==="#sync_player");
        if(cache?.val.id==this.CSyncTargetId||cache?.val.name==this.CSyncTargetId) return;

        this.SetLoadingState(true);
        const user=await window.olsCore.getUserInfo(this.CSyncTargetId);
        if(user&&"error" in user) {
            LogError(user.error);
        } else {
            const user_cache={
                name: user.username,
                pic: user.avatar_url,
                id: user.id,
                country: user.country_code,
                beatmap_playcounts_count: user.beatmap_playcounts_count,
            }
            if(this.CSyncTargetId!=user.id.toString()) {
                // Fix the user name to user id
                await this.OnSyncPlayerIdChanged(user.id.toString());
            }
            this.SetCacheVal("#sync_player",user_cache);
        }
        this.SetLoadingState(false);
    };

    @action
    SetLoadingState=(is_loading: boolean,msg?: string,aborter?: AbortController) => {
        g.setLoading(is_loading,msg,aborter);
    };

    SetDialogState=(is_show: boolean,opt?: Omit<IDialogState,"show">) => {
        g.setDialog(is_show,opt);
    };

    @action
    SetShowUserDialogState=(is_show: boolean) => {
        this.state.s_show_user_dialog=is_show;
    };

    @action
    SetCacheVal=(cache_key: string,val: any) => {
        switch(cache_key) {
            case CachedLegacyKey.LocalMaps:
                this._local_beatmaps=new Map<number,StableLocalBeatmap>();
                val.forEach((map: StableLocalBeatmap) => {
                    this._local_beatmaps!.set(map.beatmapId,{
                        beatmapSetId: map.beatmapSetId,
                        beatmapId: map.beatmapId,
                        md5Hash: map.md5Hash,
                        artist: map.artist,
                        title: map.songTitle
                    });
                })
                break;
            default:
                let cv=this.SCachedVals.find((v) => v.key===cache_key);
                if(!cv) {
                    cv={
                        key: cache_key,
                        val: val
                    };
                    this.state.s_cached_vals=[...this.SCachedVals,cv];
                } else {
                    cv.val=val;
                }
                break;
        }
    };

    @action
    RemoveCacheVal=(cache_key: string) => {
        this.state.s_cached_vals=this.SCachedVals.filter((v) => v.key!==cache_key);
    };

    OnSyncPlayerIdChanged=async (player_id: string) => {
        runInAction(() => {
            g.cacheVal.ss_player_id=player_id;
        });
    };

    @action
    OnFilterSettingChanged=(ft: FilterType,v: any) => {
        if(this.state.s_filter_settings===undefined) this.state.s_filter_settings={};
        if(this.state.c_filter_settings===undefined) this.state.c_filter_settings=this.state.s_filter_settings;

        const old=this.state.s_filter_settings[ft];
        if(ft===FilterType.RankState||ft===FilterType.Language) {
            if(!Array.isArray(v)) v=[v];
            if(v.includes("all")) {
                if(old&&old.includes("all")) {
                    v=v.filter((_v: any) => _v!=="all");
                } else {
                    v=["all"];
                }
            }
            if(v.length===0) v=["all"];
        }
        this.state.s_filter_settings[ft]=v;
    };

    @action
    OnPreFilterSettingChanged=(ft: FilterType,v: any) => {
        if(this.state.s_filter_settings===undefined) this.state.s_filter_settings={};
        if(this.state.c_filter_settings===undefined) this.state.c_filter_settings=this.state.s_filter_settings;
        this.state.c_filter_settings[ft]=v;
    };

    @action
    toggleFilter=(show: boolean) => {
        this.state.s_show_filter=show;
    };

    @action
    OnFilteredSelectChanged=(id: number,show: boolean) => {
        if(show) {
            if(this._srs_exclude_map_ids.has(id)) this._srs_exclude_map_ids.delete(id);
        } else {
            if(!this._srs_exclude_map_ids.has(id)) this._srs_exclude_map_ids.add(id);
        }
    };

    OnFilteredSelectChangeAll=(show: boolean) => {
        this.CSrsFilteredResults.forEach((v) => this.OnFilteredSelectChanged(v.beatmapset.id,show));
    };

    OnBtnSRSDownloadClicked=() => {
        const map_ids=[...new Set<number>(
            this.CSrsFilteredResults.map((v) => v.beatmapset.id).filter((v) => !this._srs_exclude_map_ids.has(v))
        ).values()];

        // alert(`mapIds(${map_ids.length}): ${JSON.stringify(map_ids)}`);

        const dlink=g.config?.[ConfigKey.API_DLINK]??"https://osu.ppy.sh/beatmapsets/:id/download";
        const fetcher=async (map_ids: number[]) => {
            let rows="";
            for(const map_id of map_ids) {
                const link=dlink.replace(":id",map_id.toString());
                if(!link||typeof link!=="string") continue;
                rows+=link+"\n";
            }
            return rows.trim();
        }
        if(map_ids.length===0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_DL_NODATA),
                severity: 'warning'
            });
            return;
        };
        this.SetDialogState(true,{
            title: __(I18nStrings.BTN_SRS_DOWNLOAD),
            content: __(I18nStrings.MAIN_DL_SELECT,{ url: dlink }),
            actions: [
                {
                    label: __(I18nStrings.BTN_DL_BY_ROWS),
                    callback: async () => {
                        try {
                            this.SetLoadingState(true,`${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                            const rows=await fetcher(map_ids);
                            this.SetLoadingState(false);

                            if(!rows) {
                                g.setNotify({
                                    message: __(I18nStrings.MAIN_DL_NODATA),
                                    severity: 'warning'
                                });
                                return;
                            }

                            await navigator.clipboard.writeText(rows);
                            g.setNotify({
                                message: __(I18nStrings.MAIN_DL_TO_CLIPBOARD,{ count: map_ids.length }),
                                severity: 'success'
                            });
                        } catch(error) {
                            LogError(error);
                        } finally {
                            this.SetDialogState(false);
                        }
                    }
                },
                {
                    label: __(I18nStrings.BTN_DL_BY_FDM),
                    callback: async () => {
                        try {
                            this.SetLoadingState(true,`${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                            const rows=await fetcher(map_ids);
                            this.SetLoadingState(false);

                            if(!rows) {
                                g.setNotify({
                                    message: __(I18nStrings.MAIN_DL_NODATA),
                                    severity: 'warning'
                                });
                                return;
                            }
                            const result=await window.olsCore.initDL(HostType.FDM);
                            if(result) {
                                g.setNotify({
                                    message: "Free Download Manager has been initialized",
                                    severity: "success"
                                });
                                await window.olsCore.sendMessage4DL(0,{
                                    id: "1",
                                    type: "create_downloads",
                                    create_downloads: {
                                        downloads: rows.split("\n").map((v) => ({ url: v }))
                                    }
                                })
                            } else {
                                g.setNotify({
                                    message: "Failed to initialize Free Download Manager",
                                    severity: "error"
                                });
                            }
                        } catch(error) {
                            LogError(error);
                        } finally {
                            this.SetDialogState(false);
                        }
                    }
                },
                {
                    label: __(I18nStrings.BTN_DL_BY_DIRECT),
                    callback: async () => {
                        try {
                            if(confirm(__(I18nStrings.BTN_DL_BY_DIRECT_CONFIRM))) {
                                const delay_ms=Number(g.config?.[ConfigKey.DL_DELAY_MS])||10000;
                                const aborter=new AbortController();
                                this.SetLoadingState(
                                    true,
                                    __(I18nStrings.MAIN_DL_PROGRESS,{ current: 0,total: map_ids.length }),
                                    aborter
                                );

                                let successCount=0;
                                let failCount=0;
                                const failedIds: number[]=[];
                                for(let i=0; i<map_ids.length; i++) {
                                    if(aborter.signal.aborted) {
                                        g.setNotify({
                                            message: __(I18nStrings.MAIN_DL_ABORTED,{
                                                success: successCount,
                                                failed: failCount,
                                                total: map_ids.length
                                            }),
                                            severity: 'warning'
                                        });
                                        break;
                                    }
                                    const map_id=map_ids[i];
                                    const link=`osu://s/${map_id}`;
                                    this.SetLoadingState(
                                        true,
                                        __(I18nStrings.MAIN_DL_PROGRESS,{
                                            current: i+1,
                                            total: map_ids.length
                                        }),
                                        aborter
                                    );

                                    try {
                                        await window.olsCore.openExternal(link);
                                        successCount++;
                                    } catch(error) {
                                        console.error(`Failed to open link (sid: ${map_id}):`,error);
                                        failCount++;
                                        failedIds.push(map_id);
                                    }

                                    if(i<map_ids.length-1) {
                                        await sleep(delay_ms,aborter.signal);
                                    }
                                }
                                this.SetLoadingState(false);
                                if(!aborter.signal.aborted) {
                                    g.setNotify({
                                        message: __(I18nStrings.MAIN_DL_SUCCESS,{ count: successCount }),
                                        severity: 'success'
                                    });
                                }
                            }
                        } catch(error) {
                            LogError(error);
                        } finally {
                            this.SetLoadingState(false);
                            this.SetDialogState(false);
                        }
                    }
                }
            ]
        });
    };

    async checkUpdate(isForce: boolean=false) {
        this.SetLoadingState(isForce,__(I18nStrings.MAIN_UPDATE_CHECKING));
        const us=await g.checkUpdate(isForce);
        this.SetLoadingState(false);

        let btns=[
            {
                label: __(I18nStrings.BTN_CANCEL),
                callback: () => this.SetDialogState(false)
            },
            {
                label: __(I18nStrings.BTN_UPDATE_REPO),
                callback: async () => {
                    await window.olsCore.openExternal("https://github.com/WEDeach/olsync/releases/latest");
                }
            }
        ];
        let onlineVersion=undefined;
        if(us.type==="base") {
            const diff=us as UpdateDiff;
            onlineVersion=diff.version.latest;
            if(diff?.needsUpdate) {
                const filesCount=diff.files.added.length+diff.files.modified.length;
                const sizeMB=(diff.totalSize/1024/1024).toFixed(2);
                let contentParts=[
                    `<p>${__(I18nStrings.MAIN_UPDATE_VERSION_LATEST,{ version: diff.version.latest })}</p>`,
                    `<p>${__(I18nStrings.MAIN_UPDATE_VERSION_CURRENT,{ version: diff.version.current })}</p>`
                ];
                contentParts.push(`<p>${__(I18nStrings.MAIN_UPDATE_INFO_FILES,{ count: filesCount })}</p>`);
                contentParts.push(`<p>${__(I18nStrings.MAIN_UPDATE_INFO_SIZE,{ size: sizeMB })}</p>`);

                return this.SetDialogState(true,{
                    title: __(I18nStrings.MAIN_UPDATE_AVAILABLE),
                    content: contentParts.join('\n'),
                    actions: [{
                        label: __(I18nStrings.BTN_UPDATE_DOWNLOAD),
                        callback: async () => {
                            await this.downloadUpdate(diff);
                        }
                    },...btns]
                });
            }
        } else if(us.type==="github") {
            this.SetDialogState(true,{
                title: __(I18nStrings.MAIN_UPDATE_AVAILABLE),
                content: `
                    <p>${__(I18nStrings.MAIN_UPDATE_VERSION_LATEST,{ version: us.version })}</p>
                    <p>${__(I18nStrings.MAIN_UPDATE_VERSION_CURRENT,{ version: this.Version })}</p>
                `,
                actions: btns
            });
        }

        if(isForce) {
            return this.SetDialogState(true,{
                title: __(I18nStrings.MAIN_UPDATE_NO_UPDATE),
                content: __(I18nStrings.MAIN_UPDATE_VERSION_CURRENT,{ version: onlineVersion||`${this.Version}@local` }),
                actions: btns
            });
        }
    }

    private async downloadUpdate(diff: UpdateDiff) {
        this.SetDialogState(false);
        this.SetLoadingState(true,__(I18nStrings.MAIN_UPDATE_DOWNLOADING,{ current: 0,total: diff.files.added.length+diff.files.modified.length }));

        const progressHandler=(_event: any,progress: any) => {
            const percent=((progress.current/progress.total)*100).toFixed(0);
            this.SetLoadingState(
                true,
                __(I18nStrings.MAIN_UPDATE_DOWNLOADING,{
                    current: progress.current,
                    total: progress.total
                })+` (${percent}%)`
            );
        };

        window.olsCore.on('ipc:up:update_progress',progressHandler);

        const result=await window.olsCore.downloadUpdate(diff);

        window.olsCore.removeListener('ipc:up:update_progress',progressHandler);
        this.SetLoadingState(false);

        if(result?.success&&result?.tempDir) {
            this.SetDialogState(true,{
                title: __(I18nStrings.MAIN_UPDATE_SUCCESS),
                content: __(I18nStrings.MAIN_UPDATE_RESTART_REQUIRED),
                actions: [
                    {
                        label: __(I18nStrings.BTN_UPDATE_RESTART),
                        callback: async () => {
                            this.SetDialogState(false);
                            await window.olsCore.executeUpdate(result.tempDir!);
                        }
                    }
                ]
            });
        } else {
            this.SetDialogState(true,{
                title: __(I18nStrings.MAIN_UPDATE_FAILED),
                content: result?.error,
                actions: [
                    {
                        label: __(I18nStrings.BTN_CONFIRM),
                        callback: () => this.SetDialogState(false)
                    }
                ]
            });
        }
    }
}