import React,{ useState } from "react";
import { Observer } from "mobx-react";
import {
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    Stack,
    Typography,
} from "@mui/material";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { OsuPathSettings } from "./osuPathSettings";
import { ApiSettings } from "./apiSettings";
import g from "../state";
import { ConfigKey } from "../../utils/typed/config";
import { IApiPreDelayMs } from "../../utils/api";
import { DataViewer } from "./dataViewer";
import { BeatmapPack,RespBeatmapPack } from "../../api/v2/types/api_resp";
import { GetDLOptionByDirect,GetDLOptionByFDM,GetDLOptionByRows } from "../../utils/download";
import { OsuClients,OsuModes } from "../../defines/types";
import { readAllWithOffset } from "../../utils/reader";
import { IPropertyWithName } from "./table";
import { sleep } from "../../utils/time";

export interface IBeatmapPackDownloadViewProps {
}

export type DateRangeType='7d'|'30d'|'6m'|'all';

const getTypeOptions=() => [
    { key: 'all',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_ALL) },
    { key: 'standard',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_STANDARD) },
    { key: 'featured',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_FEATURED) },
    { key: 'tournament',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_TOURNAMENT) },
    { key: 'loved',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_LOVED) },
    { key: 'chart',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_CHART) },
    { key: 'theme',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_THEME) },
    { key: 'artist',label: __(I18nStrings.MAIN_BPKS_DL_TYPE_ARTIST) },
];

const getDateRangeOptions=() => [
    { key: '7d' as DateRangeType,label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_7D),days: 7 },
    { key: '30d' as DateRangeType,label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_30D),days: 30 },
    { key: '6m' as DateRangeType,label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_6M),days: 180 },
    { key: 'all' as DateRangeType,label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_ALL),days: null },
];

const BeatmapPackDownloadOptions: React.FC<{
    selectedTypes: string[];
    gameModes: string[];
    selectedDateRange: DateRangeType;
    downloadMode: 'full'|'diff';
    onTypeChange: (types: string|string[]) => void;
    onGameModeChange: (types: string|string[]) => void;
    onDateRangeChange: (range: DateRangeType) => void;
    onModeChange: (mode: 'full'|'diff') => void;
}>=({
    selectedTypes,
    gameModes,
    selectedDateRange,
    downloadMode,
    onTypeChange,
    onGameModeChange,
    onDateRangeChange,
    onModeChange: onDLModeChange,
}) => {
        const typeOptions=getTypeOptions();
        const dateRangeOptions=getDateRangeOptions();
        const modesOptions=[{
            key: 'all',
            label: __(I18nStrings.MAIN_BPKS_DL_GMODE_ALL),
        },...OsuModes.entries().map(([key,value]) => ({ key,label: value })).toArray()];

        return (
            <Stack spacing={2}>
                <Typography variant="body1">
                    {__(I18nStrings.MAIN_BPKS_DL_OPTIONS_DESC)}
                </Typography>

                <FormControl fullWidth>
                    <InputLabel id="bpks-types">{__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}</InputLabel>
                    <Select
                        labelId="bpks-types"
                        label={__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}
                        value={selectedTypes}
                        onChange={(e) => onTypeChange(e.target.value)}
                        multiple
                    >
                        {typeOptions.map((option) => (
                            <MenuItem key={option.key} value={option.key}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <FormControl fullWidth>
                    <InputLabel id="bpks-gamemodes">{__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}</InputLabel>
                    <Select
                        labelId="bpks-gamemodes"
                        label={__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}
                        value={gameModes}
                        onChange={(e) => onGameModeChange(e.target.value)}
                        multiple
                    >
                        {modesOptions.map((option) => (
                            <MenuItem key={option.key} value={option.key}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <FormControl fullWidth>
                    <InputLabel id="bpks-date-range">{__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}</InputLabel>
                    <Select
                        labelId="bpks-date-range"
                        label={__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}
                        value={selectedDateRange}
                        onChange={(e) => onDateRangeChange(e.target.value as DateRangeType)}
                    >
                        {dateRangeOptions.map((option) => (
                            <MenuItem key={option.key} value={option.key}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Box>
                    <Typography variant="h6" gutterBottom>
                        下載模式
                    </Typography>
                    <RadioGroup
                        value={downloadMode}
                        onChange={(e) => onDLModeChange(e.target.value as 'full'|'diff')}
                    >
                        <FormControlLabel
                            value="full"
                            control={<Radio />}
                            label={__(I18nStrings.MAIN_BPKS_DL_MODE_FULL)}
                        />
                        <FormControlLabel
                            value="diff"
                            control={<Radio />}
                            label={__(I18nStrings.MAIN_BPKS_DL_MODE_DIFF)}
                        />
                    </RadioGroup>
                </Box>
            </Stack>
        );
    };

export const BeatmapPackDownloadView: React.FC<IBeatmapPackDownloadViewProps>=() => {
    const [fetchedPacks,setFetchedPacks]=useState<BeatmapPack[]>([]);
    const [fetchedPackInfos,setFetchedPackInfos]=useState<RespBeatmapPack[]>([]);
    const [excludedPackTags,setExcludedPackTags]=useState<Set<string>>(new Set());
    const [excludedPackMapIds,setExcludedPackMapIds]=useState<Set<number>>(new Set());

    const handleTypeChange=async (type: string|string[]) => {
        let types=typeof type==="string"? [type]:type;
        const savedTypes=g.config?.[ConfigKey.BPKS_DL_TYPE]??['standard'];
        const oldTypes=Array.from(savedTypes);

        if(types.includes('all')) {
            if(oldTypes.includes('all')) {
                types=types.filter((v) => v!=='all');
            } else {
                types=[];
            }
        }
        if(types.length===0) {
            types=["all"];
        }

        await g.saveConfig(ConfigKey.BPKS_DL_TYPE,types);
    };

    const handleGameModeChange=async (mode: string|string[]) => {
        let modes=typeof mode==="string"? [mode]:mode;
        const old=Array.from(g.config?.[ConfigKey.BPKS_DL_GMODE]??['all']);

        if(modes.includes('all')) {
            if(old.includes('all')) {
                modes=modes.filter((v) => v!=='all');
            } else {
                modes=[];
            }
        }
        if(modes.length===0) {
            modes=["all"];
        }

        await g.saveConfig(ConfigKey.BPKS_DL_GMODE,modes);
    };

    const handleDateRangeChange=async (range: DateRangeType) => {
        await g.saveConfig(ConfigKey.BPKS_DL_DATE_RANGE,range);
    };

    const handleModeChange=async (mode: 'full'|'diff') => {
        await g.saveConfig(ConfigKey.BPKS_DL_MODE,mode);
    };

    const handleOpenDialog=() => {
        const render=() => {
            const savedTypes=(g.config?.[ConfigKey.BPKS_DL_TYPE]??['standard']) as string[];
            const gameModes=g.config?.[ConfigKey.BPKS_DL_GMODE]??['all'] as string[];
            const savedDateRange=(g.config?.[ConfigKey.BPKS_DL_DATE_RANGE]??'7d') as DateRangeType;
            const savedMode=(g.config?.[ConfigKey.BPKS_DL_MODE]??'full') as 'full'|'diff';
            return (
                <BeatmapPackDownloadOptions
                    selectedTypes={savedTypes}
                    gameModes={gameModes}
                    selectedDateRange={savedDateRange}
                    downloadMode={savedMode}
                    onTypeChange={handleTypeChange}
                    onGameModeChange={handleGameModeChange}
                    onDateRangeChange={handleDateRangeChange}
                    onModeChange={handleModeChange}
                />
            )
        }
        g.setDialog(true,{
            title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
            content: render,
            actions: [
                {
                    label: __(I18nStrings.BTN_CANCEL),
                    callback: handleCloseDialog,
                },
                {
                    label: __(I18nStrings.BTN_CONFIRM),
                    callback: handleConfirmDownload,
                },
            ],
        });
    };

    const handleCloseDialog=() => {
        g.setDialog(false);
    };

    const filterPacksByDate=(packs: BeatmapPack[],range: DateRangeType) => {
        if(range==='all') return packs;

        const dateRangeOptions=getDateRangeOptions();
        const rangeOption=dateRangeOptions.find((opt) => opt.key===range);
        if(!rangeOption||rangeOption.days===null) return packs;

        const cutoffDate=new Date();
        cutoffDate.setDate(cutoffDate.getDate()-rangeOption.days);

        return packs.filter((pack) => {
            const packDate=new Date(pack.date);
            return packDate>=cutoffDate;
        });
    };

    const handleConfirmDownload=async () => {
        const types=(g.config?.[ConfigKey.BPKS_DL_TYPE]??['standard']) as string[];
        const dateRange=(g.config?.[ConfigKey.BPKS_DL_DATE_RANGE]??'7d') as DateRangeType;
        const downloadMode=(g.config?.[ConfigKey.BPKS_DL_MODE]??'full') as 'full'|'diff';
        const gameModes=g.config?.[ConfigKey.BPKS_DL_GMODE]??['all'] as string[];
        const osuPath=g.config?.[ConfigKey.PATH_STABLE_DIR]??"";

        if(types.length===0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_BPKS_DL_NO_TYPE_SELECTED),
                severity: 'warning'
            });
            return;
        }

        if(dateRange==='all') {
            if(!confirm(__(I18nStrings.MAIN_BPKS_DATE_RABGE_CONFIRM))) {
                return;
            }
        }

        if(downloadMode==='diff'&&osuPath.length===0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_BPKS_DL_OSU_PATH_REQUIRED),
                severity: 'warning'
            });
            return;
        }

        handleCloseDialog();

        const clientId=g.cacheVal.str_client_id??"";
        const clientSecret=g.cacheVal.str_client_secret??"";

        try {
            await window.olsCore.initAC(clientId,clientSecret);

            let selectedTypes=new Set<string>(types as string[]);
            if(types.includes('all')) {
                const typeOptions=getTypeOptions();
                selectedTypes=new Set(typeOptions.map((v) => v.key).filter((v) => v!=='all'));
            }

            let allPacks: BeatmapPack[]=[];
            let allPackInfos: RespBeatmapPack[]=[];

            let index=0;
            const aborter=new AbortController();
            for(const type of selectedTypes) {
                if(aborter.signal.aborted) break;

                g.setLoading(true,__(I18nStrings.MAIN_BPKS_DL_FETCHING,{ type }),aborter);

                let hasNext=true;
                let cursor_string=undefined;
                while(hasNext) {
                    if(aborter.signal.aborted) break;

                    const response=await window.olsCore.fecthBeatmapPacks(type as any,cursor_string);

                    if('error' in response) {
                        throw new Error(response.error);
                    }

                    if(response.beatmap_packs) {
                        let filteredPacks=filterPacksByDate(response.beatmap_packs,dateRange);
                        if(gameModes&&!gameModes.includes('all')) {
                            const incStd=gameModes.includes(0);
                            filteredPacks=filteredPacks.filter((pack) => ((pack.ruleset_id===null||pack.ruleset_id===undefined)&&incStd)||pack.ruleset_id&&gameModes.includes(pack.ruleset_id));
                        }
                        if(filteredPacks.length===0) {
                            hasNext=false;
                            break;
                        }
                        if(downloadMode==='diff') {
                            // fetch pack info
                            for(const pack of filteredPacks) {
                                if(aborter.signal.aborted) break;

                                const info=await window.olsCore.getBeatmapPack(pack.tag);
                                if('error' in info) {
                                    throw new Error(info.error);
                                }
                                allPackInfos.push(info);
                                if(info.cached!==true) {
                                    await sleep(IApiPreDelayMs,aborter.signal);
                                }
                            }
                        }
                        allPacks=allPacks.concat(filteredPacks);
                    }

                    if(response.cursor_string) {
                        cursor_string=response.cursor_string;
                    } else {
                        hasNext=false;
                    }
                    await sleep(IApiPreDelayMs,aborter.signal);
                }

                index++;
                await sleep(IApiPreDelayMs,aborter.signal);
            }

            if(!aborter.signal.aborted) {
                setFetchedPacks(allPacks);
                setFetchedPackInfos(allPackInfos);
                setExcludedPackTags(new Set());

                if(downloadMode==='diff') {
                    g.setLoading(true,__(I18nStrings.MAIN_SRS_READING_LOCAL));
                    await window.olsCore.initStableReader(osuPath);
                    let local=await window.olsCore.getBeatmaps(OsuClients.Stable,0);
                    let fetch_fn=async (offset: number,limit: number) => {
                        return await window.olsCore.getBeatmaps(OsuClients.Stable,offset,limit);
                    };
                    local=await readAllWithOffset(fetch_fn,local);
                    const mapIds=new Set(local.data.map((v) => v.beatmapSetId));
                    setExcludedPackMapIds(new Set(allPackInfos.map((v) => v.beatmapsets.map((m) => m.id)).flat().filter((v) => mapIds.has(v))));
                    g.setLoading(false);
                }
            }
        } catch(error: any) {
            console.error('Error fetching beatmap packs:',error);
        } finally {
            g.setLoading(false);
        }
    };

    const handlePackSelection=(tag: string,selected: boolean) => {
        setExcludedPackTags(prev => {
            const newSet=new Set(prev);
            if(!selected) {
                newSet.add(tag);
            } else {
                newSet.delete(tag);
            }
            return newSet;
        });
    };

    const handleToggleAllPacks=(selected: boolean) => {
        if(!selected) {
            setExcludedPackTags(new Set(fetchedPacks.map(pack => pack.tag)));
        } else {
            setExcludedPackTags(new Set());
        }
    };

    const handlePackMapSelection=(mapId: number,selected: boolean) => {
        setExcludedPackMapIds(prev => {
            const newSet=new Set(prev);
            if(!selected) {
                newSet.add(mapId);
            } else {
                newSet.delete(mapId);
            }
            return newSet;
        });
    };

    const handleToggleAllPackMaps=(selected: boolean) => {
        if(!selected) {
            setExcludedPackMapIds(new Set(fetchedPackInfos.map(pack => pack.beatmapsets.map((m) => m.id)).flat()));
        } else {
            setExcludedPackMapIds(new Set());
        }
    };

    const handleStartDownload=() => {
        const selectedPacks=fetchedPacks.filter(pack => !excludedPackTags.has(pack.tag));

        if(selectedPacks.length===0) {
            g.setNotify({
                message: '請至少選擇一個圖譜包！',
                severity: 'warning'
            });
            return;
        }
        const savedMode=(g.config?.[ConfigKey.BPKS_DL_MODE]??'full') as 'full'|'diff';
        const dlFetcher=async () => fetchedPacks.filter(pack => !excludedPackTags.has(pack.tag)).map(pack => pack.url);
        let downloadOptions=[
            GetDLOptionByRows(dlFetcher),
            GetDLOptionByFDM(dlFetcher),
        ];
        if(savedMode==='diff') {
            const maps=fetchedPackInfos.map(pack => pack.beatmapsets).flat();
            const mapIds=new Set(maps.map((v) => v.id));
            const flitedMapId=[...mapIds].filter(id => !excludedPackMapIds.has(id));
            const dlink=g.config?.[ConfigKey.API_DLINK]??"https://osu.ppy.sh/beatmapsets/:id/download";
            const dlFetcher=async () => flitedMapId.map(map_id => dlink.replace(":id",map_id.toString()));
            downloadOptions=[
                GetDLOptionByRows(dlFetcher),
                GetDLOptionByFDM(dlFetcher),
                GetDLOptionByDirect(flitedMapId),
            ];
        }
        g.setDialog(true,{
            title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
            content: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_DESC),
            actions: downloadOptions
        });
    };

    const handleResetSelection=() => {
        setFetchedPacks([]);
        setExcludedPackTags(new Set());
    };

    return (
        <Observer>
            {() => {
                const clientId=g.cacheVal.str_client_id??"";
                const clientSecret=g.cacheVal.str_client_secret??"";
                const savedMode=(g.config?.[ConfigKey.BPKS_DL_MODE]??'full') as 'full'|'diff';

                let packRows=fetchedPacks.map(pack => ({
                    tag: pack.tag,
                    name: pack.name,
                    author: pack.author,
                    ruleset_id: pack.ruleset_id,
                    date: new Date(pack.date).toLocaleDateString(),
                    is_selected: {
                        value: !excludedPackTags.has(pack.tag),
                        callback: () => handlePackSelection(pack.tag,excludedPackTags.has(pack.tag))
                    }
                }));

                let allSelected=fetchedPacks.length>0&&excludedPackTags.size===0;
                let resSize=fetchedPacks.length;
                let tarSize=resSize-excludedPackTags.size;
                let extNameHead={};
                if(savedMode==='diff') {
                    const maps=fetchedPackInfos.map(pack => pack.beatmapsets).flat();
                    const mapIds=new Set(maps.map((v) => v.id));
                    resSize=mapIds.size;
                    tarSize=resSize-excludedPackMapIds.size;
                    allSelected=resSize>0&&excludedPackMapIds.size===0;

                    packRows=fetchedPackInfos.map(pack => {
                        return pack.beatmapsets.map((beatmapset) => ({
                            tag: pack.tag,
                            name: beatmapset.title,
                            author: pack.author,
                            ruleset_id: pack.ruleset_id,
                            date: new Date(beatmapset.last_updated).toLocaleDateString(),
                            is_selected: {
                                value: !excludedPackMapIds.has(beatmapset.id),
                                callback: () => handlePackMapSelection(beatmapset.id,excludedPackMapIds.has(beatmapset.id))
                            },
                            "#link": `https://osu.ppy.sh/s/${beatmapset.id}`,
                            "#shell_link": `osu://s/${beatmapset.id}`,
                        }))
                    }).flat();
                    extNameHead={
                        link: "link",
                        shell_link: "shell_link"
                    }
                }

                const heads: IPropertyWithName[]=[
                    {
                        name: null,
                        type: "checkbox",
                        key: "is_selected",
                        checkbox_toggler: {
                            checked: allSelected,
                            callback: savedMode==='full'? handleToggleAllPacks:handleToggleAllPackMaps
                        },
                        append_keys: ["tag"]
                    },
                    { name: __(I18nStrings.MAIN_NAME),type: "string",key: "name",...extNameHead },
                    { name: __(I18nStrings.MAIN_RULESET),type: "string",key: "ruleset_id" },
                    { name: __(I18nStrings.MAIN_AUTHOR),type: "string",key: "author" },
                    { name: __(I18nStrings.MAIN_DATE),type: "string",key: "date" }
                ];

                return (
                    <>
                        <Stack spacing={2}>
                            <Stack direction={"row"} spacing={1}>
                                <OsuPathSettings
                                    showLazer={false}
                                    showStable={true}
                                />
                            </Stack>
                            <Stack direction={"row"} spacing={1}>
                                <ApiSettings />
                            </Stack>

                            {fetchedPacks.length===0? (
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={handleOpenDialog}
                                    disabled={clientId.length===0||clientSecret.length===0||g.isLoading()}
                                >
                                    {__(I18nStrings.BTN_BPKS_READ)}
                                </Button>
                            ):(
                                <>
                                    <Box sx={{ height: '60vh',width: '100%' }}>
                                        <DataViewer
                                            heads={heads}
                                            rows={packRows}
                                            rows_total={packRows.length}
                                            min_height="55vh"
                                        />
                                    </Box>
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            onClick={handleResetSelection}
                                            variant="outlined"
                                            fullWidth>
                                            {__(I18nStrings.BTN_CANCEL)}
                                        </Button>
                                        <Button
                                            onClick={handleStartDownload}
                                            variant="contained"
                                            disabled={tarSize===0}
                                            fullWidth
                                        >
                                            {__(I18nStrings.BTN_CONFIRM)} ({tarSize})
                                        </Button>
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    </>
                );
            }}
        </Observer>
    );
};
