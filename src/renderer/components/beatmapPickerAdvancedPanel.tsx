import { Add, Block, Check, Delete, Edit } from "@mui/icons-material";
import {
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
    TextField,
    Typography,
} from "@mui/material";
import React, { useState } from "react";
import { IOsuCollection } from "../../defines/types";
import __ from "../../utils/i18n";
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

type FieldKind = "string" | "number" | "boolean" | "date";

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
    field: string;
    operator: string;
    value: string;
}

const initDraft = (): WeightDraft => ({
    type: PickerTargetType.Map,
    id: "",
    weight: 1,
    field: BeatmapDataField.Artist,
    operator: StringCondition.Contains,
    value: "",
});

const draftFromEntry = (entry: IWeightEntry): WeightDraft => {
    if (entry.type === PickerTargetType.BeatmapData && entry.beatmapCondition) {
        return {
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
            type: entry.type,
            id: "",
            weight: entry.weight,
            field: "",
            operator: entry.historyCondition.operator,
            value: entry.historyCondition.value,
        };
    }
    return {
        type: entry.type,
        id: entry.id,
        weight: entry.weight,
        field: BeatmapDataField.Artist,
        operator: StringCondition.Contains,
        value: "",
    };
};

const draftToEntry = (draft: WeightDraft): IWeightEntry => {
    if (draft.type === PickerTargetType.BeatmapData) {
        return {
            type: draft.type,
            id: "",
            weight: draft.weight,
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
            historyCondition: {
                operator: draft.operator as HistoryCondition,
                value: draft.value,
            } as IWeightHistoryCondition,
        };
    }
    return { type: draft.type, id: draft.id.trim(), weight: draft.weight };
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
            if (op === DateCondition.WithinSecs) return (parseInt(draft.value) || 0) > 0;
            return false;
        }
        return draft.value.trim() !== "";
    }
    if (draft.type === PickerTargetType.History) {
        const op = draft.operator as HistoryCondition;
        if (op === HistoryCondition.WithinLast || op === HistoryCondition.NotWithinLast) {
            return (parseInt(draft.value) || 0) > 0;
        }
        return true;
    }
    return draft.id.trim() !== "";
};

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
                : __(STR_OP_I18N[operator as StringCondition]);
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
    const secs = parseInt(value) || 0;
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
                    <MenuItem value={DateCondition.Before}>{__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BEFORE)}</MenuItem>
                    <MenuItem value={DateCondition.After}>{__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_AFTER)}</MenuItem>
                    <MenuItem value={DateCondition.Between}>{__(I18nStrings.MAIN_PICKER_WEIGHT_OP_DATE_BETWEEN)}</MenuItem>
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
                <Stack direction="row" spacing={1} alignItems="center">
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
                            onChange(mode, buildSecs(Math.max(0, parseInt(e.target.value) || 0), months, days))
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
                            onChange(mode, buildSecs(years, Math.max(0, parseInt(e.target.value) || 0), days))
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
                            onChange(mode, buildSecs(years, months, Math.max(0, parseInt(e.target.value) || 0)))
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
        <Stack direction="row" spacing={1} alignItems="flex-start">
            <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
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
                    value={parseInt(value) || ""}
                    onChange={(e) => onChange(op, String(Math.max(1, parseInt(e.target.value) || 1)), weight)}
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
            <Stack direction="row" spacing={1} alignItems="flex-start">
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
                <Stack direction="row" spacing={1} alignItems="flex-start">
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
                                        Object.entries(STR_OP_I18N).map(([op, key]) => (
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
                            {fieldKind !== "boolean" && (
                                <TextField
                                    size="small"
                                    sx={{ flexGrow: 1 }}
                                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_COND_VALUE)}
                                    type={fieldKind === "number" ? "number" : "text"}
                                    value={draft.value}
                                    onChange={(e) => onChange({ ...draft, value: e.target.value })}
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

    const handleDelete = (idx: number) => {
        onChange(weights.filter((_, i) => i !== idx));
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
        <Box>
            <Typography variant="subtitle2" color="text.secondary" textAlign="center">
                {__(I18nStrings.MAIN_PICKER_WEIGHT_TITLE)}
            </Typography>
            <Box mt={1}>
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
            <Divider sx={{ my: 1 }} />
            <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                <Stack spacing={2}>
                    {weights.length === 0 && (
                        <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                            -
                        </Typography>
                    )}
                    {weights.map((w, i) => (
                        <Box
                            key={`${w.type}-${w.id}-${i}`}
                            sx={{
                                borderLeft: "3px solid",
                                borderColor: editingIdx === i ? "warning.main" : "divider",
                                bgcolor: editingIdx === i ? "action.hover" : "transparent",
                                borderRadius: 1,
                                px: 1,
                                py: 0.5,
                            }}
                        >
                            {editingIdx === i && editDraft ? (
                                <Box>
                                    <WeightEntryFormFields
                                        draft={editDraft}
                                        collections={collections}
                                        onChange={(d) => setEditDraft(d)}
                                    />
                                    <Stack direction="row" justifyContent="flex-end" spacing={1} mt={0.5}>
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
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ minWidth: 48, flexShrink: 0 }}
                                        noWrap
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
                                    <IconButton size="small" onClick={() => startEdit(i)}>
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => handleDelete(i)}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Stack>
                            )}
                        </Box>
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
            field: "",
            operator: item.historyCondition.operator,
            value: item.historyCondition.value,
        };
    }
    return {
        type: item.type,
        id: item.id,
        weight: 0,
        field: BeatmapDataField.Artist,
        operator: StringCondition.Contains,
        value: "",
    };
};

interface WishlistEntryDraft {
    label: string;
    conditions: WeightDraft[];
}

const initWishlistEntryDraft = (): WishlistEntryDraft => ({
    label: "",
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
            conditions: newEntry.conditions.map(wishlistDraftToCondItem),
        };
        onChange([...wishlist, entry]);
        setNewEntry(initWishlistEntryDraft());
    };

    const handleDelete = (idx: number) => {
        onChange(wishlist.filter((_, i) => i !== idx));
    };

    const startEdit = (idx: number) => {
        const entry = normalizedWishlist[idx];
        setEditingIdx(idx);
        setEditEntry({
            label: entry.label ?? "",
            conditions: entry.conditions.map(condItemToDraft),
        });
    };

    const confirmEdit = () => {
        if (editingIdx === null || !editEntry || !isValidEntry(editEntry)) return;
        const updated = [...wishlist];
        updated[editingIdx] = {
            label: editEntry.label.trim() || undefined,
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
        <Box>
            <Typography variant="subtitle2" color="text.secondary" textAlign="center">
                {__(I18nStrings.MAIN_PICKER_WISHLIST_TITLE)}
            </Typography>
            <Box mt={1}>
                <TextField
                    size="small"
                    fullWidth
                    sx={{ mb: 1 }}
                    label={__(I18nStrings.MAIN_PICKER_WISHLIST_LABEL)}
                    value={newEntry.label}
                    onChange={(e) => setNewEntry({ ...newEntry, label: e.target.value })}
                />
                <Stack spacing={2}>
                    {newEntry.conditions.map((cond, i) => (
                        <Stack
                            key={`new-${i}-${cond.type}-${cond.field}`}
                            direction="row"
                            spacing={1}
                            alignItems="flex-start"
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
                <Stack direction="row" spacing={1} mt={1}>
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
            <Divider sx={{ my: 1 }} />
            <Box sx={{ maxHeight: 300, overflowY: "auto" }}>
                <Stack spacing={2}>
                    {wishlist.length === 0 && (
                        <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                            -
                        </Typography>
                    )}
                    {normalizedWishlist.map((entry, i) => (
                        <Box
                            key={`${entry.label ?? ""}-${i}`}
                            sx={{
                                borderLeft: "3px solid",
                                borderColor: editingIdx === i ? "warning.main" : "primary.main",
                                bgcolor: editingIdx === i ? "action.hover" : "transparent",
                                borderRadius: 1,
                                px: 1,
                                py: 0.5,
                            }}
                        >
                            {editingIdx === i && editEntry ? (
                                <Box>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        sx={{ mb: 1 }}
                                        label={__(I18nStrings.MAIN_PICKER_WISHLIST_LABEL)}
                                        value={editEntry.label}
                                        onChange={(e) => setEditEntry({ ...editEntry, label: e.target.value })}
                                    />
                                    <Stack spacing={2}>
                                        {editEntry.conditions.map((cond, ci) => (
                                            <Stack
                                                key={`edit-${ci}-${cond.type}-${cond.field}`}
                                                direction="row"
                                                spacing={1}
                                                alignItems="flex-start"
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
                                    <Stack direction="row" spacing={1} mt={0.5}>
                                        <Button variant="text" size="small" startIcon={<Add />} onClick={addEditCond}>
                                            {__(I18nStrings.MAIN_PICKER_WISHLIST_ADD_COND)}
                                        </Button>
                                        <Stack
                                            direction="row"
                                            justifyContent="flex-end"
                                            spacing={1}
                                            sx={{ flexGrow: 1 }}
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
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Stack sx={{ flexGrow: 1, overflow: "hidden" }} spacing={2}>
                                        {entry.label && (
                                            <Typography variant="caption" fontWeight="bold" noWrap>
                                                {entry.label}
                                            </Typography>
                                        )}
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {entry.conditions.map((c, ci) => (
                                                <Chip
                                                    key={`${ci}-${c.type}-${c.id || c.beatmapCondition?.field || c.scoreCondition?.field}`}
                                                    label={getCondDesc(c)}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ fontSize: "0.65rem", height: 18 }}
                                                />
                                            ))}
                                        </Stack>
                                    </Stack>
                                    <IconButton size="small" onClick={() => startEdit(i)}>
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => handleDelete(i)}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Stack>
                            )}
                        </Box>
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
}) => {
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
                height: section === "history" ? "100%" : undefined,
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
                <>
                    {!section && <Divider />}
                    <Box
                        sx={
                            section === "history"
                                ? { display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden" }
                                : {}
                        }
                    >
                        <Typography variant="subtitle2" color="text.secondary" textAlign="center">
                            {__(I18nStrings.MAIN_PICKER_HISTORY_TITLE)}
                        </Typography>
                        <Box
                            sx={{
                                flexGrow: 1,
                                overflowY: "auto",
                                mt: 1,
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 1,
                                p: 0.5,
                                ...(section !== "history" && { maxHeight: 160 }),
                            }}
                        >
                            {history.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">
                                    {__(I18nStrings.MAIN_PICKER_HISTORY_EMPTY)}
                                </Typography>
                            ) : (
                                history
                                    .slice()
                                    .reverse()
                                    .map((h) => (
                                        <Typography
                                            key={`${h.beatmapId}-${h.pickedAt}`}
                                            variant="caption"
                                            display="block"
                                            noWrap
                                        >
                                            {h.beatmapId} - {h.title}
                                        </Typography>
                                    ))
                            )}
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            fullWidth
                            sx={{ mt: 1 }}
                            onClick={onClearHistory}
                            disabled={history.length === 0}
                        >
                            {__(I18nStrings.BTN_PICKER_CLEAR_HISTORY)}
                        </Button>
                    </Box>
                </>
            )}
        </Box>
    );
};
