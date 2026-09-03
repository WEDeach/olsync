import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import {
    Autocomplete,
    Chip,
    Container,
    Drawer,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Select,
    Slider,
    Stack,
    TextField,
} from "@mui/material";
import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { StableLocalBeatmapStatus } from "../../defines/stable_structs";
import { OsuModes } from "../../defines/types";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";

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
    Mode,
    RankStateLocal,
    PlayerTags,
}

export enum SubFilterType {
    Greater,
    Equal,
    Less,
}

type TLanguage = {
    key: number;
    label?: string;
};

export type TFilterSetting = {
    [key in FilterType]?: any;
};

export type TSubFilterSetting = {
    [key in FilterType]?: SubFilterType;
};

interface IBeatmapFilterViewProps {
    show: boolean;
    inline?: boolean;
    allowedFilterTypes?: FilterType[];
    allowedLanguages?: TLanguage[];
    initialSettings?: TFilterSetting;
    initialSubFilter?: TSubFilterSetting;
    onClose: () => void;
    onFilterChanged: (settings: TFilterSetting) => void;
    onSubFilterChanged: (settings: TFilterSetting) => void;
}

const useOnlineDbStatus = () => {
    const [dbLoaded, setDbLoaded] = useState(false);
    useEffect(() => {
        window.olsCore.getOnlineDbStatus().then((s) => {
            if (s && !(s as any).error) setDbLoaded((s as any).loaded ?? false);
        });
    }, []);
    return dbLoaded;
};

const useTagSearch = () => {
    const [options, setOptions] = useState<string[]>([]);
    const deferredOptions = useDeferredValue(options);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

    const search = useCallback((query: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!query.trim()) {
            setOptions([]);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            const results = await window.olsCore.searchOnlineTags(query);
            if (!results || (results as any).error) return;
            setOptions((results as any[]).map((t: any) => t.name ?? t));
        }, 250);
    }, []);

    return { options: deferredOptions, search };
};

export const BeatmapFilterView: React.FC<IBeatmapFilterViewProps> = ({
    show,
    inline,
    allowedFilterTypes,
    allowedLanguages,
    initialSettings,
    onClose,
    onFilterChanged,
    onSubFilterChanged,
    initialSubFilter,
}) => {
    const [renderFields, _] = useState<FilterType[]>(
        allowedFilterTypes ?? [FilterType.Name, FilterType.Artist, FilterType.Title, FilterType.RankState],
    );
    const [settings, setSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [cacheSettings, setCacheSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [subSettings, setSubSettings] = useState<TSubFilterSetting>(initialSubFilter ?? {});
    const [titleInputValue, setTitleInputValue] = useState(initialSettings?.[FilterType.Title] ?? "");
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const dbLoaded = useOnlineDbStatus();
    const { options: tagOptions, search: searchTags } = useTagSearch();

    const getSubSetting = (type: FilterType): SubFilterType => {
        return subSettings?.[type] ?? SubFilterType.Greater;
    };

    const handleSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...settings };
        let old = newSettings[type];

        if (
            type === FilterType.RankState ||
            type === FilterType.RankStateLocal ||
            type === FilterType.Language ||
            type === FilterType.Mode
        ) {
            if (!Array.isArray(value)) value = [value];
            if (value.includes("all")) {
                if (old === undefined) old = ["all"];
                if (old?.includes("all")) {
                    value = value.filter((_v: any) => _v !== "all");
                } else {
                    value = ["all"];
                }
            }
            if (value.length === 0) value = ["all"];
        }
        newSettings[type] = value;
        setSettings(newSettings);

        // TDOD: save settings and notify main view
        onFilterChanged(newSettings);
    };

    const handlePreSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...cacheSettings };
        newSettings[type] = value;
        setCacheSettings(newSettings);
    };

    const handleSubSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...subSettings };
        newSettings[type] = value;
        setSubSettings(newSettings);

        onSubFilterChanged(newSettings);
    };

    const content = (
        <Container maxWidth="lg" sx={{ p: 1 }}>
            <Stack spacing={2}>
                {renderFields.map((v) => {
                    if (v === FilterType.Title) {
                        return (
                            <TextField
                                key={v}
                                label={__(I18nStrings.MAIN_PICKER_FILTER_TITLE_LABEL)}
                                variant="outlined"
                                size="small"
                                fullWidth
                                value={titleInputValue}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setTitleInputValue(val);
                                    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
                                    titleDebounceRef.current = setTimeout(() => {
                                        handleSettingsChanged(FilterType.Title, val);
                                    }, 300);
                                }}
                            />
                        );
                    } else if (v === FilterType.RankState) {
                        return (
                            <FormControl key={v} size="small" fullWidth>
                                <InputLabel id="rank-state">{__(I18nStrings.MAIN_PICKER_FILTER_RANK_STATE)}</InputLabel>
                                <Select
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_RANK_STATE)}
                                    labelId="rank-state"
                                    value={settings?.[FilterType.RankState] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.RankState, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>{__(I18nStrings.MAIN_PICKER_FILTER_ALL)}</MenuItem>
                                    <MenuItem value={RankedStatus.Graveyard}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_GRAVEYARD)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.WIP}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_WIP)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.Pending}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_PENDING)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.Ranked}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_RANKED)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.Approved}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_APPROVED)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.Qualified}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_QUALIFIED)}
                                    </MenuItem>
                                    <MenuItem value={RankedStatus.Loved}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_LOVED)}
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        );
                    } else if (v === FilterType.RankStateLocal) {
                        return (
                            <FormControl key={v} size="small" fullWidth>
                                <InputLabel id="rank-state-local">
                                    {__(I18nStrings.MAIN_PICKER_FILTER_RANK_STATE_LOCAL)}
                                </InputLabel>
                                <Select
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_RANK_STATE_LOCAL)}
                                    labelId="rank-state-local"
                                    value={settings?.[FilterType.RankStateLocal] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.RankStateLocal, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>{__(I18nStrings.MAIN_PICKER_FILTER_ALL)}</MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Unsubmitted}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_NOT_SUBMITTED)}
                                    </MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Unranked}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_PENDING_WIP_GRAVEYARD)}
                                    </MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Ranked}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_RANKED)}
                                    </MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Approved}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_APPROVED)}
                                    </MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Qualified}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_QUALIFIED)}
                                    </MenuItem>
                                    <MenuItem value={StableLocalBeatmapStatus.Loved}>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_LOVED)}
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        );
                    } else if (v === FilterType.PlayCount) {
                        return (
                            <FormControl key={v} size="small" fullWidth>
                                <InputLabel htmlFor="play-count">
                                    {__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}
                                </InputLabel>
                                <OutlinedInput
                                    id="play-count"
                                    size="small"
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}
                                    type="number"
                                    value={cacheSettings?.[FilterType.PlayCount] ?? 0}
                                    inputProps={{ min: 0, step: 1 }}
                                    onChange={(e) =>
                                        handlePreSettingsChanged(FilterType.PlayCount, Number(e.target.value))
                                    }
                                    onBlur={(e) => handleSettingsChanged(FilterType.PlayCount, Number(e.target.value))}
                                    startAdornment={
                                        <InputAdornment
                                            position="start"
                                            sx={{
                                                borderRight: "1px solid",
                                                borderColor: "divider",
                                                maxHeight: "unset",
                                                alignSelf: "stretch",
                                            }}
                                        >
                                            <Select
                                                value={getSubSetting(FilterType.PlayCount)}
                                                onChange={(e) =>
                                                    handleSubSettingsChanged(FilterType.PlayCount, e.target.value)
                                                }
                                                variant="standard"
                                                disableUnderline
                                                sx={{
                                                    minWidth: "50px",
                                                    "& .MuiSelect-select": {
                                                        py: 0,
                                                        pr: "24px !important",
                                                    },
                                                }}
                                            >
                                                <MenuItem value={SubFilterType.Greater}>≥</MenuItem>
                                                <MenuItem value={SubFilterType.Equal}>=</MenuItem>
                                                <MenuItem value={SubFilterType.Less}>≤</MenuItem>
                                            </Select>
                                        </InputAdornment>
                                    }
                                    endAdornment={
                                        <InputAdornment
                                            position="end"
                                            sx={{
                                                flexDirection: "column",
                                                maxHeight: "unset",
                                                alignSelf: "stretch",
                                                height: 40,
                                                borderLeft: "1px solid",
                                                borderColor: "divider",
                                                ml: 0,
                                                overflow: "hidden",
                                                "& button": {
                                                    py: 0,
                                                    flex: 1,
                                                    borderRadius: 0.5,
                                                    minHeight: 0,
                                                    minWidth: 0,
                                                },
                                            }}
                                        >
                                            <IconButton
                                                size="small"
                                                onClick={() => {
                                                    const current = cacheSettings?.[FilterType.PlayCount] ?? 0;
                                                    handlePreSettingsChanged(FilterType.PlayCount, current + 1);
                                                    handleSettingsChanged(FilterType.PlayCount, current + 1);
                                                }}
                                                aria-label={__(I18nStrings.MAIN_PICKER_WEIGHT_INCREASE)}
                                            >
                                                <KeyboardArrowUp sx={{ transform: "translateY(2px)" }} />
                                            </IconButton>

                                            <IconButton
                                                size="small"
                                                onClick={() => {
                                                    const current = cacheSettings?.[FilterType.PlayCount] ?? 0;
                                                    const next = Math.max(0, current - 1);
                                                    handlePreSettingsChanged(FilterType.PlayCount, next);
                                                    handleSettingsChanged(FilterType.PlayCount, next);
                                                }}
                                                aria-label={__(I18nStrings.MAIN_PICKER_WEIGHT_DECREASE)}
                                            >
                                                <KeyboardArrowDown sx={{ transform: "translateY(-2px)" }} />
                                            </IconButton>
                                        </InputAdornment>
                                    }
                                    sx={{ pr: 0 }}
                                />
                            </FormControl>
                        );
                    } else if (v === FilterType.Language) {
                        return (
                            <FormControl key={v} size="small" fullWidth>
                                <InputLabel id="filter-lang">{__(I18nStrings.MAIN_PICKER_FILTER_LANG)}</InputLabel>
                                <Select
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_LANG)}
                                    labelId="filter-lang"
                                    value={settings?.[FilterType.Language] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.Language, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>{__(I18nStrings.MAIN_PICKER_FILTER_ALL)}</MenuItem>
                                    {Object.entries(allowedLanguages ?? []).map(([_, lab]) => (
                                        <MenuItem key={lab.key} value={lab.key}>
                                            {lab.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        );
                    } else if (v === FilterType.StarRating) {
                        const srMode = subSettings[FilterType.StarRating];
                        const isRange = srMode === undefined;
                        const srVal: [number, number] = cacheSettings?.[FilterType.StarRating] ?? [0, 15];

                        const handleSrModeChange = (newMode: string) => {
                            if (newMode === "range") {
                                handleSubSettingsChanged(FilterType.StarRating, undefined);
                                const current = srVal[0];
                                handlePreSettingsChanged(FilterType.StarRating, [0, current]);
                                handleSettingsChanged(FilterType.StarRating, [0, current]);
                            } else {
                                const mode = Number(newMode) as SubFilterType;
                                handleSubSettingsChanged(FilterType.StarRating, mode);
                                const first = srVal[0];
                                handlePreSettingsChanged(FilterType.StarRating, [first, first]);
                                handleSettingsChanged(FilterType.StarRating, [first, first]);
                            }
                        };

                        const srStartAdornment = (
                            <InputAdornment
                                position="start"
                                sx={{
                                    borderRight: "1px solid",
                                    borderColor: "divider",
                                    maxHeight: "unset",
                                    alignSelf: "stretch",
                                }}
                            >
                                <Select
                                    value={isRange ? "range" : srMode}
                                    onChange={(e) => handleSrModeChange(e.target.value as string)}
                                    variant="standard"
                                    disableUnderline
                                    sx={{
                                        minWidth: "4rem",
                                        "& .MuiSelect-select": {
                                            py: 0,
                                            pr: "24px !important",
                                            fontSize: "0.85rem",
                                        },
                                    }}
                                >
                                    <MenuItem value="range">{__(I18nStrings.MAIN_PICKER_FILTER_SR_BETWEEN)}</MenuItem>
                                    <MenuItem value={SubFilterType.Greater}>≥</MenuItem>
                                    <MenuItem value={SubFilterType.Equal}>=</MenuItem>
                                    <MenuItem value={SubFilterType.Less}>≤</MenuItem>
                                </Select>
                            </InputAdornment>
                        );

                        const srRangeEndAdornment = (
                            <InputAdornment
                                position="end"
                                sx={{
                                    borderLeft: "1px solid",
                                    borderColor: "divider",
                                    maxHeight: "unset",
                                    alignSelf: "stretch",
                                    ml: 0,
                                    gap: 0.5,
                                    px: 1,
                                }}
                            >
                                <OutlinedInput
                                    size="small"
                                    type="number"
                                    value={srVal[1]}
                                    onChange={(e) =>
                                        handlePreSettingsChanged(FilterType.StarRating, [
                                            srVal[0],
                                            Number(e.target.value),
                                        ])
                                    }
                                    onBlur={(e) =>
                                        handleSettingsChanged(FilterType.StarRating, [srVal[0], Number(e.target.value)])
                                    }
                                    inputProps={{ min: 0, max: 15, step: 0.1 }}
                                    sx={{
                                        width: 52,
                                        "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                                        "& .MuiInputBase-input": { px: 0 },
                                    }}
                                />
                            </InputAdornment>
                        );

                        const srSingleEndAdornment = (
                            <InputAdornment
                                position="end"
                                sx={{
                                    flexDirection: "column",
                                    padding: "0 0.5rem",
                                    maxHeight: "unset",
                                    alignSelf: "stretch",
                                    height: 40,
                                    borderLeft: "1px solid",
                                    borderColor: "divider",
                                    ml: 0,
                                    overflow: "hidden",
                                    "& button": {
                                        py: 0,
                                        flex: 1,
                                        borderRadius: 0.5,
                                        minHeight: 0,
                                        minWidth: 0,
                                    },
                                }}
                            >
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const next = Math.min(15, Math.round((srVal[0] + 0.1) * 10) / 10);
                                        handlePreSettingsChanged(FilterType.StarRating, [next, next]);
                                        handleSettingsChanged(FilterType.StarRating, [next, next]);
                                    }}
                                    aria-label={__(I18nStrings.MAIN_PICKER_WEIGHT_INCREASE)}
                                >
                                    <KeyboardArrowUp sx={{ transform: "translateY(2px)" }} />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    onClick={() => {
                                        const next = Math.max(0, Math.round((srVal[0] - 0.1) * 10) / 10);
                                        handlePreSettingsChanged(FilterType.StarRating, [next, next]);
                                        handleSettingsChanged(FilterType.StarRating, [next, next]);
                                    }}
                                    aria-label={__(I18nStrings.MAIN_PICKER_WEIGHT_DECREASE)}
                                >
                                    <KeyboardArrowDown sx={{ transform: "translateY(-2px)" }} />
                                </IconButton>
                            </InputAdornment>
                        );

                        return (
                            <Stack
                                key={v}
                                direction="row"
                                spacing={1}
                                sx={{
                                    alignItems: "center",
                                }}
                            >
                                <FormControl size="small" sx={{ flexShrink: 0 }}>
                                    <InputLabel htmlFor="sr-min" shrink>
                                        {__(I18nStrings.MAIN_PICKER_FILTER_STAR_RATING)}
                                    </InputLabel>
                                    <OutlinedInput
                                        id="sr-min"
                                        size="small"
                                        label={__(I18nStrings.MAIN_PICKER_FILTER_STAR_RATING)}
                                        notched
                                        type="number"
                                        value={srVal[0]}
                                        onChange={(e) =>
                                            handlePreSettingsChanged(FilterType.StarRating, [
                                                Number(e.target.value),
                                                isRange ? srVal[1] : Number(e.target.value),
                                            ])
                                        }
                                        onBlur={(e) =>
                                            handleSettingsChanged(FilterType.StarRating, [
                                                Number(e.target.value),
                                                isRange ? srVal[1] : Number(e.target.value),
                                            ])
                                        }
                                        inputProps={{ min: 0, max: 15, step: 0.1 }}
                                        startAdornment={srStartAdornment}
                                        endAdornment={isRange ? srRangeEndAdornment : srSingleEndAdornment}
                                        sx={{ pr: 0 }}
                                    />
                                </FormControl>
                                <Slider
                                    value={isRange ? srVal : srVal[0]}
                                    valueLabelDisplay="auto"
                                    step={0.1}
                                    min={0}
                                    max={15}
                                    track={
                                        isRange
                                            ? "normal"
                                            : srMode === SubFilterType.Greater
                                              ? "inverted"
                                              : srMode === SubFilterType.Equal
                                                ? false
                                                : "normal"
                                    }
                                    sx={{ flex: 1, minWidth: 0, ml: "1rem !important" }}
                                    onChange={(_, val) => {
                                        if (isRange) {
                                            handlePreSettingsChanged(FilterType.StarRating, val as [number, number]);
                                        } else {
                                            const n = val as number;
                                            handlePreSettingsChanged(FilterType.StarRating, [n, n]);
                                        }
                                    }}
                                    onChangeCommitted={(_, val) => {
                                        if (isRange) {
                                            handleSettingsChanged(FilterType.StarRating, val as [number, number]);
                                        } else {
                                            const n = val as number;
                                            handleSettingsChanged(FilterType.StarRating, [n, n]);
                                        }
                                    }}
                                />
                            </Stack>
                        );
                    } else if (v === FilterType.Mode) {
                        return (
                            <FormControl key={v} size="small" fullWidth>
                                <InputLabel id="filter-mode">{__(I18nStrings.MAIN_PICKER_FILTER_MODE)}</InputLabel>
                                <Select
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_MODE)}
                                    labelId="filter-mode"
                                    value={settings?.[FilterType.Mode] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.Mode, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>{__(I18nStrings.MAIN_PICKER_FILTER_ALL)}</MenuItem>
                                    {Array.from(OsuModes.entries()).map(([key, label]) => (
                                        <MenuItem key={key} value={key}>
                                            {label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        );
                    } else if (v === FilterType.PlayerTags) {
                        return (
                            <Autocomplete
                                key={v}
                                multiple
                                freeSolo
                                fullWidth
                                size="small"
                                filterOptions={(x) => x}
                                options={tagOptions}
                                value={(settings?.[FilterType.PlayerTags] as string[]) ?? []}
                                onChange={(_, newValue) => {
                                    handleSettingsChanged(FilterType.PlayerTags, newValue);
                                }}
                                onInputChange={(_, value) => dbLoaded && searchTags(value)}
                                renderValue={(value, getItemProps) =>
                                    value.map((option, index) => {
                                        const { key, ...tagProps } = getItemProps({ index });
                                        return <Chip key={key} label={option} size="small" {...tagProps} />;
                                    })
                                }
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label={__(I18nStrings.MAIN_PICKER_FILTER_PLAYER_TAGS)}
                                        placeholder={
                                            dbLoaded
                                                ? __(I18nStrings.MAIN_PICKER_FILTER_PLAYER_TAGS_PLACEHOLDER)
                                                : __(I18nStrings.MAIN_PICKER_FILTER_PLAYER_TAGS_NO_DB)
                                        }
                                    />
                                )}
                            />
                        );
                    }
                    return null;
                })}
            </Stack>
        </Container>
    );

    if (inline) return content;

    return (
        <Drawer anchor={"top"} open={show} onClose={onClose}>
            {content}
        </Drawer>
    );
};
