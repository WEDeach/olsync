import { Search } from "@mui/icons-material";
import { Box, Button, ButtonGroup, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { Observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import {
    RankedStatus,
    RespBeatmapLookup,
    RespUserMostPlayedBeatmap,
    RespUserMostPlayedBeatmaps,
} from "../../api/v2/types/api_resp";
import { OsuLanguages } from "../../defines/types";
import { IApiDownloadLink, IApiPreDelayMs, InitApi } from "../../utils/api";
import { GetDLOptionByDirect, GetDLOptionByFDM, GetDLOptionByRows } from "../../utils/download";
import __ from "../../utils/i18n";
import { LogError } from "../../utils/log";
import { sleep } from "../../utils/time";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { BeatmapFilterView, FilterType, SubFilterType } from "./beatmapFilter";
import { DataViewer } from "./dataViewer";
import { IPropertyWithName } from "./table";

interface IBeatmapRestorerViewProps {
    local_beatmaps: TGroupedLocalMap | null;
    online_beatmaps: RespUserMostPlayedBeatmaps | null;
    local_scores: string[] | null;
    onBtnSRSReadClicked: () => void;
    onBtnSRSReadByOnlineClicked: () => void;
}

enum RestoreBtnState {
    Hidden,
    ReadByChecksum,
    Download,
}

type TRestoreType = "local" | "online";

export type TGroupedLocalMap = Map<
    number,
    {
        beatmapSetId: number;
        beatmapId: number;
        md5Hash: string;
        artist?: string;
        title?: string;
    }
>;

type TBeatmapWithSelected = RespUserMostPlayedBeatmap & {
    is_selected: {
        value: boolean;
        callback: () => void;
    };
};

export const BeatmapRestorerView: React.FC<IBeatmapRestorerViewProps> = ({
    local_beatmaps,
    online_beatmaps,
    local_scores,
    onBtnSRSReadClicked,
    onBtnSRSReadByOnlineClicked,
}) => {
    const [restoreType, setRestoreType] = useState<TRestoreType>("local");
    const [showFilter, setShowFilter] = useState<boolean>(false);
    const [results, setResults] = useState<TBeatmapWithSelected[]>([]);
    const [localResults, setLocalResults] = useState<string[] | null>(null);
    const [fetchedResults, setFetchedResults] = useState<Map<string, RespBeatmapLookup> | null>(null);
    const [excludedMapIds, setExcludedMapIds] = useState<Set<number>>(new Set());
    const [filterSettings, setFilterSettings] = useState<Partial<Record<FilterType, any>>>({});
    const [subFilterSettings, setSubFilterSettings] = useState<Partial<Record<FilterType, SubFilterType>>>({});
    const [restoreBtnState, setRestoreBtnState] = useState<RestoreBtnState>(RestoreBtnState.Hidden);

    useEffect(() => {
        UpdateResults();
    }, [
        local_beatmaps,
        online_beatmaps,
        local_scores,
        restoreType,
        excludedMapIds,
        fetchedResults,
        filterSettings,
        subFilterSettings,
    ]);

    const UpdateResults = () => {
        setRestoreBtnState(RestoreBtnState.Hidden);
        if (restoreType === "local") {
            if (!local_beatmaps || !local_scores) {
                setResults([]);
                return;
            }

            const localHashSet = new Set(local_beatmaps.values().map((map) => map.md5Hash));
            const filtered = local_scores.filter((md5Hash) => !localHashSet.has(md5Hash));

            if (!localResults || filtered.length !== localResults.length || !fetchedResults) {
                setLocalResults(filtered);
                setRestoreBtnState(RestoreBtnState.ReadByChecksum);
            } else if (fetchedResults) {
                setResults(FetchedMaps());
                setRestoreBtnState(RestoreBtnState.Download);
            }
        } else if (restoreType === "online") {
            if (!online_beatmaps || !local_beatmaps) {
                setResults([]);
                return;
            }
            const filtered = CompesedBeatmaps()
                .filter((map) => ApplyFilter(map, filterSettings))
                .map((map) => ({
                    ...map,
                    is_selected: {
                        value: !excludedMapIds.has(map.beatmapset.id),
                        callback: () => handleSelectChanged(map.beatmapset.id, excludedMapIds.has(map.beatmapset.id)),
                    },
                }));
            setResults(filtered);
            setRestoreBtnState(RestoreBtnState.Download);
        }
    };

    const ApplyFilter = (map: RespUserMostPlayedBeatmap, filters: Partial<Record<FilterType, any>>): boolean => {
        if (filters) {
            if (filters[FilterType.Title] && filters[FilterType.Title].length > 0) {
                const title = filters[FilterType.Title].toLowerCase();
                if (
                    !map.beatmapset.title.toLowerCase().includes(title) &&
                    !map.beatmapset.title_unicode.toLowerCase().includes(title)
                )
                    return false;
            }
            if (filters[FilterType.RankState]) {
                const state = filters[FilterType.RankState] as Array<Omit<RankedStatus, "all">>;
                if (!state.includes("all") && !state.includes(map.beatmapset.status)) return false;
            }
            if (filters[FilterType.PlayCount]) {
                const pcfs = subFilterSettings[FilterType.PlayCount] ?? SubFilterType.Greater;
                const pc = Number(filters[FilterType.PlayCount]) || 0;
                if (
                    !(pcfs === SubFilterType.Greater
                        ? map.count >= pc
                        : pcfs === SubFilterType.Equal
                          ? map.count === pc
                          : map.count <= pc)
                )
                    return false;
            }
            if (filters[FilterType.Language]) {
                const las = filters[FilterType.Language] as Array<number | "all">;
                if (!(las.includes("all") || las.includes(map.beatmapset.language_id))) return false;
            }
            if (filters[FilterType.StarRating]) {
                const sr = filters[FilterType.StarRating];
                const [min = 0, max = 15] = Array.isArray(sr) && sr.length === 2 ? sr : [0, 15];
                if (
                    !(
                        (min === 0 || map.beatmap.difficulty_rating >= min) &&
                        (max === 15 || map.beatmap.difficulty_rating <= max)
                    )
                )
                    return false;
            }
        }
        return true;
    };

    const FetchedMaps = (): TBeatmapWithSelected[] => {
        return Array.from(fetchedResults?.values() ?? []).map(
            (map) =>
                ({
                    ...map,
                    beatmap_id: map.id,
                    count: 0,
                    beatmap: map,
                    is_selected: {
                        value: !excludedMapIds.has(map.beatmapset_id),
                        callback: () => handleSelectChanged(map.beatmapset_id, excludedMapIds.has(map.beatmapset_id)),
                    },
                }) as TBeatmapWithSelected,
        );
    };

    const OnlineBeatmapLangs = () => {
        // https://github.com/ppy/osu-web/blob/1266279a78659f66d91e22d0ca91ae6316e5dbca/database/seeders/ModelSeeders/MiscSeeder.php#L64
        const lids = new Set(online_beatmaps?.map((v) => v.beatmapset.language_id));
        return (
            Array.from(lids).map((v) => {
                return {
                    key: v,
                    label: OsuLanguages.get(v),
                };
            }) ?? []
        );
    };

    const CompesedBeatmaps = () => {
        if (!online_beatmaps || !local_beatmaps) return [];
        const local_sets = new Set(local_beatmaps.values().map((v) => v.beatmapSetId));
        return online_beatmaps.filter((v) => {
            return !local_sets.has(v.beatmapset.id);
        });
    };

    const SelectedBeatmapsetIds = () => results.map((v) => v.beatmapset.id).filter((v) => !excludedMapIds.has(v));

    const handleCloseFilter = () => {
        setShowFilter(false);
    };

    const handleFilterChanged = (newFilters: Partial<Record<FilterType, any>>) => {
        setFilterSettings(newFilters);
    };

    const handleSubFilterChanged = (newFilters: Partial<Record<FilterType, any>>) => {
        setSubFilterSettings(newFilters);
    };

    const handleSelectChanged = (id: number, show: boolean) => {
        setExcludedMapIds((prev) => {
            const newSet = new Set(prev);
            if (show) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleSelectChangeAll = (show: boolean) => {
        results.forEach((v) => {
            handleSelectChanged(v.beatmapset.id, show);
        });
    };

    const handleReadByChecksum = async () => {
        if (!localResults) return;

        if (g.cacheVal.str_client_id?.length === 0 || g.cacheVal.str_client_secret?.length === 0) {
            return;
        }

        try {
            g.setLoading(true, `${__(I18nStrings.MAIN_SRS_READING_CHECKSUM)}...`);
            await InitApi();
            const newFetchedResults = new Map<string, RespBeatmapLookup>();

            for (let i = 0; i < localResults.length; i++) {
                const checksum = localResults[i];
                g.setLoading(true, `${__(I18nStrings.MAIN_SRS_READING_CHECKSUM)}... (${i + 1}/${localResults.length})`);

                const map = await window.olsCore.fetchBeatmapByChecksum(checksum);
                if (!("error" in map)) {
                    newFetchedResults.set(checksum, map);
                }

                if (i < localResults.length - 1) {
                    await sleep(IApiPreDelayMs);
                }
            }

            setFetchedResults(newFetchedResults);
        } catch (error) {
            LogError(error);
        } finally {
            g.setLoading(false);
        }
    };

    const handleDownload = () => {
        const map_ids = [...new Set<number>(SelectedBeatmapsetIds()).values()];
        const fetcher = async (map_ids: number[]) => {
            let rows = "";
            for (const map_id of map_ids) {
                const link = IApiDownloadLink.replace(":id", map_id.toString());
                if (!link || typeof link !== "string") continue;
                rows += `${link}\n`;
            }
            return rows.trim();
        };
        if (map_ids.length === 0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_DL_NODATA),
                severity: "warning",
            });
            return;
        }
        const dlFetcher = async () => (await fetcher(map_ids)).split("\n");
        const downloadOptions = [
            GetDLOptionByRows(dlFetcher),
            GetDLOptionByFDM(dlFetcher),
            GetDLOptionByDirect(map_ids),
        ];
        g.setDialog(true, {
            title: __(I18nStrings.BTN_SRS_DOWNLOAD),
            content: __(I18nStrings.MAIN_DL_SELECT, { url: IApiDownloadLink }),
            actions: downloadOptions,
        });
    };

    const renderList = () => {
        let rows: any = [];
        let row_total = 0;
        let heads: IPropertyWithName[] = [{ name: "checksum", type: "string" }];
        if (restoreType === "local") {
            if (!local_beatmaps)
                return (
                    <Box
                        sx={{
                            minHeight: "16rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Typography variant="body1">{__(I18nStrings.MAIN_SRS_TIP_READ_LOCAL_MAPS_REQUIRED)}</Typography>
                        <Typography variant="body2">▼・ᴥ・▼</Typography>
                    </Box>
                );

            if (!localResults) {
                return (
                    <Box
                        sx={{
                            minHeight: "16rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_SRS_TIP_ALL_MAP_ALREADY_DOWNLOADED)}
                        </Typography>
                        <Typography variant="body2">(′゜ω。‵)</Typography>
                    </Box>
                );
            }

            if (!fetchedResults) {
                rows =
                    localResults?.map((v, index) => ({
                        id: index,
                        checksum: v,
                    })) ?? [];
            } else {
                rows = results.map((v) => {
                    return {
                        id: v.beatmapset.id,
                        img: v.beatmapset.covers["card@2x"],
                        name: v.beatmapset.title,
                        preview_url: v.beatmapset.preview_url,
                        "#link": `https://osu.ppy.sh/b/${v.beatmap_id}`,
                        "#shell_link": `osu://b/${v.beatmap_id}`,
                        is_selected: v.is_selected,
                    };
                });
                const asc = rows.length > 0 && rows.every((v: any) => v.is_selected.value);
                heads = [
                    {
                        name: "",
                        type: "checkbox",
                        key: "is_selected",
                        checkbox_toggler: {
                            checked: asc,
                            callback: handleSelectChangeAll,
                        },
                    },
                    { name: "#", type: "picture", key: "img" },
                    {
                        name: "name",
                        type: "string",
                        link: "link",
                        shell_link: "shell_link",
                    },
                    { name: "preview_url", type: "audio" },
                ];
            }
            row_total = rows.length;
        } else if (restoreType === "online") {
            if (!online_beatmaps)
                return (
                    <Box
                        sx={{
                            minHeight: "16rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Typography variant="body1">
                            {__(I18nStrings.MAIN_SRS_TIP_READ_ONLINE_MAPS_REQUIRED)}
                        </Typography>
                        <Typography variant="body2">▼・ᴥ・▼</Typography>
                    </Box>
                );
            rows = results.map((v: any) => {
                return {
                    id: v.beatmapset.id,
                    img: v.beatmapset.covers["card@2x"],
                    name: v.beatmapset.title,
                    play_count: v.count,
                    preview_url: v.beatmapset.preview_url,
                    "#link": `https://osu.ppy.sh/b/${v.beatmap_id}`,
                    "#shell_link": `osu://b/${v.beatmap_id}`,
                    is_selected: v.is_selected,
                };
            });
            row_total = CompesedBeatmaps().length;
            const asc = rows.length > 0 && rows.every((v: any) => v.is_selected.value);

            heads = [
                {
                    name: "",
                    type: "checkbox",
                    key: "is_selected",
                    checkbox_toggler: {
                        checked: asc,
                        callback: handleSelectChangeAll,
                    },
                },
                { name: "#", type: "picture", key: "img" },
                {
                    name: "name",
                    type: "string",
                    link: "link",
                    shell_link: "shell_link",
                },
                { name: "play_count", type: "string" },
                { name: "preview_url", type: "audio" },
            ];
        }

        return <DataViewer heads={heads} rows={rows} rows_total={row_total} min_height={"400px"} />;
    };

    const renderBtn = () => {
        if (restoreBtnState === RestoreBtnState.ReadByChecksum) {
            const clientId = g.cacheVal.str_client_id ?? "";
            const clientSecret = g.cacheVal.str_client_secret ?? "";
            return (
                <Button
                    variant="contained"
                    onClick={() => handleReadByChecksum()}
                    disabled={clientId.length === 0 || clientSecret.length === 0}
                >
                    {__(I18nStrings.BTN_SRS_READ_BY_CHECKSUM)}
                </Button>
            );
        } else if (restoreBtnState === RestoreBtnState.Download) {
            const tarSize = SelectedBeatmapsetIds().length;
            return (
                <Button variant="contained" onClick={() => handleDownload()} disabled={tarSize === 0}>
                    {__(I18nStrings.BTN_SRS_DOWNLOAD)} ({tarSize})
                </Button>
            );
        }
        return null;
    };

    return (
        <Observer>
            {() => {
                const clientId = g.cacheVal.str_client_id ?? "";
                const clientSecret = g.cacheVal.str_client_secret ?? "";

                return (
                    <>
                        <BeatmapFilterView
                            show={showFilter}
                            onClose={handleCloseFilter}
                            onFilterChanged={handleFilterChanged}
                            onSubFilterChanged={handleSubFilterChanged}
                            allowedFilterTypes={[
                                FilterType.Title,
                                FilterType.RankState,
                                FilterType.Language,
                                FilterType.PlayCount,
                                FilterType.StarRating,
                            ]}
                            allowedLanguages={OnlineBeatmapLangs()}
                        />
                        <Stack direction={"row"} spacing={1} justifyContent={"end"}>
                            <Button variant="contained" onClick={() => onBtnSRSReadClicked()}>
                                {__(I18nStrings.BTN_SRS_READ)}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    onBtnSRSReadByOnlineClicked();
                                    setRestoreType("online");
                                }}
                                disabled={clientId.length === 0 || clientSecret.length === 0}
                            >
                                {__(I18nStrings.BTN_SRS_READ_BY_ONLINE)}
                            </Button>
                        </Stack>
                        <Stack direction={"row"} spacing={1} justifyContent={"space-between"}>
                            <ToggleButtonGroup
                                color="info"
                                value={restoreType}
                                exclusive
                                onChange={(_, v) => v !== null && setRestoreType(v)}
                            >
                                <ToggleButton value={"local"}>{__(I18nStrings.BTN_SRS_GROUP_LOCAL)}</ToggleButton>
                                <ToggleButton value={"online"}>{__(I18nStrings.BTN_SRS_GROUP_ONLINE)}</ToggleButton>
                            </ToggleButtonGroup>
                            <ButtonGroup color="info">
                                <Button variant="outlined" startIcon={<Search />} onClick={() => setShowFilter(true)}>
                                    {__(I18nStrings.BTN_SRS_SEARCH)}
                                </Button>
                            </ButtonGroup>
                        </Stack>
                        {renderList()}
                        {renderBtn()}
                    </>
                );
            }}
        </Observer>
    );
};
