import { NumberField } from "@base-ui/react/number-field";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import {
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
import { Observer } from "mobx-react";
import React, { useRef, useState } from "react";
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

type TSubFilterSetting = {
    [key in FilterType]?: SubFilterType;
};

interface IBeatmapFilterViewProps {
    show: boolean;
    inline?: boolean;
    allowedFilterTypes?: FilterType[];
    allowedLanguages?: TLanguage[];
    initialSettings?: TFilterSetting;
    onClose: () => void;
    onFilterChanged: (settings: TFilterSetting) => void;
    onSubFilterChanged: (settings: TFilterSetting) => void;
}

export const BeatmapFilterView: React.FC<IBeatmapFilterViewProps> = ({
    show,
    inline,
    allowedFilterTypes,
    allowedLanguages,
    initialSettings,
    onClose,
    onFilterChanged,
    onSubFilterChanged,
}) => {
    const [renderFields, _] = useState<FilterType[]>(
        allowedFilterTypes ?? [FilterType.Name, FilterType.Artist, FilterType.Title, FilterType.RankState],
    );
    const [settings, setSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [cacheSettings, setCacheSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [subSettings, setSubSettings] = useState<TSubFilterSetting>({});
    const [titleInputValue, setTitleInputValue] = useState(initialSettings?.[FilterType.Title] ?? "");
    const titleDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

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
                            <FormControl key={v} fullWidth>
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
                            <FormControl key={v} fullWidth>
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
                            <FormControl key={v} fullWidth>
                                <InputLabel htmlFor="play-count">
                                    {__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}
                                </InputLabel>
                                <NumberField.Root
                                    value={settings?.[FilterType.PlayCount] ?? 0}
                                    onValueChange={(value) => handleSettingsChanged(FilterType.PlayCount, value)}
                                    min={0}
                                    step={1}
                                >
                                    <NumberField.Group>
                                        <NumberField.Input
                                            id="play-count"
                                            render={(props, state) => (
                                                <Observer>
                                                    {() => (
                                                        <OutlinedInput
                                                            label={__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}
                                                            inputRef={props.ref}
                                                            value={state.inputValue}
                                                            onBlur={props.onBlur}
                                                            onChange={props.onChange}
                                                            onKeyUp={props.onKeyUp}
                                                            onKeyDown={props.onKeyDown}
                                                            onFocus={props.onFocus}
                                                            slotProps={{
                                                                input: props,
                                                            }}
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
                                                                            handleSubSettingsChanged(
                                                                                FilterType.PlayCount,
                                                                                e.target.value,
                                                                            )
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
                                                                        <MenuItem value={SubFilterType.Greater}>
                                                                            ≥
                                                                        </MenuItem>
                                                                        <MenuItem value={SubFilterType.Equal}>
                                                                            =
                                                                        </MenuItem>
                                                                        <MenuItem value={SubFilterType.Less}>
                                                                            ≤
                                                                        </MenuItem>
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
                                                                        borderLeft: "1px solid",
                                                                        borderColor: "divider",
                                                                        ml: 0,
                                                                        "& button": {
                                                                            py: 0,
                                                                            flex: 1,
                                                                            borderRadius: 0.5,
                                                                        },
                                                                    }}
                                                                >
                                                                    <NumberField.Increment
                                                                        render={
                                                                            <IconButton
                                                                                aria-label={__(
                                                                                    I18nStrings.MAIN_PICKER_WEIGHT_INCREASE,
                                                                                )}
                                                                            />
                                                                        }
                                                                    >
                                                                        <KeyboardArrowUp
                                                                            sx={{ transform: "translateY(2px)" }}
                                                                        />
                                                                    </NumberField.Increment>

                                                                    <NumberField.Decrement
                                                                        render={
                                                                            <IconButton
                                                                                aria-label={__(
                                                                                    I18nStrings.MAIN_PICKER_WEIGHT_DECREASE,
                                                                                )}
                                                                            />
                                                                        }
                                                                    >
                                                                        <KeyboardArrowDown
                                                                            sx={{ transform: "translateY(-2px)" }}
                                                                        />
                                                                    </NumberField.Decrement>
                                                                </InputAdornment>
                                                            }
                                                            sx={{ pr: 0 }}
                                                        />
                                                    )}
                                                </Observer>
                                            )}
                                        />
                                    </NumberField.Group>
                                </NumberField.Root>
                            </FormControl>
                        );
                    } else if (v === FilterType.Language) {
                        return (
                            <FormControl key={v} fullWidth>
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
                        return (
                            <Slider
                                key={v}
                                defaultValue={[0, 15]}
                                valueLabelDisplay="auto"
                                shiftStep={0.01}
                                step={0.1}
                                marks
                                min={0}
                                max={15}
                                value={cacheSettings?.[FilterType.StarRating] ?? [0, 15]}
                                onChange={(_, v) => handlePreSettingsChanged(FilterType.StarRating, v)}
                                onChangeCommitted={(_, v) => handleSettingsChanged(FilterType.StarRating, v)}
                            />
                        );
                    } else if (v === FilterType.Mode) {
                        return (
                            <FormControl key={v} fullWidth>
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
