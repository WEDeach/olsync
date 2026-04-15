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
import React, { useState } from "react";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { OsuModes } from "../../defines/types";

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

    const getSubSetting = (type: FilterType): SubFilterType => {
        return subSettings?.[type] ?? SubFilterType.Greater;
    };

    const handleSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...settings };
        let old = newSettings[type];

        if (type === FilterType.RankState || type === FilterType.Language || type === FilterType.Mode) {
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
                                label="Title"
                                variant="outlined"
                                value={settings?.[FilterType.Title] ?? ""}
                                onChange={(e) => handleSettingsChanged(FilterType.Title, e.target.value)}
                            />
                        );
                    } else if (v === FilterType.RankState) {
                        return (
                            <FormControl key={v} fullWidth>
                                <InputLabel id="rank-state">Rank State</InputLabel>
                                <Select
                                    label="Rank State"
                                    labelId="rank-state"
                                    value={settings?.[FilterType.RankState] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.RankState, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>All</MenuItem>
                                    <MenuItem value={RankedStatus.Graveyard}>Graveyard</MenuItem>
                                    <MenuItem value={RankedStatus.WIP}>WIP</MenuItem>
                                    <MenuItem value={RankedStatus.Pending}>Pending</MenuItem>
                                    <MenuItem value={RankedStatus.Ranked}>Ranked</MenuItem>
                                    <MenuItem value={RankedStatus.Approved}>Approved</MenuItem>
                                    <MenuItem value={RankedStatus.Qualified}>Qualified</MenuItem>
                                    <MenuItem value={RankedStatus.Loved}>Loved</MenuItem>
                                </Select>
                            </FormControl>
                        );
                    } else if (v === FilterType.PlayCount) {
                        return (
                            <FormControl key={v} fullWidth>
                                <InputLabel htmlFor="play-count">Play Count</InputLabel>
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
                                                            label={"play count"}
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
                                                                        render={<IconButton aria-label="Increase" />}
                                                                    >
                                                                        <KeyboardArrowUp
                                                                            sx={{ transform: "translateY(2px)" }}
                                                                        />
                                                                    </NumberField.Increment>

                                                                    <NumberField.Decrement
                                                                        render={<IconButton aria-label="Decrease" />}
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
                                <InputLabel id="filter-lang">Lang</InputLabel>
                                <Select
                                    label="Lang"
                                    labelId="filter-lang"
                                    value={settings?.[FilterType.Language] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.Language, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>All</MenuItem>
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
                                <InputLabel id="filter-mode">Mode</InputLabel>
                                <Select
                                    label="Mode"
                                    labelId="filter-mode"
                                    value={settings?.[FilterType.Mode] ?? ["all"]}
                                    onChange={(e) => handleSettingsChanged(FilterType.Mode, e.target.value)}
                                    multiple
                                >
                                    <MenuItem value={"all"}>All</MenuItem>
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
