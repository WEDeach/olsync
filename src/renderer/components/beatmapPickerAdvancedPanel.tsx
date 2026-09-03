import { Add, Block, Check, ContentCopy, Delete, Edit } from "@mui/icons-material";
import {
    Autocomplete,
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import { IOsuCollection } from "../../defines/types";
import __ from "../../utils/i18n";
import { formatDateTime, formatTimeAgo, useNowAdaptive } from "../../utils/time";
import { I18nStrings } from "../../utils/typed/i18n";
import {
    BeatmapDataField,
    BoolCondition,
    DateCondition,
    HistoryCondition,
    IPickerAdvancedSettings,
    IPickerHistory,
    IWeightBeatmapCondition,
    IWeightEntry,
    IWeightHistoryCondition,
    IWeightScoreCondition,
    IWishlistConditionItem,
    IWishlistEntry,
    NumberCondition,
    PickerTargetType,
    ScoreRecordField,
    StringCondition,
} from "./beatmapPickerTypes";
import { DataViewer } from "./dataViewer";
import { IPropertyWithName } from "./table";

type FieldKind = "string" | "number" | "boolean" | "date";

const normalizeHistoryFields = (item: IPickerHistory) => {
    if (item.songTitle && item.difficultyName && item.artist) {
        return {
            artist: item.artist,
            songTitle: item.songTitle,
            difficultyName: item.difficultyName,
            creatorName: item.creatorName ?? "",
        };
    }
    const match = item.title.match(/^(.+) - (.+) \[(.+)\]$/);
    return {
        artist: match?.[1] ?? "",
        songTitle: match?.[2] ?? item.title,
        difficultyName: match?.[3] ?? "",
        creatorName: item.creatorName ?? "",
    };
};

const getHistoryTableHeads = (): IPropertyWithName[] => [
    { name: __(I18nStrings.MAIN_PICKER_HISTORY_TABLE_SONG), type: "string", key: "songTitle" },
    { name: __(I18nStrings.MAIN_PICKER_HISTORY_TABLE_DIFFICULTY), type: "string", key: "difficultyName" },
    { name: __(I18nStrings.MAIN_PICKER_HISTORY_TABLE_ARTIST), type: "string", key: "artist" },
    { name: __(I18nStrings.MAIN_PICKER_HISTORY_TABLE_CREATOR), type: "string", key: "creatorName" },
    { name: "ID", type: "string", key: "beatmapId" },
    {
        name: __(I18nStrings.MAIN_PICKER_HISTORY_TABLE_PICKED_AT),
        type: "string",
        key: "pickedAt",
        render: (row: any) => (
            <Tooltip title={row.pickedAt ? formatDateTime(row.pickedAt) : null} arrow>
                <span>{row.pickedAt ? formatTimeAgo(row.pickedAt) : "-"}</span>
            </Tooltip>
        ),
    },
];

const BEATMAP_FIELD_KIND: Record<BeatmapDataField, FieldKind> = {
    [BeatmapDataField.Id]: "number",
    [BeatmapDataField.SetId]: "number",
    [BeatmapDataField.Artist]: "string",
    [BeatmapDataField.Title]: "string",
    [BeatmapDataField.Creator]: "string",
    [BeatmapDataField.RankedStatus]: "number",
    [BeatmapDataField.DrainSeconds]: "number",
    [BeatmapDataField.Tags]: "string",
    [BeatmapDataField.Unplayed]: "boolean",
    [BeatmapDataField.LastPlayedTime]: "date",
    [BeatmapDataField.AR]: "number",
    [BeatmapDataField.CS]: "number",
    [BeatmapDataField.HP]: "number",
    [BeatmapDataField.OD]: "number",
    [BeatmapDataField.Stack]: "number",
    [BeatmapDataField.SV]: "number",
    [BeatmapDataField.PlayerTags]: "string",
};

const SCORE_FIELD_KIND: Record<ScoreRecordField, FieldKind> = {
    [ScoreRecordField.UserName]: "string",
    [ScoreRecordField.Count300]: "number",
    [ScoreRecordField.Count100]: "number",
    [ScoreRecordField.Count50]: "number",
    [ScoreRecordField.CountGeki]: "number",
    [ScoreRecordField.CountKatu]: "number",
    [ScoreRecordField.CountMiss]: "number",
    [ScoreRecordField.MaxCombo]: "number",
    [ScoreRecordField.Perfect]: "boolean",
    [ScoreRecordField.Date]: "date",
};

const BEATMAP_FIELD_I18N: Record<BeatmapDataField, I18nStrings> = {
    [BeatmapDataField.Id]: I18nStrings.MAIN_PICKER_WEIGHT_BM_ID,
    [BeatmapDataField.SetId]: I18nStrings.MAIN_PICKER_WEIGHT_BM_SET_ID,
    [BeatmapDataField.Artist]: I18nStrings.MAIN_PICKER_WEIGHT_BM_ARTIST,
    [BeatmapDataField.Title]: I18nStrings.MAIN_PICKER_WEIGHT_BM_TITLE,
    [BeatmapDataField.Creator]: I18nStrings.MAIN_PICKER_WEIGHT_BM_CREATOR,
    [BeatmapDataField.RankedStatus]: I18nStrings.MAIN_PICKER_WEIGHT_BM_RANKED,
    [BeatmapDataField.DrainSeconds]: I18nStrings.MAIN_PICKER_WEIGHT_BM_DRAIN,
    [BeatmapDataField.Tags]: I18nStrings.MAIN_PICKER_WEIGHT_BM_TAGS,
    [BeatmapDataField.Unplayed]: I18nStrings.MAIN_PICKER_WEIGHT_BM_UNPLAYED,
    [BeatmapDataField.LastPlayedTime]: I18nStrings.MAIN_PICKER_WEIGHT_BM_LAST_PLAYED,
    [BeatmapDataField.AR]: I18nStrings.MAIN_PICKER_WEIGHT_BM_AR,
    [BeatmapDataField.CS]: I18nStrings.MAIN_PICKER_WEIGHT_BM_CS,
    [BeatmapDataField.HP]: I18nStrings.MAIN_PICKER_WEIGHT_BM_HP,
    [BeatmapDataField.OD]: I18nStrings.MAIN_PICKER_WEIGHT_BM_OD,
    [BeatmapDataField.Stack]: I18nStrings.MAIN_PICKER_WEIGHT_BM_STACK,
    [BeatmapDataField.SV]: I18nStrings.MAIN_PICKER_WEIGHT_BM_SV,
    [BeatmapDataField.PlayerTags]: I18nStrings.MAIN_PICKER_WEIGHT_BM_PLAYER_TAGS,
};

const SCORE_FIELD_I18N: Record<ScoreRecordField, I18nStrings> = {
    [ScoreRecordField.UserName]: I18nStrings.MAIN_PICKER_WEIGHT_SC_USER,
    [ScoreRecordField.Count300]: I18nStrings.MAIN_PICKER_WEIGHT_SC_300,
    [ScoreRecordField.Count100]: I18nStrings.MAIN_PICKER_WEIGHT_SC_100,
    [ScoreRecordField.Count50]: I18nStrings.MAIN_PICKER_WEIGHT_SC_50,
    [ScoreRecordField.CountGeki]: I18nStrings.MAIN_PICKER_WEIGHT_SC_GEKI,
    [ScoreRecordField.CountKatu]: I18nStrings.MAIN_PICKER_WEIGHT_SC_KATU,
    [ScoreRecordField.CountMiss]: I18nStrings.MAIN_PICKER_WEIGHT_SC_MISS,
    [ScoreRecordField.MaxCombo]: I18nStrings.MAIN_PICKER_WEIGHT_SC_COMBO,
    [ScoreRecordField.Perfect]: I18nStrings.MAIN_PICKER_WEIGHT_SC_PERFECT,
    [ScoreRecordField.Date]: I18nStrings.MAIN_PICKER_WEIGHT_SC_DATE,
};

const STR_OP_I18N: Record<StringCondition, I18nStrings> = {
    [StringCondition.Equals]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_EQ,
    [StringCondition.Contains]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_CONTAINS,
    [StringCondition.NotContains]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_NOT_CONTAINS,
};

const PLAYER_TAGS_OP_I18N: Record<StringCondition, I18nStrings> = {
    [StringCondition.Equals]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_PLAYER_TAGS_EQ,
    [StringCondition.Contains]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_CONTAINS_ANY,
    [StringCondition.NotContains]: I18nStrings.MAIN_PICKER_WEIGHT_OP_STR_NOT_CONTAINS_ANY,
};

const NUM_OP_I18N: Record<NumberCondition, I18nStrings> = {
    [NumberCondition.Equals]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_EQ,
    [NumberCondition.Greater]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_GT,
    [NumberCondition.Less]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_LT,
    [NumberCondition.GreaterOrEqual]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_GTE,
    [NumberCondition.LessOrEqual]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_LTE,
    [NumberCondition.NotEquals]: I18nStrings.MAIN_PICKER_WEIGHT_OP_NUM_NEQ,
};

const getFieldKind = (type: PickerTargetType, field: string): FieldKind => {
    if (type === PickerTargetType.BeatmapData) return BEATMAP_FIELD_KIND[field as BeatmapDataField] ?? "string";
    if (type === PickerTargetType.ScoreRecord) return SCORE_FIELD_KIND[field as ScoreRecordField] ?? "string";
    return "string";
};

const getDefaultOp = (kind: FieldKind): string => {
    if (kind === "number") return NumberCondition.Equals;
    if (kind === "boolean") return BoolCondition.IsTrue;
    if (kind === "date") return DateCondition.After;
    return StringCondition.Contains;
};

interface WeightDraft {
    type: PickerTargetType;
    id: string;
    weight: number;
    enabled: boolean;
    field: string;
    operator: string;
    value: string;
}

const initDraft = (): WeightDraft => ({
    type: PickerTargetType.Map,
    id: "",
    weight: 1,
    enabled: true,
    field: BeatmapDataField.Artist,
    operator: StringCondition.Contains,
    value: "",
});

const draftFromEntry = (entry: IWeightEntry): WeightDraft => {
    const base = { enabled: entry.enabled !== false };
    if (entry.type === PickerTargetType.BeatmapData && entry.beatmapCondition) {
        return {
            ...base,
            type: entry.type,
            id: "",
            weight: entry.weight,
            field: entry.beatmapCondition.field,
            operator: entry.beatmapCondition.operator,
            value: entry.beatmapCondition.value,
        };
    }
    if (entry.type === PickerTargetType.ScoreRecord && entry.scoreCondition) {
        return {
            ...base,
            type: entry.type,
            id: "",
            weight: entry.weight,
            field: entry.scoreCondition.field,
            operator: entry.scoreCondition.operator,
            value: entry.scoreCondition.value,
        };
    }
    if (entry.type === PickerTargetType.History && entry.historyCondition) {
        return {
            ...base,
            type: entry.type,
            id: "",
            weight: entry.weight,
            field: "",
            operator: entry.historyCondition.operator,
            value: entry.historyCondition.value,
        };
    }
    return {
        ...base,
        type: entry.type,
        id: entry.id,
        weight: entry.weight,
        field: BeatmapDataField.Artist,
        operator: StringCondition.Contains,
        value: "",
    };
};

const draftToEntry = (draft: WeightDraft): IWeightEntry => {
    const enabled = draft.enabled;
    if (draft.type === PickerTargetType.BeatmapData) {
        return {
            type: draft.type,
            id: "",
            weight: draft.weight,
            enabled,
            beatmapCondition: {
                field: draft.field as BeatmapDataField,
                operator: draft.operator,
                value: draft.value,
            } as IWeightBeatmapCondition,
        };
    }
    if (draft.type === PickerTargetType.ScoreRecord) {
        return {
            type: draft.type,
            id: "",
            weight: draft.weight,
            enabled,
            scoreCondition: {
                field: draft.field as ScoreRecordField,
                operator: draft.operator,
                value: draft.value,
            } as IWeightScoreCondition,
        };
    }
    if (draft.type === PickerTargetType.History) {
        return {
            type: draft.type,
            id: "",
            weight: draft.weight,
            enabled,
            historyCondition: {
                operator: draft.operator as HistoryCondition,
                value: draft.value,
            } as IWeightHistoryCondition,
        };
    }
    return { type: draft.type, id: draft.id.trim(), weight: draft.weight, enabled };
};

const isValidDraft = (draft: WeightDraft): boolean => {
    if (draft.type === PickerTargetType.BeatmapData || draft.type === PickerTargetType.ScoreRecord) {
        const kind = getFieldKind(draft.type, draft.field);
        if (kind === "boolean") return true;
        if (kind === "date") {
            const op = draft.operator as DateCondition;
            if (op === DateCondition.Before || op === DateCondition.After) return draft.value.trim() !== "";
            if (op === DateCondition.Between) {
                const [from, to] = draft.value.split("~");
                return !!from?.trim() && !!to?.trim();
            }
            if (op === DateCondition.WithinSecs) return (parseInt(draft.value, 10) || 0) > 0;
            return false;
        }
        return draft.value.trim() !== "";
    }
    if (draft.type === PickerTargetType.History) {
        const op = draft.operator as HistoryCondition;
        if (op === HistoryCondition.WithinLast || op === HistoryCondition.NotWithinLast) {
            return (parseInt(draft.value, 10) || 0) > 0;
        }
        return true;
    }
    return draft.id.trim() !== "";
};

const serializeWeightEntry = (w: IWeightEntry): string =>
    JSON.stringify({
        type: w.type,
        id: w.id,
        beatmapCondition: w.beatmapCondition,
        scoreCondition: w.scoreCondition,
        historyCondition: w.historyCondition,
    });

const serializeWishlistEntry = (e: IWishlistEntry): string =>
    JSON.stringify({
        conditions: e.conditions.map((c) => ({
            type: c.type,
            id: c.id,
            beatmapCondition: c.beatmapCondition,
            scoreCondition: c.scoreCondition,
            historyCondition: c.historyCondition,
        })),
    });

const getEntryCondDesc = (w: IWeightEntry): string => {
    if (w.type === PickerTargetType.BeatmapData && w.beatmapCondition) {
        const { field, operator, value } = w.beatmapCondition;
        const kind = BEATMAP_FIELD_KIND[field] ?? "string";
        const fieldLabel = __(BEATMAP_FIELD_I18N[field]);
        if (kind === "boolean") {
            const boolLabel =
                operator === BoolCondition.IsTrue
                    ? __(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_TRUE)
                    : __(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_FALSE);
            return `${fieldLabel}: ${boolLabel}`;
        }
        if (kind === "date") {
            if (operator === DateCondition.Before)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BEFORE)} ${value}`;
            if (operator === DateCondition.After)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_AFTER)} ${value}`;
            if (operator === DateCondition.Between) {
                const [f, t] = value.split("~");
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BETWEEN)} ${f}~${t}`;
            }
            if (operator === DateCondition.WithinSecs)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_WITHIN)} ${value}s`;
        }
        const opLabel =
            kind === "number"
                ? __(NUM_OP_I18N[operator as NumberCondition])
                : __(
                      (field === BeatmapDataField.PlayerTags ? PLAYER_TAGS_OP_I18N : STR_OP_I18N)[
                          operator as StringCondition
                      ],
                  );
        return `${fieldLabel} ${opLabel} "${value}"`;
    }
    if (w.type === PickerTargetType.ScoreRecord && w.scoreCondition) {
        const { field, operator, value } = w.scoreCondition;
        const kind = SCORE_FIELD_KIND[field] ?? "string";
        const fieldLabel = __(SCORE_FIELD_I18N[field]);
        if (kind === "boolean") {
            const boolLabel =
                operator === BoolCondition.IsTrue
                    ? __(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_TRUE)
                    : __(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_FALSE);
            return `${fieldLabel}: ${boolLabel}`;
        }
        if (kind === "date") {
            if (operator === DateCondition.Before)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BEFORE)} ${value}`;
            if (operator === DateCondition.After)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_AFTER)} ${value}`;
            if (operator === DateCondition.Between) {
                const [f, t] = value.split("~");
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BETWEEN)} ${f}~${t}`;
            }
            if (operator === DateCondition.WithinSecs)
                return `${fieldLabel} ${__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_WITHIN)} ${value}s`;
        }
        const opLabel =
            kind === "number"
                ? __(NUM_OP_I18N[operator as NumberCondition])
                : __(STR_OP_I18N[operator as StringCondition]);
        return `${fieldLabel} ${opLabel} "${value}"`;
    }
    if (w.type === PickerTargetType.History && w.historyCondition) {
        const { operator, value } = w.historyCondition;
        if (operator === HistoryCondition.Appeared) return __(I18nStrings.MAIN_PICKER_WEIGHT_HIST_APPEARED);
        if (operator === HistoryCondition.NotAppeared) return __(I18nStrings.MAIN_PICKER_WEIGHT_HIST_NOT_APPEARED);
        if (operator === HistoryCondition.WithinLast)
            return `${__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_WITHIN_LAST)} (${value})`;
        if (operator === HistoryCondition.NotWithinLast)
            return `${__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_NOT_WITHIN_LAST)} (${value})`;
    }
    return w.id;
};

const DateConditionEditor: React.FC<{
    operator: string;
    value: string;
    onChange: (op: string, val: string) => void;
}> = ({ operator, value, onChange }) => {
    const mode = (operator as DateCondition) || DateCondition.After;
    const secs = parseInt(value, 10) || 0;
    const years = Math.floor(secs / 31536000);
    const months = Math.floor((secs % 31536000) / 2592000);
    const days = Math.floor((secs % 2592000) / 86400);
    const buildSecs = (y: number, m: number, d: number) => String(y * 31536000 + m * 2592000 + d * 86400);
    const [from, to] = mode === DateCondition.Between ? value.split("~") : ["", ""];

    return (
        <Stack spacing={2} sx={{ flexGrow: 1 }}>
            <FormControl size="small">
                <InputLabel>{__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}</InputLabel>
                <Select
                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}
                    value={mode}
                    onChange={(e) => onChange(e.target.value, "")}
                >
                    <MenuItem value={DateCondition.Before}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BEFORE)}
                    </MenuItem>
                    <MenuItem value={DateCondition.After}>{__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_AFTER)}</MenuItem>
                    <MenuItem value={DateCondition.Between}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BETWEEN)}
                    </MenuItem>
                    <MenuItem value={DateCondition.WithinSecs}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_WITHIN)}
                    </MenuItem>
                </Select>
            </FormControl>
            {(mode === DateCondition.Before || mode === DateCondition.After) && (
                <TextField
                    size="small"
                    type="date"
                    value={value}
                    onChange={(e) => onChange(mode, e.target.value)}
                    slotProps={{ htmlInput: { style: { colorScheme: "dark" } } }}
                />
            )}
            {mode === DateCondition.Between && (
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                    }}
                >
                    <TextField
                        size="small"
                        type="date"
                        sx={{ flex: 1 }}
                        value={from ?? ""}
                        onChange={(e) => onChange(mode, `${e.target.value}~${to ?? ""}`)}
                        slotProps={{ htmlInput: { style: { colorScheme: "dark" } } }}
                    />
                    <Typography variant="caption" sx={{ flexShrink: 0 }}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_DATE_TO)}
                    </Typography>
                    <TextField
                        size="small"
                        type="date"
                        sx={{ flex: 1 }}
                        value={to ?? ""}
                        onChange={(e) => onChange(mode, `${from ?? ""}~${e.target.value}`)}
                        slotProps={{ htmlInput: { style: { colorScheme: "dark" } } }}
                    />
                </Stack>
            )}
            {mode === DateCondition.WithinSecs && (
                <Stack direction="row" spacing={1}>
                    <TextField
                        size="small"
                        type="number"
                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_DATE_YEARS)}
                        sx={{ flex: 1, minWidth: 52 }}
                        value={years}
                        onChange={(e) =>
                            onChange(mode, buildSecs(Math.max(0, parseInt(e.target.value, 10) || 0), months, days))
                        }
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                    <TextField
                        size="small"
                        type="number"
                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_DATE_MONTHS)}
                        sx={{ flex: 1, minWidth: 52 }}
                        value={months}
                        onChange={(e) =>
                            onChange(mode, buildSecs(years, Math.max(0, parseInt(e.target.value, 10) || 0), days))
                        }
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                    <TextField
                        size="small"
                        type="number"
                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_DATE_DAYS)}
                        sx={{ flex: 1, minWidth: 52 }}
                        value={days}
                        onChange={(e) =>
                            onChange(mode, buildSecs(years, months, Math.max(0, parseInt(e.target.value, 10) || 0)))
                        }
                        slotProps={{ htmlInput: { min: 0 } }}
                    />
                </Stack>
            )}
        </Stack>
    );
};

const HistoryConditionEditor: React.FC<{
    operator: string;
    value: string;
    hideWeight?: boolean;
    weight: number;
    onChange: (op: string, val: string, weight: number) => void;
}> = ({ operator, value, hideWeight, weight, onChange }) => {
    const op = (operator as HistoryCondition) || HistoryCondition.Appeared;
    const needsN = op === HistoryCondition.WithinLast || op === HistoryCondition.NotWithinLast;
    return (
        <Stack
            direction="row"
            spacing={1}
            sx={{
                alignItems: "flex-start",
                flexGrow: 1,
                minWidth: 0,
            }}
        >
            <FormControl size="small" sx={{ flexGrow: 1, minWidth: 160 }}>
                <InputLabel>{__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}</InputLabel>
                <Select
                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}
                    value={op}
                    onChange={(e) => onChange(e.target.value, "", weight)}
                >
                    <MenuItem value={HistoryCondition.Appeared}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_APPEARED)}
                    </MenuItem>
                    <MenuItem value={HistoryCondition.NotAppeared}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_NOT_APPEARED)}
                    </MenuItem>
                    <MenuItem value={HistoryCondition.WithinLast}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_WITHIN_LAST)}
                    </MenuItem>
                    <MenuItem value={HistoryCondition.NotWithinLast}>
                        {__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_NOT_WITHIN_LAST)}
                    </MenuItem>
                </Select>
            </FormControl>
            {needsN && (
                <TextField
                    size="small"
                    type="number"
                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_HIST_LAST_N)}
                    sx={{ width: 80, flexShrink: 0 }}
                    value={parseInt(value, 10) || ""}
                    onChange={(e) => onChange(op, String(Math.max(1, parseInt(e.target.value, 10) || 1)), weight)}
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                />
            )}
            {!hideWeight && (
                <TextField
                    size="small"
                    sx={{ width: 80, flexShrink: 0, ml: "auto" }}
                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_VALUE)}
                    type="number"
                    value={weight}
                    onChange={(e) => onChange(op, value, Math.max(0, parseFloat(e.target.value) || 0))}
                    slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                />
            )}
        </Stack>
    );
};

const PlayerTagsValueEditor: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
    const [options, setOptions] = useState<string[]>([]);
    const deferredOptions = useDeferredValue(options);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
    const tags = value ? value.split(",").filter(Boolean) : [];

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

    return (
        <Autocomplete
            multiple
            freeSolo
            sx={{ flexGrow: 1 }}
            filterOptions={(x) => x}
            options={deferredOptions}
            value={tags}
            onChange={(_, newValue) => onChange((newValue as string[]).join(","))}
            onInputChange={(_, v) => search(v)}
            renderValue={(val, getItemProps) =>
                (val as string[]).map((option, index) => {
                    const { key, ...tagProps } = getItemProps({ index });
                    return <Chip key={key} label={option} size="small" {...tagProps} />;
                })
            }
            renderInput={(params) => (
                <TextField {...params} size="small" label={__(I18nStrings.MAIN_PICKER_WEIGHT_COND_VALUE)} />
            )}
        />
    );
};

const WeightEntryFormFields: React.FC<{
    draft: WeightDraft;
    collections: IOsuCollection[];
    hideWeight?: boolean;
    onChange: (d: WeightDraft) => void;
}> = ({ draft, collections, hideWeight, onChange }) => {
    const isCond = draft.type === PickerTargetType.BeatmapData || draft.type === PickerTargetType.ScoreRecord;
    const isHistory = draft.type === PickerTargetType.History;
    const fieldKind = isCond ? getFieldKind(draft.type, draft.field) : "string";
    const fieldI18nMap = (
        draft.type === PickerTargetType.BeatmapData ? BEATMAP_FIELD_I18N : SCORE_FIELD_I18N
    ) as Record<string, I18nStrings>;
    const fieldValues: string[] =
        draft.type === PickerTargetType.BeatmapData ? Object.values(BeatmapDataField) : Object.values(ScoreRecordField);

    const handleTypeChange = (newType: PickerTargetType) => {
        if (newType === PickerTargetType.History) {
            onChange({ ...draft, type: newType, id: "", field: "", operator: HistoryCondition.Appeared, value: "" });
            return;
        }
        const newField =
            newType === PickerTargetType.BeatmapData
                ? BeatmapDataField.Artist
                : newType === PickerTargetType.ScoreRecord
                  ? ScoreRecordField.UserName
                  : "";
        const newKind =
            newType === PickerTargetType.BeatmapData || newType === PickerTargetType.ScoreRecord
                ? getFieldKind(newType, newField)
                : "string";
        onChange({ ...draft, type: newType, id: "", field: newField, operator: getDefaultOp(newKind), value: "" });
    };

    const handleFieldChange = (newField: string) => {
        const newKind = getFieldKind(draft.type, newField);
        onChange({ ...draft, field: newField, operator: getDefaultOp(newKind), value: "" });
    };

    return (
        <Stack spacing={2}>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    alignItems: "flex-start",
                }}
            >
                <FormControl size="small" sx={{ minWidth: 100, flexShrink: 0 }}>
                    <Select value={draft.type} onChange={(e) => handleTypeChange(e.target.value as PickerTargetType)}>
                        <MenuItem value={PickerTargetType.Map}>{__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_MAP)}</MenuItem>
                        <MenuItem value={PickerTargetType.Set}>{__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_SET)}</MenuItem>
                        <MenuItem value={PickerTargetType.Collection}>
                            {__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_COLLECTION)}
                        </MenuItem>
                        <MenuItem value={PickerTargetType.BeatmapData}>
                            {__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_BEATMAP)}
                        </MenuItem>
                        <MenuItem value={PickerTargetType.ScoreRecord}>
                            {__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_SCORE)}
                        </MenuItem>
                        <MenuItem value={PickerTargetType.History}>
                            {__(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_HISTORY)}
                        </MenuItem>
                    </Select>
                </FormControl>
                {!isCond && !isHistory && draft.type !== PickerTargetType.Collection && (
                    <TextField
                        size="small"
                        sx={{ flexGrow: 1 }}
                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_ID)}
                        value={draft.id}
                        onChange={(e) => onChange({ ...draft, id: e.target.value })}
                    />
                )}
                {draft.type === PickerTargetType.Collection && (
                    <FormControl size="small" sx={{ flexGrow: 1 }}>
                        <InputLabel>{__(I18nStrings.MAIN_PICKER_WEIGHT_ID)}</InputLabel>
                        <Select
                            label={__(I18nStrings.MAIN_PICKER_WEIGHT_ID)}
                            value={draft.id}
                            onChange={(e) => onChange({ ...draft, id: e.target.value })}
                        >
                            {collections.map((c) => (
                                <MenuItem key={c.name} value={c.name}>
                                    {c.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                {isCond && (
                    <FormControl size="small" sx={{ flexGrow: 1, minWidth: 100 }}>
                        <InputLabel>{__(I18nStrings.MAIN_PICKER_WEIGHT_FIELD)}</InputLabel>
                        <Select
                            label={__(I18nStrings.MAIN_PICKER_WEIGHT_FIELD)}
                            value={draft.field}
                            onChange={(e) => handleFieldChange(e.target.value)}
                        >
                            {fieldValues.map((f) => (
                                <MenuItem key={f} value={f}>
                                    {__(fieldI18nMap[f])}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                {!isCond && !isHistory && !hideWeight && (
                    <TextField
                        size="small"
                        sx={{ width: 80, flexShrink: 0 }}
                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_VALUE)}
                        type="number"
                        value={draft.weight}
                        onChange={(e) => onChange({ ...draft, weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                        slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                    />
                )}
                {isHistory && (
                    <HistoryConditionEditor
                        operator={draft.operator}
                        value={draft.value}
                        hideWeight={hideWeight}
                        weight={draft.weight}
                        onChange={(op, val, w) => onChange({ ...draft, operator: op, value: val, weight: w })}
                    />
                )}
            </Stack>
            {isCond && (
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "flex-start",
                    }}
                >
                    {fieldKind === "date" ? (
                        <DateConditionEditor
                            operator={draft.operator}
                            value={draft.value}
                            onChange={(op, val) => onChange({ ...draft, operator: op, value: val })}
                        />
                    ) : (
                        <>
                            <FormControl size="small" sx={{ minWidth: 110, flexShrink: 0 }}>
                                <InputLabel>{__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}</InputLabel>
                                <Select
                                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_OPERATOR)}
                                    value={draft.operator}
                                    onChange={(e) => onChange({ ...draft, operator: e.target.value })}
                                >
                                    {fieldKind === "string" &&
                                        Object.entries(
                                            draft.field === BeatmapDataField.PlayerTags
                                                ? PLAYER_TAGS_OP_I18N
                                                : STR_OP_I18N,
                                        ).map(([op, key]) => (
                                            <MenuItem key={op} value={op}>
                                                {__(key)}
                                            </MenuItem>
                                        ))}
                                    {fieldKind === "number" &&
                                        Object.entries(NUM_OP_I18N).map(([op, key]) => (
                                            <MenuItem key={op} value={op}>
                                                {__(key)}
                                            </MenuItem>
                                        ))}
                                    {fieldKind === "boolean" && [
                                        <MenuItem key={BoolCondition.IsTrue} value={BoolCondition.IsTrue}>
                                            {__(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_TRUE)}
                                        </MenuItem>,
                                        <MenuItem key={BoolCondition.IsFalse} value={BoolCondition.IsFalse}>
                                            {__(I18nStrings.MAIN_PICKER_WEIGHT_OP_BOOL_FALSE)}
                                        </MenuItem>,
                                    ]}
                                </Select>
                            </FormControl>
                            {fieldKind !== "boolean" && draft.field !== BeatmapDataField.PlayerTags && (
                                <TextField
                                    size="small"
                                    sx={{ flexGrow: 1 }}
                                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_COND_VALUE)}
                                    type={fieldKind === "number" ? "number" : "text"}
                                    value={draft.value}
                                    onChange={(e) => onChange({ ...draft, value: e.target.value })}
                                />
                            )}
                            {draft.field === BeatmapDataField.PlayerTags && (
                                <PlayerTagsValueEditor
                                    value={draft.value}
                                    onChange={(v) => onChange({ ...draft, value: v })}
                                />
                            )}
                        </>
                    )}
                    {!hideWeight && (
                        <TextField
                            size="small"
                            sx={{ width: 80, flexShrink: 0 }}
                            label={__(I18nStrings.MAIN_PICKER_WEIGHT_VALUE)}
                            type="number"
                            value={draft.weight}
                            onChange={(e) =>
                                onChange({ ...draft, weight: Math.max(0, parseFloat(e.target.value) || 0) })
                            }
                            slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                        />
                    )}
                </Stack>
            )}
        </Stack>
    );
};

const WeightSection: React.FC<{
    weights: IWeightEntry[];
    collections: IOsuCollection[];
    onChange: (weights: IWeightEntry[]) => void;
}> = ({ weights, collections, onChange }) => {
    const [newDraft, setNewDraft] = useState<WeightDraft>(initDraft());
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState<WeightDraft | null>(null);

    const dupIndices = useMemo(() => {
        const seen = new Map<string, number>();
        const dups = new Set<number>();
        weights.forEach((w, i) => {
            const key = serializeWeightEntry(w);
            const first = seen.get(key);
            if (first !== undefined) {
                dups.add(i);
            } else {
                seen.set(key, i);
            }
        });
        return dups;
    }, [weights]);

    useEffect(() => {
        const autoDisabled = weights.map((w, i) =>
            dupIndices.has(i) && w.enabled !== false ? { ...w, enabled: false } : w,
        );
        if (autoDisabled.some((w, i) => w !== weights[i])) {
            onChange(autoDisabled);
        }
    }, [dupIndices]);

    const handleDelete = (idx: number) => {
        onChange(weights.filter((_, i) => i !== idx));
    };

    const handleCopy = (idx: number) => {
        onChange([...weights, { ...weights[idx], enabled: weights[idx].enabled }]);
    };

    const handleAdd = () => {
        if (!isValidDraft(newDraft)) return;
        onChange([...weights, draftToEntry(newDraft)]);
        setNewDraft(initDraft());
    };

    const startEdit = (idx: number) => {
        setEditingIdx(idx);
        setEditDraft(draftFromEntry(weights[idx]));
    };

    const confirmEdit = () => {
        if (editingIdx === null || !editDraft || !isValidDraft(editDraft)) return;
        const updated = [...weights];
        updated[editingIdx] = draftToEntry(editDraft);
        onChange(updated);
        setEditingIdx(null);
        setEditDraft(null);
    };

    const cancelEdit = () => {
        setEditingIdx(null);
        setEditDraft(null);
    };

    const getTypeLabel = (type: PickerTargetType): string => {
        switch (type) {
            case PickerTargetType.Map:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_MAP);
            case PickerTargetType.Set:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_SET);
            case PickerTargetType.Collection:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_COLLECTION);
            case PickerTargetType.BeatmapData:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_BEATMAP);
            case PickerTargetType.ScoreRecord:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_SCORE);
            case PickerTargetType.History:
                return __(I18nStrings.MAIN_PICKER_WEIGHT_TYPE_HISTORY);
        }
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Typography
                variant="subtitle2"
                sx={{
                    color: "text.secondary",
                    textAlign: "center",
                }}
            >
                {__(I18nStrings.MAIN_PICKER_WEIGHT_TITLE)}
            </Typography>
            <Divider />
            <Box
                sx={{
                    mt: 1.5,
                }}
            >
                <WeightEntryFormFields draft={newDraft} collections={collections} onChange={setNewDraft} />
                <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Add />}
                    fullWidth
                    sx={{ mt: 1 }}
                    onClick={handleAdd}
                    disabled={!isValidDraft(newDraft)}
                >
                    {__(I18nStrings.MAIN_PICKER_WEIGHT_ADD)}
                </Button>
            </Box>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ flex: 1, overflowY: "auto" }}>
                <Stack spacing={2}>
                    {weights.length === 0 && (
                        <Typography
                            variant="caption"
                            sx={{
                                color: "text.secondary",
                                textAlign: "center",
                                display: "block",
                            }}
                        >
                            -
                        </Typography>
                    )}
                    {weights.map((w, i) => (
                        <Tooltip
                            key={`${w.type}-${w.id}-${w.weight}-${w.beatmapCondition?.field ?? ""}-${w.scoreCondition?.field ?? ""}-${i}`}
                            title={dupIndices.has(i) ? __(I18nStrings.MAIN_PICKER_DUPLICATE_CONDITION) : ""}
                            placement="top"
                            arrow
                            disableHoverListener={!dupIndices.has(i)}
                        >
                            <Box
                                sx={{
                                    borderLeft: "3px solid",
                                    borderColor: dupIndices.has(i)
                                        ? "error.main"
                                        : editingIdx === i
                                          ? "warning.main"
                                          : w.enabled === false
                                            ? "error.light"
                                            : "divider",
                                    bgcolor: editingIdx === i ? "action.hover" : "transparent",
                                    borderRadius: 1,
                                    px: 1,
                                    py: 0.5,
                                    opacity: w.enabled === false ? 0.45 : 1,
                                    transition: "opacity 0.2s",
                                }}
                            >
                                {editingIdx === i && editDraft ? (
                                    <Box>
                                        <WeightEntryFormFields
                                            draft={editDraft}
                                            collections={collections}
                                            onChange={(d) => setEditDraft(d)}
                                        />
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                justifyContent: "flex-end",
                                                mt: 0.5,
                                            }}
                                        >
                                            <IconButton
                                                size="small"
                                                color="success"
                                                onClick={confirmEdit}
                                                disabled={!isValidDraft(editDraft)}
                                            >
                                                <Check fontSize="small" />
                                            </IconButton>
                                            <IconButton size="small" color="error" onClick={cancelEdit}>
                                                <Block fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                    </Box>
                                ) : (
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        sx={{
                                            alignItems: "center",
                                        }}
                                    >
                                        <Typography
                                            variant="caption"
                                            noWrap
                                            sx={{
                                                color: "text.secondary",
                                                minWidth: 48,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {getTypeLabel(w.type)}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                flexGrow: 1,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {getEntryCondDesc(w)}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            sx={{ minWidth: 32, textAlign: "right", flexShrink: 0 }}
                                        >
                                            x{w.weight}
                                        </Typography>
                                        <Tooltip title={__(I18nStrings.MAIN_PICKER_WEIGHT_ENABLED)} placement="top">
                                            <Switch
                                                size="small"
                                                checked={w.enabled !== false}
                                                onChange={() => {
                                                    const updated = [...weights];
                                                    updated[i] = { ...w, enabled: !(w.enabled !== false) };
                                                    onChange(updated);
                                                }}
                                            />
                                        </Tooltip>
                                        <Tooltip title={__(I18nStrings.MAIN_PICKER_WEIGHT_COPY)} placement="top">
                                            <IconButton size="small" onClick={() => handleCopy(i)}>
                                                <ContentCopy fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton size="small" onClick={() => startEdit(i)}>
                                            <Edit fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(i)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                )}
                            </Box>
                        </Tooltip>
                    ))}
                </Stack>
            </Box>
        </Box>
    );
};

interface IBeatmapPickerAdvancedPanelProps {
    collections: IOsuCollection[];
    history: IPickerHistory[];
    settings: IPickerAdvancedSettings;
    section?: "weight" | "wishlist" | "history";
    onSettingsChanged: (settings: IPickerAdvancedSettings) => void;
    onClearHistory: () => void;
    onHistoryItemClick?: (item: IPickerHistory) => void;
}

const wishlistDraftToCondItem = (draft: WeightDraft): IWishlistConditionItem => {
    if (draft.type === PickerTargetType.BeatmapData) {
        return {
            type: draft.type,
            id: "",
            beatmapCondition: {
                field: draft.field as BeatmapDataField,
                operator: draft.operator,
                value: draft.value,
            } as IWeightBeatmapCondition,
        };
    }
    if (draft.type === PickerTargetType.ScoreRecord) {
        return {
            type: draft.type,
            id: "",
            scoreCondition: {
                field: draft.field as ScoreRecordField,
                operator: draft.operator,
                value: draft.value,
            } as IWeightScoreCondition,
        };
    }
    if (draft.type === PickerTargetType.History) {
        return {
            type: draft.type,
            id: "",
            historyCondition: {
                operator: draft.operator as HistoryCondition,
                value: draft.value,
            } as IWeightHistoryCondition,
        };
    }
    return { type: draft.type, id: draft.id.trim() };
};

const condItemToDraft = (item: IWishlistConditionItem): WeightDraft => {
    if (item.type === PickerTargetType.BeatmapData && item.beatmapCondition) {
        return {
            type: item.type,
            id: "",
            weight: 0,
            enabled: true,
            field: item.beatmapCondition.field,
            operator: item.beatmapCondition.operator,
            value: item.beatmapCondition.value,
        };
    }
    if (item.type === PickerTargetType.ScoreRecord && item.scoreCondition) {
        return {
            type: item.type,
            id: "",
            weight: 0,
            enabled: true,
            field: item.scoreCondition.field,
            operator: item.scoreCondition.operator,
            value: item.scoreCondition.value,
        };
    }
    if (item.type === PickerTargetType.History && item.historyCondition) {
        return {
            type: item.type,
            id: "",
            weight: 0,
            enabled: true,
            field: "",
            operator: item.historyCondition.operator,
            value: item.historyCondition.value,
        };
    }
    return {
        type: item.type,
        id: item.id,
        weight: 0,
        enabled: true,
        field: BeatmapDataField.Artist,
        operator: StringCondition.Contains,
        value: "",
    };
};

interface WishlistEntryDraft {
    label: string;
    priority: number;
    enabled: boolean;
    conditions: WeightDraft[];
}

const initWishlistEntryDraft = (): WishlistEntryDraft => ({
    label: "",
    priority: 0,
    enabled: true,
    conditions: [initDraft()],
});

const normalizeWishlistEntry = (entry: any): IWishlistEntry => {
    if (!entry || typeof entry !== "object") {
        return { conditions: [] };
    }
    if (Array.isArray(entry.conditions)) {
        return { ...entry, conditions: entry.conditions };
    }
    const conditions: IWishlistConditionItem[] = [];
    if (
        entry.type === PickerTargetType.Map ||
        entry.type === PickerTargetType.Set ||
        entry.type === PickerTargetType.Collection
    ) {
        conditions.push({ type: entry.type, id: String(entry.id ?? "") });
    }
    return {
        label: entry.label,
        conditions:
            conditions.length > 0
                ? conditions
                : [{ type: entry.type ?? PickerTargetType.Map, id: String(entry.id ?? "") }],
    };
};

const WishlistSection: React.FC<{
    wishlist: IWishlistEntry[];
    collections: IOsuCollection[];
    onChange: (wishlist: IWishlistEntry[]) => void;
}> = ({ wishlist, collections, onChange }) => {
    const normalizedWishlist = wishlist.map(normalizeWishlistEntry);
    const [newEntry, setNewEntry] = useState<WishlistEntryDraft>(initWishlistEntryDraft());
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editEntry, setEditEntry] = useState<WishlistEntryDraft | null>(null);

    const dupIndices = useMemo(() => {
        const seen = new Map<string, number>();
        const dups = new Set<number>();
        normalizedWishlist.forEach((e, i) => {
            const key = serializeWishlistEntry(e);
            const first = seen.get(key);
            if (first !== undefined) {
                dups.add(i);
            } else {
                seen.set(key, i);
            }
        });
        return dups;
    }, [normalizedWishlist]);

    useEffect(() => {
        const autoDisabled = wishlist.map((e, i) =>
            dupIndices.has(i) && e.enabled !== false ? { ...e, enabled: false } : e,
        );
        if (autoDisabled.some((e, i) => e !== wishlist[i])) {
            onChange(autoDisabled);
        }
    }, [dupIndices]);

    const isValidEntry = (entry: WishlistEntryDraft): boolean =>
        entry.conditions.length > 0 && entry.conditions.every(isValidDraft);

    const updateNewCond = (i: number, d: WeightDraft) => {
        const conds = [...newEntry.conditions];
        conds[i] = d;
        setNewEntry({ ...newEntry, conditions: conds });
    };

    const addNewCond = () => {
        setNewEntry({ ...newEntry, conditions: [...newEntry.conditions, initDraft()] });
    };

    const removeNewCond = (i: number) => {
        if (newEntry.conditions.length <= 1) return;
        setNewEntry({ ...newEntry, conditions: newEntry.conditions.filter((_, idx) => idx !== i) });
    };

    const handleAdd = () => {
        if (!isValidEntry(newEntry)) return;
        const entry: IWishlistEntry = {
            label: newEntry.label.trim() || undefined,
            priority: newEntry.priority,
            enabled: newEntry.enabled,
            conditions: newEntry.conditions.map(wishlistDraftToCondItem),
        };
        onChange([...wishlist, entry]);
        setNewEntry(initWishlistEntryDraft());
    };

    const handleDelete = (idx: number) => {
        onChange(wishlist.filter((_, i) => i !== idx));
    };

    const handleCopy = (idx: number) => {
        const entry = normalizedWishlist[idx];
        onChange([...wishlist, { ...entry, label: undefined, enabled: entry.enabled }]);
    };

    const startEdit = (idx: number) => {
        const entry = normalizedWishlist[idx];
        setEditingIdx(idx);
        setEditEntry({
            label: entry.label ?? "",
            priority: entry.priority ?? 0,
            enabled: entry.enabled !== false,
            conditions: entry.conditions.map(condItemToDraft),
        });
    };

    const confirmEdit = () => {
        if (editingIdx === null || !editEntry || !isValidEntry(editEntry)) return;
        const updated = [...wishlist];
        updated[editingIdx] = {
            label: editEntry.label.trim() || undefined,
            priority: editEntry.priority,
            enabled: editEntry.enabled,
            conditions: editEntry.conditions.map(wishlistDraftToCondItem),
        };
        onChange(updated);
        setEditingIdx(null);
        setEditEntry(null);
    };

    const cancelEdit = () => {
        setEditingIdx(null);
        setEditEntry(null);
    };

    const updateEditCond = (i: number, d: WeightDraft) => {
        if (!editEntry) return;
        const conds = [...editEntry.conditions];
        conds[i] = d;
        setEditEntry({ ...editEntry, conditions: conds });
    };

    const addEditCond = () => {
        if (!editEntry) return;
        setEditEntry({ ...editEntry, conditions: [...editEntry.conditions, initDraft()] });
    };

    const removeEditCond = (i: number) => {
        if (!editEntry || editEntry.conditions.length <= 1) return;
        setEditEntry({ ...editEntry, conditions: editEntry.conditions.filter((_, idx) => idx !== i) });
    };

    const getCondDesc = (item: IWishlistConditionItem): string => {
        const asEntry: IWeightEntry = { ...item, weight: 0 };
        return getEntryCondDesc(asEntry);
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Typography
                variant="subtitle2"
                sx={{
                    color: "text.secondary",
                    textAlign: "center",
                }}
            >
                {__(I18nStrings.MAIN_PICKER_WISHLIST_TITLE)}
            </Typography>
            <Divider />
            <Box
                sx={{
                    mt: 1.5,
                }}
            >
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <TextField
                        size="small"
                        fullWidth
                        label={__(I18nStrings.MAIN_PICKER_WISHLIST_LABEL)}
                        value={newEntry.label}
                        onChange={(e) => setNewEntry({ ...newEntry, label: e.target.value })}
                    />
                    <TextField
                        size="small"
                        sx={{ width: 90, flexShrink: 0 }}
                        type="number"
                        slotProps={{ htmlInput: { min: 0, max: 99 } }}
                        label={__(I18nStrings.MAIN_PICKER_WISHLIST_PRIORITY)}
                        value={newEntry.priority}
                        onChange={(e) =>
                            setNewEntry({ ...newEntry, priority: Math.max(0, Number(e.target.value) || 0) })
                        }
                    />
                </Stack>
                <Stack spacing={2}>
                    {newEntry.conditions.map((cond, i) => (
                        <Stack
                            key={`new-${cond.type}-${cond.field}`}
                            direction="row"
                            spacing={1}
                            sx={{
                                alignItems: "flex-start",
                            }}
                        >
                            <Box sx={{ flexGrow: 1 }}>
                                <WeightEntryFormFields
                                    draft={cond}
                                    collections={collections}
                                    hideWeight
                                    onChange={(d) => updateNewCond(i, d)}
                                />
                            </Box>
                            <IconButton
                                size="small"
                                color="error"
                                disabled={newEntry.conditions.length <= 1}
                                onClick={() => removeNewCond(i)}
                                sx={{ mt: 0.5 }}
                            >
                                <Delete fontSize="small" />
                            </IconButton>
                        </Stack>
                    ))}
                </Stack>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        mt: 1,
                    }}
                >
                    <Button variant="text" size="small" startIcon={<Add />} onClick={addNewCond}>
                        {__(I18nStrings.MAIN_PICKER_WISHLIST_ADD_COND)}
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{ flexGrow: 1 }}
                        startIcon={<Add />}
                        onClick={handleAdd}
                        disabled={!isValidEntry(newEntry)}
                    >
                        {__(I18nStrings.MAIN_PICKER_WISHLIST_ADD)}
                    </Button>
                </Stack>
            </Box>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ flex: 1, overflowY: "auto" }}>
                <Stack spacing={2}>
                    {wishlist.length === 0 && (
                        <Typography
                            variant="caption"
                            sx={{
                                color: "text.secondary",
                                textAlign: "center",
                                display: "block",
                            }}
                        >
                            -
                        </Typography>
                    )}
                    {normalizedWishlist.map((entry, i) => (
                        <Tooltip
                            key={`${entry.label ?? ""}-${entry.priority ?? 0}-${i}`}
                            title={dupIndices.has(i) ? __(I18nStrings.MAIN_PICKER_DUPLICATE_CONDITION) : ""}
                            placement="top"
                            arrow
                            disableHoverListener={!dupIndices.has(i)}
                        >
                            <Box
                                sx={{
                                    borderLeft: "3px solid",
                                    borderColor: dupIndices.has(i)
                                        ? "error.main"
                                        : editingIdx === i
                                          ? "warning.main"
                                          : entry.enabled === false
                                            ? "error.light"
                                            : "primary.main",
                                    bgcolor: editingIdx === i ? "action.hover" : "transparent",
                                    borderRadius: 1,
                                    px: 1,
                                    py: 0.5,
                                    opacity: entry.enabled === false ? 0.45 : 1,
                                    transition: "opacity 0.2s",
                                }}
                            >
                                {editingIdx === i && editEntry ? (
                                    <Box>
                                        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                            <TextField
                                                size="small"
                                                fullWidth
                                                label={__(I18nStrings.MAIN_PICKER_WISHLIST_LABEL)}
                                                value={editEntry.label}
                                                onChange={(e) => setEditEntry({ ...editEntry, label: e.target.value })}
                                            />
                                            <TextField
                                                size="small"
                                                sx={{ width: 90, flexShrink: 0 }}
                                                type="number"
                                                slotProps={{ htmlInput: { min: 0, max: 99 } }}
                                                label={__(I18nStrings.MAIN_PICKER_WISHLIST_PRIORITY)}
                                                value={editEntry.priority}
                                                onChange={(e) =>
                                                    setEditEntry({
                                                        ...editEntry,
                                                        priority: Math.max(0, Number(e.target.value) || 0),
                                                    })
                                                }
                                            />
                                        </Stack>
                                        <Stack spacing={2}>
                                            {editEntry.conditions.map((cond, ci) => (
                                                <Stack
                                                    key={`edit-${cond.type}-${cond.field}`}
                                                    direction="row"
                                                    spacing={1}
                                                    sx={{
                                                        alignItems: "flex-start",
                                                    }}
                                                >
                                                    <Box sx={{ flexGrow: 1 }}>
                                                        <WeightEntryFormFields
                                                            draft={cond}
                                                            collections={collections}
                                                            hideWeight
                                                            onChange={(d) => updateEditCond(ci, d)}
                                                        />
                                                    </Box>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        disabled={editEntry.conditions.length <= 1}
                                                        onClick={() => removeEditCond(ci)}
                                                        sx={{ mt: 0.5 }}
                                                    >
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </Stack>
                                            ))}
                                        </Stack>
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                mt: 0.5,
                                            }}
                                        >
                                            <Button
                                                variant="text"
                                                size="small"
                                                startIcon={<Add />}
                                                onClick={addEditCond}
                                            >
                                                {__(I18nStrings.MAIN_PICKER_WISHLIST_ADD_COND)}
                                            </Button>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    justifyContent: "flex-end",
                                                    flexGrow: 1,
                                                }}
                                            >
                                                <IconButton
                                                    size="small"
                                                    color="success"
                                                    onClick={confirmEdit}
                                                    disabled={!isValidEntry(editEntry)}
                                                >
                                                    <Check fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" color="error" onClick={cancelEdit}>
                                                    <Block fontSize="small" />
                                                </IconButton>
                                            </Stack>
                                        </Stack>
                                    </Box>
                                ) : (
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        sx={{
                                            alignItems: "center",
                                            width: "100%",
                                        }}
                                    >
                                        <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={2}>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    alignItems: "center",
                                                }}
                                            >
                                                {entry.label && (
                                                    <Typography
                                                        variant="caption"
                                                        noWrap
                                                        sx={{
                                                            fontWeight: "bold",
                                                        }}
                                                    >
                                                        {entry.label}
                                                    </Typography>
                                                )}
                                                <Chip
                                                    label={`P${entry.priority ?? 0}`}
                                                    size="small"
                                                    color={entry.priority && entry.priority > 0 ? "primary" : "default"}
                                                    variant="outlined"
                                                    sx={{ fontSize: "0.6rem", height: 16 }}
                                                />
                                            </Stack>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{
                                                    flexWrap: "wrap",
                                                }}
                                            >
                                                {entry.conditions.map((c, ci) => (
                                                    <Chip
                                                        key={`${c.type}-${c.id || c.beatmapCondition?.field || c.scoreCondition?.field}-${ci}`}
                                                        label={getCondDesc(c)}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ fontSize: "0.65rem", height: 18 }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Stack>
                                        <Tooltip title={__(I18nStrings.MAIN_PICKER_WISHLIST_ENABLED)} placement="top">
                                            <Switch
                                                size="small"
                                                checked={entry.enabled !== false}
                                                onChange={() => {
                                                    const updated = [...wishlist];
                                                    updated[i] = { ...entry, enabled: !(entry.enabled !== false) };
                                                    onChange(updated);
                                                }}
                                            />
                                        </Tooltip>
                                        <Tooltip title={__(I18nStrings.MAIN_PICKER_WISHLIST_COPY)} placement="top">
                                            <IconButton size="small" onClick={() => handleCopy(i)}>
                                                <ContentCopy fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <IconButton size="small" onClick={() => startEdit(i)}>
                                            <Edit fontSize="small" />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(i)}>
                                            <Delete fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                )}
                            </Box>
                        </Tooltip>
                    ))}
                </Stack>
            </Box>
        </Box>
    );
};

export const BeatmapPickerAdvancedPanel: React.FC<IBeatmapPickerAdvancedPanelProps> = ({
    collections,
    history,
    settings,
    section,
    onSettingsChanged,
    onClearHistory,
    onHistoryItemClick,
}) => {
    const latestPickedAt = history.length > 0 ? Math.max(...history.map((h) => h.pickedAt)) : null;
    useNowAdaptive(section === "history" ? latestPickedAt : null);

    const historyRows: DefaultObject[] = useMemo(
        () =>
            history
                .slice()
                .reverse()
                .map((h) => {
                    const f = normalizeHistoryFields(h);
                    return {
                        songTitle: f.songTitle,
                        difficultyName: f.difficultyName,
                        artist: f.artist,
                        creatorName: f.creatorName,
                        beatmapId: String(h.beatmapId),
                        pickedAt: h.pickedAt,
                    };
                }),
        [history],
    );

    const handleWeightsChanged = (weights: IWeightEntry[]) => {
        onSettingsChanged({ ...settings, weights });
    };

    const handleWishlistChanged = (wishlist: IWishlistEntry[]) => {
        onSettingsChanged({ ...settings, wishlist });
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                p: 1,
                gap: 1,
                height: "100%",
            }}
        >
            {(!section || section === "weight") && (
                <WeightSection weights={settings.weights} collections={collections} onChange={handleWeightsChanged} />
            )}
            {(!section || section === "wishlist") && (
                <>
                    {!section && <Divider />}
                    <WishlistSection
                        wishlist={settings.wishlist}
                        collections={collections}
                        onChange={handleWishlistChanged}
                    />
                </>
            )}
            {(!section || section === "history") && (
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        flexGrow: 1,
                        overflow: "hidden",
                        ...(section !== "history" && { height: "100%" }),
                    }}
                >
                    <Typography
                        variant="subtitle2"
                        sx={{
                            color: "text.secondary",
                            textAlign: "center",
                            flexShrink: 0,
                        }}
                    >
                        {__(I18nStrings.MAIN_PICKER_HISTORY_TITLE)}
                    </Typography>
                    <Divider sx={{ flexShrink: 0 }} />
                    <Box sx={{ flexGrow: 1, overflow: "hidden", mt: 1 }}>
                        {history.length === 0 ? (
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "text.secondary",
                                }}
                            >
                                {__(I18nStrings.MAIN_PICKER_HISTORY_EMPTY)}
                            </Typography>
                        ) : (
                            <DataViewer
                                heads={getHistoryTableHeads()}
                                rows={historyRows}
                                rows_total={history.length}
                                rowHeight={36}
                                onRowClick={(_row, index) => {
                                    const item = history[history.length - 1 - index];
                                    if (item) onHistoryItemClick?.(item);
                                }}
                            />
                        )}
                    </Box>
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        fullWidth
                        sx={{ mt: 1, flexShrink: 0 }}
                        onClick={onClearHistory}
                        disabled={history.length === 0}
                    >
                        {__(I18nStrings.BTN_PICKER_CLEAR_HISTORY)}
                    </Button>
                </Box>
            )}
        </Box>
    );
};
