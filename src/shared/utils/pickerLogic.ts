/**
 * Pure picker evaluation logic shared by the renderer (stable roll) and the
 * main process (lazer backend roll). The only runtime imports are the picker
 * string enums (a self-contained, React-free module) and no renderer state.
 */

import type {
    IPickerAdvancedSettings,
    IPickerHistory,
    IWeightBeatmapCondition,
    IWeightHistoryCondition,
    IWeightScoreCondition,
    IWishlistConditionItem,
    IWishlistEntry,
} from "../../renderer/components/beatmapPickerTypes";
import {
    BeatmapDataField,
    BoolCondition,
    DateCondition,
    HistoryCondition,
    NumberCondition,
    PickerTargetType,
    ScoreRecordField,
    StringCondition,
} from "../../renderer/components/beatmapPickerTypes";
import type { OsuBeatmap, OsuScore } from "../../utils/osu";

export const evalStringCond = (value: string, op: StringCondition, target: string): boolean => {
    const v = (value ?? "").toLowerCase();
    const t = (target ?? "").toLowerCase();
    switch (op) {
        case StringCondition.Equals:
            return v === t;
        case StringCondition.Contains:
            return v.includes(t);
        case StringCondition.NotContains:
            return !v.includes(t);
        default:
            return false;
    }
};

export const evalNumberCond = (value: number, op: NumberCondition, target: number): boolean => {
    switch (op) {
        case NumberCondition.Equals:
            return value === target;
        case NumberCondition.Greater:
            return value > target;
        case NumberCondition.Less:
            return value < target;
        case NumberCondition.GreaterOrEqual:
            return value >= target;
        case NumberCondition.LessOrEqual:
            return value <= target;
        case NumberCondition.NotEquals:
            return value !== target;
        default:
            return false;
    }
};

export const evalDateCond = (date: Date, op: string, value: string): boolean => {
    if (!date) return false;
    const t = date.getTime();
    if (Number.isNaN(t)) return false;
    if (op === DateCondition.Before) return t < new Date(value).getTime();
    if (op === DateCondition.After) return t > new Date(value).getTime();
    if (op === DateCondition.Between) {
        const [from, to] = value.split("~");
        return t >= new Date(from?.trim() ?? "").getTime() && t <= new Date(`${to?.trim() ?? ""}T23:59:59`).getTime();
    }
    if (op === DateCondition.WithinSecs) return (Date.now() - t) / 1000 <= (parseInt(value, 10) || 0);
    return false;
};

export const get_effective_sr = (m: OsuBeatmap, modes: Set<number> | null): number => {
    const native = m.mode === 1 ? m.srTaiko : m.mode === 2 ? m.srCtb : m.mode === 3 ? m.srMania : m.srStd;
    if (!modes || modes.size === 0 || modes.has(m.mode)) return native;
    if (m.mode === 0) {
        if (modes.has(1)) return m.srTaiko;
        if (modes.has(2)) return m.srCtb;
        if (modes.has(3)) return m.srMania;
    }
    return native;
};

export const matchesBeatmapCond = (
    m: OsuBeatmap,
    cond: IWeightBeatmapCondition,
    onlineTagsCache?: Map<number, string[]>,
): boolean => {
    const { field, operator, value } = cond;
    switch (field) {
        case BeatmapDataField.Id:
            return evalNumberCond(m.beatmapId, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.SetId:
            return evalNumberCond(m.beatmapSetId, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Artist:
            return evalStringCond(m.artist, operator as StringCondition, value);
        case BeatmapDataField.Title:
            return evalStringCond(m.songTitle ?? "", operator as StringCondition, value);
        case BeatmapDataField.Creator:
            return evalStringCond(m.creatorName, operator as StringCondition, value);
        case BeatmapDataField.RankedStatus:
            return evalNumberCond(m.rankedStatus, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.DrainSeconds:
            return evalNumberCond(m.drainSeconds, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Tags:
            return evalStringCond(m.tags, operator as StringCondition, value);
        case BeatmapDataField.Unplayed:
            return m.unplayed === (operator === BoolCondition.IsTrue);
        case BeatmapDataField.LastPlayedTime:
            return evalDateCond(m.lastPlayedTime, operator, value);
        case BeatmapDataField.AR:
            return evalNumberCond(m.ar, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.CS:
            return evalNumberCond(m.cs, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.HP:
            return evalNumberCond(m.hp, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.OD:
            return evalNumberCond(m.od, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Stack:
            return evalNumberCond(m.stackLeniency, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.SV:
            return evalNumberCond(m.sliderMultiplier, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.PlayerTags: {
            const userTags = value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => t.toLowerCase());
            const mapTags = (onlineTagsCache?.get(m.beatmapId) ?? []).map((t) => t.toLowerCase());
            if (userTags.length === 0 || mapTags.length === 0) return false;
            const tagMatches = (userTag: string, onlineTag: string) => onlineTag.includes(userTag);
            switch (operator) {
                case StringCondition.Equals:
                    return (
                        userTags.every((ut) => mapTags.some((ot) => tagMatches(ut, ot))) &&
                        mapTags.every((ot) => userTags.some((ut) => tagMatches(ut, ot)))
                    );
                case StringCondition.Contains:
                    return userTags.some((ut) => mapTags.some((ot) => tagMatches(ut, ot)));
                case StringCondition.NotContains:
                    return !userTags.some((ut) => mapTags.some((ot) => tagMatches(ut, ot)));
                default:
                    return false;
            }
        }
        default:
            return false;
    }
};

export const matchesScoreCond = (
    m: OsuBeatmap,
    scoresByHash: Map<string, OsuScore[]>,
    cond: IWeightScoreCondition,
): boolean => {
    const sb = scoresByHash.get(m.md5Hash);
    if (!sb || sb.length === 0) return false;
    const s = sb.reduce((best, cur) => (cur.totalScore > best.totalScore ? cur : best));
    const { field, operator, value } = cond;
    switch (field) {
        case ScoreRecordField.UserName:
            return evalStringCond(s.userName ?? "", operator as StringCondition, value);
        case ScoreRecordField.Count300:
            return evalNumberCond(s.count300, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Count100:
            return evalNumberCond(s.count100, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Count50:
            return evalNumberCond(s.count50, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountGeki:
            return evalNumberCond(s.countGeki, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountKatu:
            return evalNumberCond(s.countKatu, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountMiss:
            return evalNumberCond(s.countMiss, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.MaxCombo:
            return evalNumberCond(s.maxCombo, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Perfect:
            return s.perfect === (operator === BoolCondition.IsTrue);
        case ScoreRecordField.Date:
            return evalDateCond(s.date ?? "", operator, value);
        default:
            return false;
    }
};

export const matchesHistoryCond = (
    m: OsuBeatmap,
    history: IPickerHistory[],
    cond: IWeightHistoryCondition,
): boolean => {
    const { operator, value } = cond;
    if (operator === HistoryCondition.Appeared) return history.some((h) => h.beatmapId === m.beatmapId);
    if (operator === HistoryCondition.NotAppeared) return !history.some((h) => h.beatmapId === m.beatmapId);
    const n = Math.max(1, parseInt(value, 10) || 1);
    const recent = history.slice(-n);
    const appeared = recent.some((h) => h.beatmapId === m.beatmapId);
    if (operator === HistoryCondition.WithinLast) return appeared;
    if (operator === HistoryCondition.NotWithinLast) return !appeared;
    return false;
};

export const buildWeightedPool = (
    maps: OsuBeatmap[],
    advanced: IPickerAdvancedSettings,
    collectionMaps: Map<string, Set<string>>,
    scoresByHash: Map<string, OsuScore[]>,
    history: IPickerHistory[],
    onlineTagsCache?: Map<number, string[]>,
): { map: OsuBeatmap; weight: number }[] => {
    return maps.map((m) => {
        let weight = 1;
        for (const entry of advanced.weights) {
            if (entry.enabled === false) continue;
            let match = false;
            if (entry.type === PickerTargetType.Map && String(m.beatmapId) === entry.id) {
                match = true;
            } else if (entry.type === PickerTargetType.Set && String(m.beatmapSetId) === entry.id) {
                match = true;
            } else if (entry.type === PickerTargetType.Collection) {
                const hashes = collectionMaps.get(entry.id);
                match = !!hashes?.has(m.md5Hash);
            } else if (entry.type === PickerTargetType.BeatmapData && entry.beatmapCondition) {
                match = matchesBeatmapCond(m, entry.beatmapCondition, onlineTagsCache);
            } else if (entry.type === PickerTargetType.ScoreRecord && entry.scoreCondition) {
                match = matchesScoreCond(m, scoresByHash, entry.scoreCondition);
            } else if (entry.type === PickerTargetType.History && entry.historyCondition) {
                match = matchesHistoryCond(m, history, entry.historyCondition);
            }
            if (match) weight *= entry.weight;
        }
        return { map: m, weight };
    });
};

export const normalizeWishlistEntry = (entry: any): IWishlistEntry => {
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

export const normalizeAdvancedSettings = (adv: IPickerAdvancedSettings): IPickerAdvancedSettings => ({
    ...adv,
    wishlist: Array.isArray(adv.wishlist) ? adv.wishlist.map(normalizeWishlistEntry) : [],
});

export const checkWishlist = (
    maps: OsuBeatmap[],
    advanced: IPickerAdvancedSettings,
    scoresByHash: Map<string, OsuScore[]>,
    collectionMaps: Map<string, Set<string>>,
    history: IPickerHistory[],
    onlineTagsCache?: Map<number, string[]>,
): OsuBeatmap[] => {
    if (advanced.wishlist.length === 0) return [];

    const matchesCondItem = (m: OsuBeatmap, cond: (typeof advanced.wishlist)[0]["conditions"][0]): boolean => {
        if (cond.type === PickerTargetType.Map) return String(m.beatmapId) === cond.id;
        if (cond.type === PickerTargetType.Set) return String(m.beatmapSetId) === cond.id;
        if (cond.type === PickerTargetType.Collection) {
            const hashes = collectionMaps.get(cond.id);
            return !!hashes?.has(m.md5Hash);
        }
        if (cond.type === PickerTargetType.BeatmapData && cond.beatmapCondition) {
            return matchesBeatmapCond(m, cond.beatmapCondition, onlineTagsCache);
        }
        if (cond.type === PickerTargetType.ScoreRecord && cond.scoreCondition) {
            return matchesScoreCond(m, scoresByHash, cond.scoreCondition);
        }
        if (cond.type === PickerTargetType.History && cond.historyCondition) {
            return matchesHistoryCond(m, history, cond.historyCondition);
        }
        return false;
    };

    const groups = new Map<number, typeof advanced.wishlist>();
    for (const entry of advanced.wishlist) {
        if (entry.enabled === false) continue;
        const p = entry.priority ?? 0;
        const arr = groups.get(p);
        if (arr) arr.push(entry);
        else groups.set(p, [entry]);
    }
    const sortedPriorities = [...groups.keys()].sort((a, b) => b - a);

    for (const priority of sortedPriorities) {
        const entries = groups.get(priority);
        if (!entries) continue;
        const matched = maps.filter((m) =>
            entries.some((entry) => entry.conditions.every((cond) => matchesCondItem(m, cond))),
        );
        if (matched.length > 0) return matched;
    }
    return [];
};

/** Plain weighted random pick (used by the backend lazer roll; no experiments). */
export const pickRandomWeighted = (pool: { map: OsuBeatmap; weight: number }[]): OsuBeatmap | undefined => {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    if (total <= 0) return undefined;
    let r = Math.random() * total;
    for (const p of pool) {
        r -= p.weight;
        if (r <= 0) return p.map;
    }
    return pool[pool.length - 1]?.map;
};
