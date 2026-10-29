import { ExpandMore, KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Autocomplete,
    Box,
    Chip,
    Drawer,
    FormControl,
    FormHelperText,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Select,
    Slider,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import React, { useCallback, useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { StableLocalBeatmapStatus } from "../../defines/stable_structs";
import { OsuModes } from "../../defines/types";
import {
    formatDrainSeconds,
    type NumericMode,
    type NumericRange,
    numericRangeOf,
    parseDrainInput,
} from "../../shared/utils/beatmapFilterRules";
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
    Creator,
    DifficultyName,
    RankedDate,
    ApproachRate,
    CircleSize,
    HpDrain,
    OverallDifficulty,
    SliderVelocity,
    StackLeniency,
    CircleCount,
    SliderCount,
    SpinnerCount,
    DrainTime,
    PlayedState,
    LastPlayed,
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

export type NumericFieldConfig = {
    label: I18nStrings;
    numeric: boolean;
    step: number;
    tolerance: number;
    parse: (text: string) => number | undefined;
    format: (value: number) => string;
    duration?: boolean;
};

const parseNumber = (text: string): number | undefined => {
    const trimmed = text.trim();
    const n = Number(trimmed);
    return trimmed !== "" && Number.isFinite(n) ? n : undefined;
};

const parseInteger = (text: string): number | undefined => {
    const trimmed = text.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
};

const fixed = (digits: number) => (value: number) => value.toFixed(digits);

const NUMERIC_FIELDS: Partial<Record<FilterType, NumericFieldConfig>> = {
    [FilterType.ApproachRate]: {
        label: I18nStrings.MAIN_PICKER_FILTER_AR_LABEL,
        numeric: true,
        step: 0.1,
        tolerance: 0.05,
        parse: parseNumber,
        format: fixed(1),
    },
    [FilterType.CircleSize]: {
        label: I18nStrings.MAIN_PICKER_FILTER_CS_LABEL,
        numeric: true,
        step: 0.1,
        tolerance: 0.05,
        parse: parseNumber,
        format: fixed(1),
    },
    [FilterType.HpDrain]: {
        label: I18nStrings.MAIN_PICKER_FILTER_HP_LABEL,
        numeric: true,
        step: 0.1,
        tolerance: 0.05,
        parse: parseNumber,
        format: fixed(1),
    },
    [FilterType.OverallDifficulty]: {
        label: I18nStrings.MAIN_PICKER_FILTER_OD_LABEL,
        numeric: true,
        step: 0.1,
        tolerance: 0.05,
        parse: parseNumber,
        format: fixed(1),
    },
    [FilterType.SliderVelocity]: {
        label: I18nStrings.MAIN_PICKER_RESULT_SV,
        numeric: true,
        step: 0.01,
        tolerance: 0.005,
        parse: parseNumber,
        format: fixed(2),
    },
    [FilterType.StackLeniency]: {
        label: I18nStrings.MAIN_PICKER_RESULT_STACK,
        numeric: true,
        step: 0.01,
        tolerance: 0.005,
        parse: parseNumber,
        format: fixed(2),
    },
    [FilterType.CircleCount]: {
        label: I18nStrings.MAIN_PICKER_RESULT_CIRCLES,
        numeric: true,
        step: 1,
        tolerance: 0,
        parse: parseInteger,
        format: String,
    },
    [FilterType.SliderCount]: {
        label: I18nStrings.MAIN_PICKER_RESULT_SLIDERS,
        numeric: true,
        step: 1,
        tolerance: 0,
        parse: parseInteger,
        format: String,
    },
    [FilterType.SpinnerCount]: {
        label: I18nStrings.MAIN_PICKER_RESULT_SPINNERS,
        numeric: true,
        step: 1,
        tolerance: 0,
        parse: parseInteger,
        format: String,
    },
    [FilterType.DrainTime]: {
        label: I18nStrings.MAIN_PICKER_FILTER_DRAIN_LABEL,
        numeric: false,
        step: 1,
        tolerance: 0,
        parse: parseDrainInput,
        format: formatDrainSeconds,
        duration: true,
    },
};

export const LAZER_UNSUPPORTED_FILTER_TYPES: FilterType[] = [
    FilterType.CircleCount,
    FilterType.SliderCount,
    FilterType.SpinnerCount,
    FilterType.StackLeniency,
    FilterType.DrainTime,
];

const numericModeOf = (op: SubFilterType | undefined): NumericMode => {
    if (op === SubFilterType.Less) return "less";
    if (op === SubFilterType.Equal) return "equal";
    return "greater";
};

export function numericConditionRange(
    type: FilterType,
    value: unknown,
    op: SubFilterType | undefined,
): NumericRange | undefined {
    const config = NUMERIC_FIELDS[type];
    if (!config || !isBeatmapFilterActive(type, value)) return undefined;
    return numericRangeOf(Number(value), numericModeOf(op), config.tolerance);
}

export function isBeatmapFilterActive(type: FilterType, value: unknown, op?: SubFilterType): boolean {
    if (value === undefined || value === null) return false;
    switch (type) {
        case FilterType.Title:
        case FilterType.Artist:
        case FilterType.Creator:
        case FilterType.DifficultyName:
        case FilterType.Source:
            return typeof value === "string" && value.trim() !== "";
        case FilterType.PlayerTags:
            return Array.isArray(value) && value.length > 0;
        case FilterType.RankState:
        case FilterType.RankStateLocal:
        case FilterType.Mode:
        case FilterType.Language:
            return Array.isArray(value) && value.some((v) => v !== "all");
        case FilterType.RankedDate:
        case FilterType.LastPlayed:
            return Array.isArray(value) && value.some((v) => typeof v === "string" && v !== "");
        case FilterType.StarRating: {
            if (!Array.isArray(value)) return false;
            if (op !== undefined) return true;
            const [min = 0, max = 15] = value as [number, number];
            return min !== 0 || max !== 15;
        }
        case FilterType.PlayCount:
            return typeof value === "number" && (value > 0 || (op !== undefined && op !== SubFilterType.Greater));
        case FilterType.PlayedState:
            return value === "played" || value === "unplayed";
        default:
            return NUMERIC_FIELDS[type] !== undefined && typeof value === "number" && Number.isFinite(value);
    }
}

export function hasActiveBeatmapFilter(filter: TFilterSetting, subFilter: TSubFilterSetting): boolean {
    return Object.entries(filter).some(([key, value]) => {
        const type = Number(key) as FilterType;
        return isBeatmapFilterActive(type, value, subFilter[type]);
    });
}

const dateRangeOf = (settings: TFilterSetting, type: FilterType) => {
    const [from = "", to = ""] = (settings?.[type] as string[] | undefined) ?? [];
    return { from, to, invalid: from !== "" && to !== "" && from > to };
};

const WIDE_FILTER_TYPES = new Set<FilterType>([
    FilterType.StarRating,
    FilterType.PlayerTags,
    FilterType.RankedDate,
    FilterType.LastPlayed,
]);

const FILTER_GROUPS: { key: string; label: I18nStrings; types: FilterType[] }[] = [
    {
        key: "search",
        label: I18nStrings.MAIN_PICKER_FILTER_GROUP_SEARCH,
        types: [
            FilterType.Title,
            FilterType.Artist,
            FilterType.Creator,
            FilterType.DifficultyName,
            FilterType.PlayerTags,
        ],
    },
    {
        key: "beatmap",
        label: I18nStrings.MAIN_PICKER_FILTER_GROUP_BEATMAP,
        types: [
            FilterType.StarRating,
            FilterType.Mode,
            FilterType.ApproachRate,
            FilterType.CircleSize,
            FilterType.HpDrain,
            FilterType.OverallDifficulty,
            FilterType.DrainTime,
            FilterType.SliderVelocity,
            FilterType.StackLeniency,
            FilterType.CircleCount,
            FilterType.SliderCount,
            FilterType.SpinnerCount,
            FilterType.Source,
        ],
    },
    {
        key: "rank",
        label: I18nStrings.MAIN_PICKER_FILTER_GROUP_RANK,
        types: [FilterType.RankStateLocal, FilterType.RankedDate],
    },
    {
        key: "play",
        label: I18nStrings.MAIN_PICKER_FILTER_GROUP_PLAY,
        types: [FilterType.PlayedState, FilterType.LastPlayed],
    },
];

interface IBeatmapFilterViewProps {
    show: boolean;
    inline?: boolean;
    grouped?: boolean;
    allowedFilterTypes?: FilterType[];
    disabledFilterTypes?: FilterType[];
    allowedLanguages?: TLanguage[];
    initialSettings?: TFilterSetting;
    initialSubFilter?: TSubFilterSetting;
    onClose: () => void;
    onFilterChanged: (settings: TFilterSetting) => void;
    onSubFilterChanged: (settings: TFilterSetting) => void;
    /**
     * Which data source resolves `FilterType.RankedDate`: the local online.db
     * (stable/default, e.g. the restorer) or lazer's own Realm `DateRanked`.
     */
    rankedDateSource?: "onlineDb" | "lazer";
    rankedDateQueryFailed?: boolean;
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
    const requestRef = useRef(0);

    const search = useCallback((query: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const request = ++requestRef.current;
        const trimmed = query.trim();
        const run = async () => {
            const results = await window.olsCore.searchOnlineTags(trimmed);
            if (request !== requestRef.current || !Array.isArray(results)) return;
            setOptions(results.map((t) => t.name));
        };
        if (trimmed) {
            debounceRef.current = setTimeout(run, 250);
        } else {
            void run();
        }
    }, []);

    return { options: deferredOptions, search };
};

const TEXT_FILTER_LABELS: Partial<Record<FilterType, I18nStrings>> = {
    [FilterType.Title]: I18nStrings.MAIN_PICKER_FILTER_TITLE_LABEL,
    [FilterType.Artist]: I18nStrings.MAIN_PICKER_FILTER_ARTIST_LABEL,
    [FilterType.Creator]: I18nStrings.MAIN_PICKER_FILTER_CREATOR_LABEL,
    [FilterType.DifficultyName]: I18nStrings.MAIN_PICKER_FILTER_DIFFICULTY_LABEL,
    [FilterType.Source]: I18nStrings.MAIN_PICKER_FILTER_SOURCE_LABEL,
};

const FilterTextField: React.FC<{ label: string; value: string; onCommit: (value: string) => void }> = ({
    label,
    value,
    onCommit,
}) => {
    const [input, setInput] = useState(value);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    // A pending timer must call the latest commit, not the render it was scheduled in.
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;
    // The value this field last emitted; distinguishes our own commit echoing
    // back from an external replacement of `value`.
    const lastEmittedRef = useRef<{ value: string } | null>(null);

    const cancelPending = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };

    useEffect(() => {
        const emitted = lastEmittedRef.current;
        if (emitted && emitted.value === value) return;
        lastEmittedRef.current = null;
        cancelPending();
        setInput(value);
    }, [value]);

    useEffect(() => cancelPending, []);

    return (
        <TextField
            label={label}
            variant="outlined"
            size="small"
            fullWidth
            value={input}
            onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                cancelPending();
                debounceRef.current = setTimeout(() => {
                    lastEmittedRef.current = { value: val };
                    onCommitRef.current(val);
                }, 300);
            }}
        />
    );
};

const FilterCountBadge: React.FC<{ count: number }> = ({ count }) => {
    const ref = useRef<HTMLDivElement>(null);
    const prevCount = useRef(count);
    useEffect(() => {
        const previous = prevCount.current;
        prevCount.current = count;
        if (count === 0 || count === previous || !ref.current) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        ref.current.animate(
            [
                { transform: "scale(0.85)", opacity: 0.6 },
                { transform: "scale(1)", opacity: 1 },
            ],
            { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
    }, [count]);
    if (count === 0) return null;
    return (
        <Chip
            ref={ref}
            size="small"
            color="primary"
            label={count}
            sx={{ height: 20, minWidth: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        />
    );
};

const FilterGroupAccordion: React.FC<{
    label: string;
    count: number;
    defaultExpanded: boolean;
    forceExpanded?: boolean;
    children: React.ReactNode;
}> = ({ label, count, defaultExpanded, forceExpanded = false, children }) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    useEffect(() => {
        if (forceExpanded) setExpanded(true);
    }, [forceExpanded]);
    return (
        <Accordion
            disableGutters
            elevation={0}
            expanded={forceExpanded || expanded}
            onChange={(_, next) => setExpanded(forceExpanded || next)}
            sx={{
                borderRadius: 1,
                borderStyle: "solid",
                borderWidth: 1,
                borderColor: "divider",
                borderLeftWidth: 3,
                borderLeftColor: count > 0 ? "primary.main" : "divider",
                transition: "border-color 200ms ease",
                "&::before": { display: "none" },
            }}
        >
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 44 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="subtitle2">{label}</Typography>
                    <FilterCountBadge count={count} />
                </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>{children}</AccordionDetails>
        </Accordion>
    );
};

interface IOperatorNumberFieldProps {
    label: string;
    value: number | undefined;
    op: SubFilterType;
    numeric: boolean;
    step: number;
    format: (value: number) => string;
    duration?: boolean;
    parse: (text: string) => number | undefined;
    disabled: boolean;
    disabledMessage: string;
    invalidMessage?: string;
    onValueChange: (value: number | undefined) => void;
    onOperatorChange: (op: SubFilterType) => void;
}

const OperatorNumberField: React.FC<IOperatorNumberFieldProps> = ({
    label,
    value,
    op,
    numeric,
    step,
    format,
    duration,
    parse,
    disabled,
    disabledMessage,
    invalidMessage,
    onValueChange,
    onOperatorChange,
}) => {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [input, setInput] = useState(value === undefined ? "" : format(value));
    const [editing, setEditing] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const onValueChangeRef = useRef(onValueChange);
    onValueChangeRef.current = onValueChange;
    const onOperatorChangeRef = useRef(onOperatorChange);
    onOperatorChangeRef.current = onOperatorChange;
    const parseRef = useRef(parse);
    parseRef.current = parse;
    const formatRef = useRef(format);
    formatRef.current = format;
    const lastEmittedRef = useRef<{ value: number | undefined } | null>(null);
    const parsed = parse(input);
    const invalid = input.trim() !== "" && parsed === undefined;
    const previewText = duration && editing && parsed !== undefined ? format(parsed) : undefined;
    const helper = disabled
        ? disabledMessage
        : invalid
          ? invalidMessage
          : previewText && previewText !== input
            ? `→ ${previewText}`
            : undefined;

    const cancelPending = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };

    const commit = (text: string) => {
        if (text.trim() === "") {
            lastEmittedRef.current = { value: undefined };
            onValueChangeRef.current(undefined);
        } else {
            const next = parseRef.current(text);
            if (next !== undefined) {
                lastEmittedRef.current = { value: next };
                onValueChangeRef.current(next);
            }
        }
    };

    useEffect(() => {
        const emitted = lastEmittedRef.current;
        if (emitted && emitted.value === value) return;
        lastEmittedRef.current = null;
        cancelPending();
        setInput(value === undefined ? "" : formatRef.current(value));
    }, [value]);

    useEffect(
        () => () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        },
        [],
    );

    return (
        <FormControl size="small" fullWidth disabled={disabled} error={invalid}>
            <InputLabel htmlFor={inputId}>{label}</InputLabel>
            <OutlinedInput
                id={inputId}
                inputRef={inputRef}
                label={label}
                type={numeric ? "number" : "text"}
                value={input}
                inputProps={{ step }}
                onFocus={() => {
                    setEditing(true);
                    if (duration && value !== undefined && input === format(value)) setInput(String(value));
                }}
                onBlur={() => {
                    setEditing(false);
                    cancelPending();
                    commit(input);
                    if (duration && parsed !== undefined) setInput(format(parsed));
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") inputRef.current?.blur();
                }}
                onChange={(e) => {
                    const val = e.target.value;
                    setInput(val);
                    cancelPending();
                    debounceRef.current = setTimeout(() => commit(val), 300);
                }}
                startAdornment={
                    <InputAdornment
                        position="start"
                        sx={{
                            borderRight: "1px solid",
                            borderColor: "divider",
                            maxHeight: "unset",
                            alignSelf: "stretch",
                            mr: 1,
                        }}
                    >
                        <Select
                            value={op}
                            disabled={disabled}
                            onChange={(e) => onOperatorChangeRef.current(Number(e.target.value))}
                            variant="standard"
                            disableUnderline
                            sx={{
                                minWidth: "3.5rem",
                                "& .MuiSelect-select": { py: 0, pr: "24px !important", fontSize: "0.85rem" },
                            }}
                        >
                            <MenuItem value={SubFilterType.Greater}>≥</MenuItem>
                            <MenuItem value={SubFilterType.Equal}>=</MenuItem>
                            <MenuItem value={SubFilterType.Less}>≤</MenuItem>
                        </Select>
                    </InputAdornment>
                }
            />
            {helper && <FormHelperText>{helper}</FormHelperText>}
        </FormControl>
    );
};

interface IDateRangeFieldProps {
    fromLabel: string;
    toLabel: string;
    from: string;
    to: string;
    invalid: boolean;
    onChange: (from: string, to: string) => void;
    footer?: React.ReactNode;
}

const DateRangeField: React.FC<IDateRangeFieldProps> = ({
    fromLabel,
    toLabel,
    from,
    to,
    invalid,
    onChange,
    footer,
}) => {
    return (
        <Stack spacing={0.5}>
            <Stack direction="row" spacing={1}>
                <TextField
                    type="date"
                    size="small"
                    fullWidth
                    label={fromLabel}
                    value={from}
                    error={invalid}
                    onChange={(e) => onChange(e.target.value, to)}
                    sx={{ "& input": { colorScheme: (theme) => theme.palette.mode } }}
                    slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: { max: to || undefined },
                    }}
                />
                <TextField
                    type="date"
                    size="small"
                    fullWidth
                    label={toLabel}
                    value={to}
                    error={invalid}
                    onChange={(e) => onChange(from, e.target.value)}
                    sx={{ "& input": { colorScheme: (theme) => theme.palette.mode } }}
                    slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: { min: from || undefined },
                    }}
                />
            </Stack>
            {footer}
        </Stack>
    );
};

export const BeatmapFilterView: React.FC<IBeatmapFilterViewProps> = ({
    show,
    inline,
    grouped = false,
    allowedFilterTypes,
    disabledFilterTypes = [],
    allowedLanguages,
    initialSettings,
    onClose,
    onFilterChanged,
    onSubFilterChanged,
    initialSubFilter,
    rankedDateSource = "onlineDb",
    rankedDateQueryFailed = false,
}) => {
    const [renderFields, _] = useState<FilterType[]>(
        allowedFilterTypes ?? [FilterType.Name, FilterType.Artist, FilterType.Title, FilterType.RankState],
    );
    const [settings, setSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [cacheSettings, setCacheSettings] = useState<TFilterSetting>(initialSettings ?? {});
    const [subSettings, setSubSettings] = useState<TSubFilterSetting>(initialSubFilter ?? {});
    const settingsRef = useRef(settings);
    const cacheSettingsRef = useRef(cacheSettings);
    const subSettingsRef = useRef(subSettings);
    const dbLoaded = useOnlineDbStatus();
    const rankedDateNeedsDb =
        rankedDateSource === "onlineDb" &&
        renderFields.includes(FilterType.RankedDate) &&
        !disabledFilterTypes.includes(FilterType.RankedDate);
    const rankedDateFailed =
        rankedDateQueryFailed && rankedDateSource === "onlineDb" && renderFields.includes(FilterType.RankedDate);
    const { options: tagOptions, search: searchTags } = useTagSearch();

    useEffect(() => {
        if (dbLoaded && renderFields.includes(FilterType.PlayerTags)) searchTags("");
    }, [dbLoaded, renderFields, searchTags]);

    const getSubSetting = (type: FilterType): SubFilterType => {
        return subSettings?.[type] ?? SubFilterType.Greater;
    };

    const handleSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...settingsRef.current };
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
        settingsRef.current = newSettings;
        setSettings(newSettings);

        // TDOD: save settings and notify main view
        onFilterChanged(newSettings);
    };

    const handlePreSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...cacheSettingsRef.current };
        newSettings[type] = value;
        cacheSettingsRef.current = newSettings;
        setCacheSettings(newSettings);
    };

    const handleSubSettingsChanged = (type: FilterType, value: any) => {
        const newSettings = { ...subSettingsRef.current };
        newSettings[type] = value;
        subSettingsRef.current = newSettings;
        setSubSettings(newSettings);

        onSubFilterChanged(newSettings);
    };

    const renderField = (v: FilterType): React.ReactNode => {
        const textLabel = TEXT_FILTER_LABELS[v];
        if (textLabel !== undefined) {
            return (
                <FilterTextField
                    key={v}
                    label={__(textLabel)}
                    value={settings?.[v] ?? ""}
                    onCommit={(val) => handleSettingsChanged(v, val)}
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
                        <MenuItem value={RankedStatus.WIP}>{__(I18nStrings.MAIN_PICKER_FILTER_WIP)}</MenuItem>
                        <MenuItem value={RankedStatus.Pending}>{__(I18nStrings.MAIN_PICKER_FILTER_PENDING)}</MenuItem>
                        <MenuItem value={RankedStatus.Ranked}>{__(I18nStrings.MAIN_PICKER_FILTER_RANKED)}</MenuItem>
                        <MenuItem value={RankedStatus.Approved}>{__(I18nStrings.MAIN_PICKER_FILTER_APPROVED)}</MenuItem>
                        <MenuItem value={RankedStatus.Qualified}>
                            {__(I18nStrings.MAIN_PICKER_FILTER_QUALIFIED)}
                        </MenuItem>
                        <MenuItem value={RankedStatus.Loved}>{__(I18nStrings.MAIN_PICKER_FILTER_LOVED)}</MenuItem>
                    </Select>
                </FormControl>
            );
        } else if (v === FilterType.RankStateLocal) {
            return (
                <FormControl key={v} size="small" fullWidth>
                    <InputLabel id="rank-state-local">{__(I18nStrings.MAIN_PICKER_FILTER_RANK_STATE_LOCAL)}</InputLabel>
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
                    <InputLabel htmlFor="play-count">{__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}</InputLabel>
                    <OutlinedInput
                        id="play-count"
                        size="small"
                        label={__(I18nStrings.MAIN_PICKER_FILTER_PLAY_COUNT)}
                        type="number"
                        value={cacheSettings?.[FilterType.PlayCount] ?? 0}
                        inputProps={{ min: 0, step: 1 }}
                        onChange={(e) => handlePreSettingsChanged(FilterType.PlayCount, Number(e.target.value))}
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
                                    onChange={(e) => handleSubSettingsChanged(FilterType.PlayCount, e.target.value)}
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
                            handlePreSettingsChanged(FilterType.StarRating, [srVal[0], Number(e.target.value)])
                        }
                        onBlur={(e) => handleSettingsChanged(FilterType.StarRating, [srVal[0], Number(e.target.value)])}
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
        } else if (v === FilterType.RankedDate) {
            const { from, to, invalid } = dateRangeOf(settings, v);
            const hasError = invalid || rankedDateFailed;
            return (
                <Box
                    key={v}
                    sx={
                        rankedDateFailed
                            ? { border: "1px solid", borderColor: "error.main", borderRadius: 1, p: 1 }
                            : undefined
                    }
                >
                    <DateRangeField
                        fromLabel={__(I18nStrings.MAIN_PICKER_FILTER_RANKED_DATE_FROM)}
                        toLabel={__(I18nStrings.MAIN_PICKER_FILTER_RANKED_DATE_TO)}
                        from={from}
                        to={to}
                        invalid={hasError}
                        onChange={(nextFrom, nextTo) => handleSettingsChanged(v, [nextFrom, nextTo])}
                        footer={
                            hasError || (rankedDateNeedsDb && !dbLoaded) ? (
                                <Typography variant="caption" color={hasError ? "error" : "text.secondary"}>
                                    {rankedDateFailed
                                        ? __(I18nStrings.MAIN_PICKER_RANKED_DATE_QUERY_ERROR_TITLE)
                                        : invalid
                                          ? __(I18nStrings.MAIN_PICKER_FILTER_RANKED_DATE_INVALID)
                                          : __(I18nStrings.MAIN_PICKER_FILTER_RANKED_DATE_NO_DB)}
                                </Typography>
                            ) : undefined
                        }
                    />
                </Box>
            );
        } else if (v === FilterType.PlayerTags) {
            return (
                <Autocomplete
                    key={v}
                    multiple
                    freeSolo
                    fullWidth
                    size="small"
                    openOnFocus
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
        const numeric = NUMERIC_FIELDS[v];
        if (numeric) {
            return (
                <OperatorNumberField
                    key={v}
                    label={__(numeric.label)}
                    value={settings?.[v]}
                    op={getSubSetting(v)}
                    numeric={numeric.numeric}
                    step={numeric.step}
                    format={numeric.format}
                    duration={numeric.duration}
                    parse={numeric.parse}
                    disabled={disabledFilterTypes.includes(v)}
                    disabledMessage={__(I18nStrings.MAIN_PICKER_FILTER_LAZER_UNSUPPORTED_FIELD)}
                    invalidMessage={__(I18nStrings.MAIN_PICKER_FILTER_NUMBER_INVALID)}
                    onValueChange={(next) => handleSettingsChanged(v, next)}
                    onOperatorChange={(next) => handleSubSettingsChanged(v, next)}
                />
            );
        }
        if (v === FilterType.PlayedState) {
            return (
                <FormControl key={v} size="small" fullWidth>
                    <InputLabel id="filter-played-state">{__(I18nStrings.MAIN_PICKER_FILTER_PLAYED_STATE)}</InputLabel>
                    <Select
                        label={__(I18nStrings.MAIN_PICKER_FILTER_PLAYED_STATE)}
                        labelId="filter-played-state"
                        value={settings?.[FilterType.PlayedState] ?? "any"}
                        onChange={(e) =>
                            handleSettingsChanged(
                                FilterType.PlayedState,
                                e.target.value === "any" ? undefined : e.target.value,
                            )
                        }
                    >
                        <MenuItem value="any">{__(I18nStrings.MAIN_PICKER_FILTER_PLAYED_ANY)}</MenuItem>
                        <MenuItem value="unplayed">{__(I18nStrings.MAIN_PICKER_FILTER_PLAYED_UNPLAYED)}</MenuItem>
                        <MenuItem value="played">{__(I18nStrings.MAIN_PICKER_FILTER_PLAYED_PLAYED)}</MenuItem>
                    </Select>
                </FormControl>
            );
        }
        if (v === FilterType.LastPlayed) {
            const { from, to, invalid } = dateRangeOf(settings, v);
            return (
                <DateRangeField
                    key={v}
                    fromLabel={__(I18nStrings.MAIN_PICKER_FILTER_LAST_PLAYED_FROM)}
                    toLabel={__(I18nStrings.MAIN_PICKER_FILTER_LAST_PLAYED_TO)}
                    from={from}
                    to={to}
                    invalid={invalid}
                    onChange={(nextFrom, nextTo) => handleSettingsChanged(v, [nextFrom, nextTo])}
                    footer={
                        invalid ? (
                            <Typography variant="caption" color="error">
                                {__(I18nStrings.MAIN_PICKER_FILTER_LAST_PLAYED_INVALID)}
                            </Typography>
                        ) : undefined
                    }
                />
            );
        }
        return null;
    };

    const groupedContent = (
        <Stack spacing={1}>
            {disabledFilterTypes.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                    {__(I18nStrings.MAIN_PICKER_FILTER_LAZER_UNSUPPORTED)}
                </Typography>
            )}
            {FILTER_GROUPS.map((group) => {
                const types = group.types.filter((t) => renderFields.includes(t));
                if (types.length === 0) return null;
                const count = types.filter(
                    (t) => !disabledFilterTypes.includes(t) && isBeatmapFilterActive(t, settings?.[t], subSettings[t]),
                ).length;
                return (
                    <FilterGroupAccordion
                        key={group.key}
                        label={__(group.label)}
                        count={count}
                        defaultExpanded={count > 0}
                        forceExpanded={rankedDateFailed && types.includes(FilterType.RankedDate)}
                    >
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2 }}>
                            {types.map((t) => (
                                <Box
                                    key={t}
                                    sx={{ minWidth: 0, gridColumn: WIDE_FILTER_TYPES.has(t) ? "1 / -1" : undefined }}
                                >
                                    {renderField(t)}
                                </Box>
                            ))}
                        </Box>
                    </FilterGroupAccordion>
                );
            })}
        </Stack>
    );

    const content = grouped ? groupedContent : <Stack spacing={2}>{renderFields.map(renderField)}</Stack>;

    if (inline) return content;

    return (
        <Drawer anchor={"top"} open={show} onClose={onClose}>
            <Box sx={{ p: 1, width: "100%", maxWidth: 1200, mx: "auto" }}>{content}</Box>
        </Drawer>
    );
};
