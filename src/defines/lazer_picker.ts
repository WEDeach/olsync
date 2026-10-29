import type { IPickerHistory, IWeightEntry, IWishlistEntry } from "../renderer/components/beatmapPickerTypes";
import type { DateBounds } from "../shared/utils/beatmapFilterRules";
import type { OsuBeatmap } from "../utils/osu";
import type { LazerBeatmapQuerySpec, LazerLightweightBeatmap } from "./lazer_structs";

/**
 * Backend (main-process) lazer picker roll request. The renderer never sends
 * beatmap data — only filter spec, weight/wishlist conditions and roll history.
 */
export interface LazerRollRequest {
    spec: LazerBeatmapQuerySpec;
    weights: IWeightEntry[];
    wishlist: IWishlistEntry[];
    history: IPickerHistory[];
    /** Online DB tags for PlayerTags conditions (sent only when used). */
    onlineTags?: Array<[number, string[]]>;
    /** Star rating sub-filter (Greater/Equal/Less) requires pool-side evaluation. */
    srSubFilter?: { op: "greater" | "equal" | "less"; target: number };
    lastPlayedRange?: DateBounds;
    playedState?: "played" | "unplayed";
    mode: "count" | "preview" | "roll";
    previewLimit?: number;
}

export interface LazerPreviewRow {
    beatmap: LazerLightweightBeatmap;
    weight: number;
    probability: number;
}

export interface LazerRollResponse {
    /** Filtered pool size (stage 2). */
    poolCount: number;
    /** Pickable count after wishlist + weights (stage 3). */
    count: number;
    /** Preview mode: weighted pool rows, sorted by probability descending. */
    rows?: LazerPreviewRow[];
    /** Roll mode: the picked beatmap with full info. */
    picked?: OsuBeatmap;
}

/** Minimal OsuScore shape used by score conditions (backend evaluation). */
export interface LazerConditionScore {
    md5Hash: string;
    userName: string;
    count300: number;
    count100: number;
    count50: number;
    countGeki: number;
    countKatu: number;
    countMiss: number;
    totalScore: number;
    maxCombo: number;
    perfect: boolean;
    date: Date;
}
