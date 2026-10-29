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
import { preparePickerHistoryEntryForSave } from "./pickerHistorySerialization";
import { lastPlayedMs, NO_SCORES, resolvePlayState, type ScoreSummary, summarizeScores } from "./playState";

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

export function pickerDateTimestamp(value: string, endOfDay = false): number {
    const trimmed = value.trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const date = new Date(dateOnly ? `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00"}` : trimmed);
    if (dateOnly) {
        const [year, month, day] = trimmed.split("-").map(Number);
        if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return NaN;
    }
    return date.getTime();
}

export function isValidPickerDateCondition(op: string, value: string): boolean {
    if (op === DateCondition.Before || op === DateCondition.After) return Number.isFinite(pickerDateTimestamp(value));
    if (op === DateCondition.Between) {
        const [from = "", to = ""] = value.split("~");
        const start = pickerDateTimestamp(from);
        const end = pickerDateTimestamp(to, true);
        return Number.isFinite(start) && Number.isFinite(end) && start <= end;
    }
    return op === DateCondition.WithinSecs && Number.isFinite(Number(value)) && Number(value) > 0;
}

export const evalDateCond = (date: Date, op: string, value: string, now = Date.now()): boolean => {
    const t = date?.getTime();
    if (!Number.isFinite(t) || !isValidPickerDateCondition(op, value)) return false;
    if (op === DateCondition.Before) return t < pickerDateTimestamp(value);
    if (op === DateCondition.After) return t > pickerDateTimestamp(value);
    if (op === DateCondition.Between) {
        const [from = "", to = ""] = value.split("~");
        return t >= pickerDateTimestamp(from) && t <= pickerDateTimestamp(to, true);
    }
    return op === DateCondition.WithinSecs && t <= now && now - t <= Number(value) * 1000;
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

const playStateOf = (m: OsuBeatmap, scores: ScoreSummary) =>
    resolvePlayState({ unplayed: m.unplayed, storedLastPlayedMs: lastPlayedMs(m.lastPlayedTime) }, scores);

export const matchesBeatmapCond = (
    m: OsuBeatmap,
    cond: IWeightBeatmapCondition,
    onlineTagsCache?: Map<number, string[]>,
    now = Date.now(),
    scores: ScoreSummary = NO_SCORES,
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
        case BeatmapDataField.DifficultyName:
            return evalStringCond(m.difficultyName, operator as StringCondition, value);
        case BeatmapDataField.RankedStatus:
            return evalNumberCond(m.rankedStatus, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.DrainSeconds:
            return evalNumberCond(m.drainSeconds, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Tags:
            return evalStringCond(m.tags, operator as StringCondition, value);
        case BeatmapDataField.Unplayed: {
            // Unknown flag with no score evidence matches neither boolean;
            // positive scores alone resolve the candidate as played.
            if (typeof m.unplayed !== "boolean" && scores.count <= 0) return false;
            const unplayed = !playStateOf(m, scores).played;
            return unplayed === (operator === BoolCondition.IsTrue);
        }
        case BeatmapDataField.LastPlayedTime: {
            const at = playStateOf(m, scores).lastPlayedMs;
            // Never played has no date to compare, so it matches no date condition.
            return evalDateCond(new Date(at > 0 ? at : Number.NaN), operator, value, now);
        }
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

const HISTORY_BEATMAP_FIELDS: Record<BeatmapDataField, keyof OsuBeatmap> = {
    [BeatmapDataField.Id]: "beatmapId",
    [BeatmapDataField.SetId]: "beatmapSetId",
    [BeatmapDataField.Artist]: "artist",
    [BeatmapDataField.Title]: "songTitle",
    [BeatmapDataField.Creator]: "creatorName",
    [BeatmapDataField.DifficultyName]: "difficultyName",
    [BeatmapDataField.RankedStatus]: "rankedStatus",
    [BeatmapDataField.DrainSeconds]: "drainSeconds",
    [BeatmapDataField.Tags]: "tags",
    [BeatmapDataField.Unplayed]: "unplayed",
    [BeatmapDataField.LastPlayedTime]: "lastPlayedTime",
    [BeatmapDataField.AR]: "ar",
    [BeatmapDataField.CS]: "cs",
    [BeatmapDataField.HP]: "hp",
    [BeatmapDataField.OD]: "od",
    [BeatmapDataField.Stack]: "stackLeniency",
    [BeatmapDataField.SV]: "sliderMultiplier",
    [BeatmapDataField.PlayerTags]: "beatmapId",
};

export const CANDIDATE_SAME_OPERATOR = "same_as_candidate";

export const CANDIDATE_COMPARABLE_FIELDS: ReadonlySet<BeatmapDataField> = new Set([
    BeatmapDataField.SetId,
    BeatmapDataField.Artist,
    BeatmapDataField.Title,
    BeatmapDataField.Creator,
    BeatmapDataField.DifficultyName,
    BeatmapDataField.Tags,
]);

export const isCandidateComparableField = (field: BeatmapDataField): boolean => CANDIDATE_COMPARABLE_FIELDS.has(field);

export function createPickerHistoryEntry(map: OsuBeatmap, pickedAt: number, playerTags?: string[]): IPickerHistory {
    const lastPlayed = map.lastPlayedTime ? new Date(map.lastPlayedTime) : undefined;
    return preparePickerHistoryEntryForSave({
        beatmapId: map.beatmapId,
        md5Hash: map.md5Hash,
        title: `${map.artist} - ${map.songTitle} [${map.difficultyName}]`,
        artist: map.artist,
        songTitle: map.songTitle,
        difficultyName: map.difficultyName,
        creatorName: map.creatorName,
        pickedAt,
        beatmapData: {
            ...(map._onlineOnly
                ? { beatmapSetId: map.beatmapSetId, rankedStatus: map.rankedStatus }
                : {
                      ...map,
                      lastPlayedTime:
                          lastPlayed && Number.isFinite(lastPlayed.getTime()) ? lastPlayed.toISOString() : undefined,
                  }),
            playerTags: playerTags ? [...playerTags] : undefined,
        },
    });
}

function historyEntryData(entry: IPickerHistory): Record<string, unknown> {
    const legacy = entry.title.match(/^(.+) - (.+) \[(.+)\]$/);
    const snapshot = entry.beatmapData;
    return {
        ...snapshot,
        beatmapId: entry.beatmapId,
        artist: snapshot?.artist ?? entry.artist ?? legacy?.[1],
        songTitle: snapshot?.songTitle ?? entry.songTitle ?? legacy?.[2],
        difficultyName: snapshot?.difficultyName ?? entry.difficultyName ?? legacy?.[3],
        creatorName: snapshot?.creatorName ?? entry.creatorName,
        lastPlayedTime: snapshot?.lastPlayedTime ? new Date(snapshot.lastPlayedTime) : undefined,
    };
}

function comparableFieldValue(field: BeatmapDataField, raw: unknown): string | undefined {
    if (field === BeatmapDataField.SetId || field === BeatmapDataField.Id) {
        const id = Number(raw);
        return Number.isInteger(id) && id > 0 ? String(id) : undefined;
    }
    if (typeof raw !== "string") return undefined;
    const text = raw.trim().toLowerCase();
    return text.length > 0 ? text : undefined;
}

function historyComparableValue(entry: IPickerHistory, field: BeatmapDataField): string | undefined {
    const key = HISTORY_BEATMAP_FIELDS[field];
    return key ? comparableFieldValue(field, historyEntryData(entry)[key as string]) : undefined;
}

function candidateComparableValue(map: OsuBeatmap, field: BeatmapDataField): string | undefined {
    const key = HISTORY_BEATMAP_FIELDS[field];
    return key ? comparableFieldValue(field, (map as unknown as Record<string, unknown>)[key as string]) : undefined;
}

export function createHistoryMatcher(
    history: IPickerHistory[],
    cond: IWeightHistoryCondition,
    onlineTagsCache?: Map<number, string[]>,
    now = Date.now(),
    scoresByHash?: ReadonlyMap<string, OsuScore[]>,
): (map: OsuBeatmap) => boolean {
    const { operator, value, timeCondition, beatmapCondition } = cond;
    if (!Object.values(HistoryCondition).includes(operator)) return () => false;
    if (timeCondition && !isValidPickerDateCondition(timeCondition.operator, timeCondition.value)) return () => false;
    const limited = operator === HistoryCondition.WithinLast || operator === HistoryCondition.NotWithinLast;
    const records = limited ? history.slice(-Math.max(1, parseInt(value, 10) || 1)) : history;
    const negative = operator === HistoryCondition.NotAppeared || operator === HistoryCondition.NotWithinLast;

    if (beatmapCondition?.operator === CANDIDATE_SAME_OPERATOR) {
        const field = beatmapCondition.field;
        if (!CANDIDATE_COMPARABLE_FIELDS.has(field)) return () => false;
        const values = new Set<string>();
        for (const entry of records) {
            if (
                timeCondition &&
                !evalDateCond(new Date(entry.pickedAt), timeCondition.operator, timeCondition.value, now)
            )
                continue;
            const comparable = historyComparableValue(entry, field);
            if (comparable !== undefined) values.add(comparable);
        }
        return (map) => {
            const comparable = candidateComparableValue(map, field);
            const appeared = comparable !== undefined && values.has(comparable);
            return negative ? !appeared : appeared;
        };
    }

    const ids = new Set<number>();
    const hashes = new Set<string>();
    const localHashes = new Set<string>();
    for (const entry of records) {
        if (timeCondition && !evalDateCond(new Date(entry.pickedAt), timeCondition.operator, timeCondition.value, now))
            continue;
        const hash = entry.md5Hash?.trim().toLowerCase();
        if (entry.beatmapId > 0) ids.add(entry.beatmapId);
        else if (hash) localHashes.add(hash);
        if (hash) hashes.add(hash);
    }
    const childUsesPlayState =
        beatmapCondition !== undefined &&
        (beatmapCondition.field === BeatmapDataField.Unplayed ||
            beatmapCondition.field === BeatmapDataField.LastPlayedTime);
    return (map) => {
        const hash = map.md5Hash?.trim().toLowerCase() ?? "";
        const appeared = map.beatmapId > 0 ? ids.has(map.beatmapId) || localHashes.has(hash) : hashes.has(hash);
        if (negative ? appeared : !appeared) return false;
        if (!beatmapCondition) return true;
        return matchesBeatmapCond(
            map,
            beatmapCondition,
            onlineTagsCache,
            now,
            childUsesPlayState ? summarizeScores(scoresByHash?.get(map.md5Hash)) : NO_SCORES,
        );
    };
}

export const matchesHistoryCond = (
    m: OsuBeatmap,
    history: IPickerHistory[],
    cond: IWeightHistoryCondition,
    onlineTagsCache?: Map<number, string[]>,
    scoresByHash?: ReadonlyMap<string, OsuScore[]>,
): boolean => createHistoryMatcher(history, cond, onlineTagsCache, Date.now(), scoresByHash)(m);

export const buildWeightedPool = (
    maps: OsuBeatmap[],
    advanced: IPickerAdvancedSettings,
    collectionMaps: Map<string, Set<string>>,
    scoresByHash: Map<string, OsuScore[]>,
    history: IPickerHistory[],
    onlineTagsCache?: Map<number, string[]>,
    now = Date.now(),
): { map: OsuBeatmap; weight: number }[] => {
    const historyMatchers = new Map<IWeightHistoryCondition, (map: OsuBeatmap) => boolean>();
    for (const entry of advanced.weights) {
        if (entry.enabled !== false && entry.type === PickerTargetType.History && entry.historyCondition) {
            historyMatchers.set(
                entry.historyCondition,
                createHistoryMatcher(history, entry.historyCondition, onlineTagsCache, now, scoresByHash),
            );
        }
    }
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
                match = matchesBeatmapCond(
                    m,
                    entry.beatmapCondition,
                    onlineTagsCache,
                    now,
                    summarizeScores(scoresByHash.get(m.md5Hash)),
                );
            } else if (entry.type === PickerTargetType.ScoreRecord && entry.scoreCondition) {
                match = matchesScoreCond(m, scoresByHash, entry.scoreCondition);
            } else if (entry.type === PickerTargetType.History && entry.historyCondition) {
                match = historyMatchers.get(entry.historyCondition)?.(m) ?? false;
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
    now = Date.now(),
): OsuBeatmap[] => {
    if (advanced.wishlist.length === 0) return [];
    const historyMatchers = new Map<IWeightHistoryCondition, (map: OsuBeatmap) => boolean>();
    for (const entry of advanced.wishlist) {
        if (entry.enabled === false) continue;
        for (const cond of entry.conditions) {
            if (cond.type === PickerTargetType.History && cond.historyCondition) {
                historyMatchers.set(
                    cond.historyCondition,
                    createHistoryMatcher(history, cond.historyCondition, onlineTagsCache, now, scoresByHash),
                );
            }
        }
    }

    const matchesCondItem = (m: OsuBeatmap, cond: (typeof advanced.wishlist)[0]["conditions"][0]): boolean => {
        if (cond.type === PickerTargetType.Map) return String(m.beatmapId) === cond.id;
        if (cond.type === PickerTargetType.Set) return String(m.beatmapSetId) === cond.id;
        if (cond.type === PickerTargetType.Collection) {
            const hashes = collectionMaps.get(cond.id);
            return !!hashes?.has(m.md5Hash);
        }
        if (cond.type === PickerTargetType.BeatmapData && cond.beatmapCondition) {
            return matchesBeatmapCond(
                m,
                cond.beatmapCondition,
                onlineTagsCache,
                now,
                summarizeScores(scoresByHash.get(m.md5Hash)),
            );
        }
        if (cond.type === PickerTargetType.ScoreRecord && cond.scoreCondition) {
            return matchesScoreCond(m, scoresByHash, cond.scoreCondition);
        }
        if (cond.type === PickerTargetType.History && cond.historyCondition) {
            return historyMatchers.get(cond.historyCondition)?.(m) ?? false;
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
