import type { OsuBeatmap } from "../../utils/osu";

export enum PickerTargetType {
    Map = "map",
    Set = "set",
    Collection = "collection",
    BeatmapData = "beatmap_data",
    ScoreRecord = "score_record",
    History = "history",
}

export enum HistoryCondition {
    Appeared = "hist_appeared",
    NotAppeared = "hist_not_appeared",
    WithinLast = "hist_within_last",
    NotWithinLast = "hist_not_within_last",
}

export enum StringCondition {
    Equals = "eq",
    Contains = "contains",
    NotContains = "not_contains",
}

export enum NumberCondition {
    Equals = "eq",
    Greater = "gt",
    Less = "lt",
    GreaterOrEqual = "gte",
    LessOrEqual = "lte",
    NotEquals = "neq",
}

export enum BoolCondition {
    IsTrue = "true",
    IsFalse = "false",
}

export enum DateCondition {
    Before = "date_before",
    After = "date_after",
    Between = "date_between",
    WithinSecs = "date_within_secs",
}

export enum BeatmapDataField {
    Id = "id",
    SetId = "set_id",
    Artist = "artist",
    Title = "title",
    Creator = "creator",
    DifficultyName = "difficulty_name",
    RankedStatus = "ranked_status",
    DrainSeconds = "drain_seconds",
    Tags = "tags",
    Unplayed = "unplayed",
    LastPlayedTime = "last_played_time",
    AR = "ar",
    CS = "cs",
    HP = "hp",
    OD = "od",
    Stack = "stack",
    SV = "sv",
    PlayerTags = "player_tags",
}

export enum ScoreRecordField {
    UserName = "user_name",
    Count300 = "count300",
    Count100 = "count100",
    Count50 = "count50",
    CountGeki = "count_geki",
    CountKatu = "count_katu",
    CountMiss = "count_miss",
    MaxCombo = "max_combo",
    Perfect = "perfect",
    Date = "date",
}

export interface IWeightHistoryCondition {
    operator: HistoryCondition;
    value: string;
    timeCondition?: { operator: DateCondition; value: string };
    beatmapCondition?: IWeightBeatmapCondition;
}

export interface IWeightBeatmapCondition {
    field: BeatmapDataField;
    operator: string;
    value: string;
}

export interface IWeightScoreCondition {
    field: ScoreRecordField;
    operator: string;
    value: string;
}

export interface IWeightEntry {
    type: PickerTargetType;
    id: string;
    weight: number;
    enabled?: boolean;
    beatmapCondition?: IWeightBeatmapCondition;
    scoreCondition?: IWeightScoreCondition;
    historyCondition?: IWeightHistoryCondition;
}

export interface IWishlistConditionItem {
    type: PickerTargetType;
    id: string;
    beatmapCondition?: IWeightBeatmapCondition;
    scoreCondition?: IWeightScoreCondition;
    historyCondition?: IWeightHistoryCondition;
}

export interface IWishlistEntry {
    label?: string;
    priority?: number;
    enabled?: boolean;
    conditions: IWishlistConditionItem[];
}

export interface IPickerFilterSettings {
    general?: { [key: string]: any };
    subFilter?: { [key: string]: any };
    collection?: string;
}

export interface IPickerAdvancedSettings {
    weights: IWeightEntry[];
    wishlist: IWishlistEntry[];
}

export interface IPickerHistory {
    beatmapId: number;
    md5Hash?: string;
    title: string;
    artist?: string;
    songTitle?: string;
    difficultyName?: string;
    creatorName?: string;
    pickedAt: number;
    beatmapData?: Partial<Omit<OsuBeatmap, "lastPlayedTime">> & { lastPlayedTime?: string; playerTags?: string[] };
}

export interface IPickerProfile {
    name: string;
    generalFilter: { [key: string]: any };
    subFilter?: { [key: string]: any };
    includedCollections: string[];
    excludedCollections: string[];
    advancedSettings: IPickerAdvancedSettings;
}
