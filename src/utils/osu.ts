import type { RespBeatmapLookup } from "../api/v2/types/api_resp";
import { BeatmapCollection, LazerBeatmap, LazerMod, LazerScore } from "../defines/lazer_structs";
import {
    StableBeatmapFilter,
    StableBeatmapIndex,
    StableScore,
    StableScoreBeatmapData,
} from "../defines/stable_structs";
import { IOsuCollection, OsuClients } from "../defines/types";
import g from "../renderer/state";
import { getUseLazerModeExperiment } from "./experiments";
import __ from "./i18n";
import { createLogger } from "./logger";
import { readAllWithOffset, yieldToMain } from "./reader";
import { ConfigKey } from "./typed/config";
import { I18nStrings } from "./typed/i18n";

const PAGE_SIZE = 500;

const log = createLogger("uOsu");

export type OsuBeatmap = {
    beatmapId: number;
    beatmapSetId: number;
    md5Hash: string;
    artist: string;
    artistUnicode: string;
    songTitle: string;
    songTitleUnicode: string;
    creatorName: string;
    difficultyName: string;
    osuStandardGrade: number;
    rankedStatus: number;
    numCircles: number;
    numSliders: number;
    numSpinners: number;
    drainSeconds: number;
    ar: number;
    cs: number;
    hp: number;
    od: number;
    sliderMultiplier: number;
    stackLeniency: number;
    mode: number;
    unplayed: boolean;
    lastPlayedTime: Date;
    tags: string;
    source: string;
    srStd: number;
    srTaiko: number;
    srCtb: number;
    srMania: number;
    totalMilliseconds?: number;
    bpm?: number;
    /**
     * False when `numCircles` / `numSliders` / `numSpinners` are placeholders
     * (e.g. a lazer map whose stored `.osu` could not be read or parsed).
     */
    objectCountsAvailable?: boolean;
    _onlineOnly?: boolean;
    _contentHash?: string;
    _coverUrl?: string;
};

export type OsuScore = StableScore & {
    _accuracy?: number;
    _pp?: number;
    _lazer?: boolean;
    _lazerMods?: LazerMod[];
    _grade?: string;
    _legacyTotalScore?: number;
    _maxObjectCount?: number;
};

const LAZER_RANK_TO_GRADE: Record<number, string> = {
    [-1]: "F",
    0: "D",
    1: "C",
    2: "B",
    3: "A",
    4: "S",
    5: "SH",
    6: "SS",
    7: "SSH",
};

export const GRADE_ORDER = ["SS", "SSH", "S", "SH", "A", "B", "C", "D"];

export const GRADE_COLORS: Record<string, string> = {
    SS: "#cd1b9c",
    SSH: "#cd1b9c",
    S: "#16b5c2",
    SH: "#16b5c2",
    A: "#83d430",
    B: "#e2b03e",
    C: "#e9784e",
    D: "#dd474d",
    F: "#dd474d",
};

export function normalizeRank(rank: string): string {
    if (rank === "X" || rank === "XH") return rank === "XH" ? "SSH" : "SS";
    return rank;
}

export function formatApiMods(mods: unknown[]): string {
    if (!mods.length) return "-";
    return mods
        .map((m) => (typeof m === "string" ? m : ((m as { acronym?: string }).acronym ?? JSON.stringify(m))))
        .join(", ");
}

export function getNativeStarRating(map: {
    mode: number;
    srStd: number;
    srTaiko: number;
    srCtb: number;
    srMania: number;
}): number {
    switch (map.mode) {
        case 1:
            return map.srTaiko;
        case 2:
            return map.srCtb;
        case 3:
            return map.srMania;
        default:
            return map.srStd;
    }
}

export function calculateAccuracy(
    s: { count300: number; count100: number; count50: number; countMiss: number; _accuracy?: number },
    unit: "percent" | "ratio" = "percent",
): number {
    let acc: number;
    if (s._accuracy !== undefined) {
        acc = s._accuracy;
    } else {
        const total = s.count300 + s.count100 + s.count50 + s.countMiss;
        acc = total > 0 ? ((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100 : 0;
    }
    return unit === "ratio" ? acc / 100 : acc;
}

const MOD_HD = 8;
const MOD_FL = 1024;

export function calcGrade(s: {
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    mods?: number;
    _grade?: string;
}): string {
    if (s._grade) return s._grade;
    const total = s.count300 + s.count100 + s.count50 + s.countMiss;
    if (total === 0) return "D";
    const r300 = s.count300 / total;
    const r50 = s.count50 / total;
    const hasSilverMod = s.mods !== undefined && ((s.mods & MOD_HD) !== 0 || (s.mods & MOD_FL) !== 0);
    if (r300 === 1) return hasSilverMod ? "SSH" : "SS";
    if (r300 > 0.9 && r50 <= 0.01 && s.countMiss === 0) return hasSilverMod ? "SH" : "S";
    if ((r300 > 0.8 && s.countMiss === 0) || r300 > 0.9) return "A";
    if ((r300 > 0.7 && s.countMiss === 0) || r300 > 0.8) return "B";
    if (r300 > 0.6) return "C";
    return "D";
}

const LAZER_MOD_FLAGS: Record<string, number> = {
    NF: 1,
    EZ: 2,
    TD: 4,
    HD: 8,
    HR: 16,
    SD: 32,
    DT: 64,
    RX: 128,
    HT: 256,
    NC: 512,
    FL: 1024,
    AT: 2048,
    SO: 4096,
    AP: 8192,
    PF: 16384,
    "4K": 32768,
    "5K": 65536,
    "6K": 131072,
    "7K": 262144,
    "8K": 524288,
    FI: 1048576,
    RD: 2097152,
    CN: 4194304,
    TP: 8388608,
    "9K": 16777216,
    DS: 33554432,
    "1K": 67108864,
    "3K": 134217728,
    "2K": 268435456,
    SV2: 536870912,
    MR: 1073741824,
};

const MOD_FLAGS_ENTRIES = Object.entries(LAZER_MOD_FLAGS).sort(([, a], [, b]) => a - b) as [string, number][];

export function getModAcronyms(mods: number): string[] {
    if (mods === 0) return [];
    return MOD_FLAGS_ENTRIES.filter(([, bit]) => (mods & bit) !== 0).map(([name]) => name);
}

function parseLazerMods(modsJson: string | undefined): { mods: number; modsData: LazerMod[] } {
    if (!modsJson) return { mods: 0, modsData: [] };
    try {
        const arr = JSON.parse(modsJson);
        if (!Array.isArray(arr)) return { mods: 0, modsData: [] };
        let flags = 0;
        const modsData: LazerMod[] = [];
        for (const mod of arr) {
            const raw = typeof mod === "string" ? { acronym: mod } : mod;
            const acronym = raw?.acronym ?? raw?.Acronym;
            if (!acronym) continue;
            const settings = raw?.settings ?? raw?.Settings;
            const normalized: LazerMod = { acronym };
            if (settings && typeof settings === "object") {
                normalized.settings = settings as Record<string, unknown>;
            }
            modsData.push(normalized);
            flags |= LAZER_MOD_FLAGS[acronym] ?? 0;
        }
        return { mods: flags, modsData };
    } catch {
        return { mods: 0, modsData: [] };
    }
}

export function isLegacyLazerScore(ls: LazerScore): boolean {
    if (ls.IsLegacyScore) return true;
    return parseLazerMods(ls.Mods).modsData.some((m) => m.acronym === "CL");
}

function parseMaxObjectCount(maxStatsJson: string | undefined, rulesetId: number): number {
    if (!maxStatsJson) return 0;
    try {
        const s = JSON.parse(maxStatsJson);
        switch (rulesetId) {
            case 0:
                return (s.great ?? 0) + (s.ok ?? 0) + (s.meh ?? 0) + (s.miss ?? 0);
            case 1:
                return (s.great ?? 0) + (s.ok ?? 0) + (s.miss ?? 0);
            case 2:
                return (
                    (s.great ?? 0) +
                    (s.large_tick_hit ?? 0) +
                    (s.small_tick_hit ?? 0) +
                    (s.miss ?? 0) +
                    (s.large_tick_miss ?? 0) +
                    (s.small_tick_miss ?? 0)
                );
            case 3:
                return (s.perfect ?? 0) + (s.great ?? 0) + (s.good ?? 0) + (s.ok ?? 0) + (s.meh ?? 0) + (s.miss ?? 0);
            default:
                return 0;
        }
    } catch {
        return 0;
    }
}

/**
 * Convert a Score V2 (standardised, max 1,000,000) total to a ballpark "classic" Score V1 total.
 * Ported from osu.Game.Scoring.Legacy.ScoreInfoExtensions.convertStandardisedToClassic.
 * Coefficients are least-squares fits over all beatmaps; mania returns the input unchanged.
 */
export function convertStandardisedToClassic(
    rulesetId: number,
    standardisedTotalScore: number,
    objectCount: number,
): number {
    switch (rulesetId) {
        case 0:
            return Math.round(((objectCount ** 2 * 32.57 + 100000) * standardisedTotalScore) / 1000000);
        case 1:
            return Math.round(((objectCount * 1109 + 100000) * standardisedTotalScore) / 1000000);
        case 2:
            return Math.round(
                ((standardisedTotalScore / 1000000) * objectCount) ** 2 * 21.62 + standardisedTotalScore / 10,
            );
        default:
            return standardisedTotalScore;
    }
}

export function makeScoreDedupKey(md5Hash: string, totalScore: number, date: Date, maxCombo: number): string {
    return `${md5Hash}-${totalScore}-${date.getTime()}-${maxCombo}`;
}

export function apiRankedStatusToStable(apiRanked: number): number {
    switch (apiRanked) {
        case 1:
            return 4;
        case 2:
            return 5;
        case 3:
            return 6;
        case 4:
            return 7;
        case 0:
        case -1:
        case -2:
            return 2;
        default:
            return 0;
    }
}

export function apiBeatmapToOsuBeatmap(b: RespBeatmapLookup): OsuBeatmap {
    const mode = b.mode_int ?? 0;
    const owner = b.owners?.find((o) => o.id === b.user_id);
    const creator = owner?.username ?? b.beatmapset.creator;
    const starRating = b.difficulty_rating ?? 0;

    return {
        beatmapId: b.id,
        beatmapSetId: b.beatmapset_id,
        md5Hash: b.checksum,
        artist: b.beatmapset.artist,
        artistUnicode: b.beatmapset.artist_unicode,
        songTitle: b.beatmapset.title,
        songTitleUnicode: b.beatmapset.title_unicode,
        creatorName: creator,
        difficultyName: b.version,
        osuStandardGrade: 0,
        rankedStatus: apiRankedStatusToStable(b.ranked),
        numCircles: b.count_circles,
        numSliders: b.count_sliders,
        numSpinners: b.count_spinners,
        drainSeconds: b.hit_length,
        ar: b.ar,
        cs: b.cs,
        hp: b.drain,
        od: b.accuracy,
        sliderMultiplier: 0,
        stackLeniency: 0,
        mode,
        unplayed: b.current_user_playcount === 0,
        lastPlayedTime: new Date(0),
        tags: b.beatmapset.tags,
        source: b.beatmapset.source,
        srStd: mode === 0 ? starRating : 0,
        srTaiko: mode === 1 ? starRating : 0,
        srCtb: mode === 2 ? starRating : 0,
        srMania: mode === 3 ? starRating : 0,
        totalMilliseconds: b.total_length * 1000,
        bpm: b.bpm,
        _coverUrl: b.beatmapset.covers.card,
    };
}

import { parseLazerStatistics } from "../shared/utils/lazerStats";
import { lazerBeatmapToOsuBeatmap } from "../shared/utils/osuConvert";

export function lazerScoreToOsuScore(s: LazerScore): OsuScore {
    const rulesetId = s.Ruleset?.OnlineID ?? 0;
    const hits = parseLazerStatistics(s.Statistics, rulesetId);
    const maxObjectCount = parseMaxObjectCount(s.MaximumStatistics, rulesetId);
    const { mods, modsData } = parseLazerMods(s.Mods);
    return {
        ruleset: rulesetId,
        version: s.TotalScoreVersion,
        md5Hash: s.BeatmapInfo?.MD5Hash ?? s.BeatmapHash ?? "",
        userName: s.User?.Username ?? "",
        count300: hits.count300,
        count100: hits.count100,
        count50: hits.count50,
        countGeki: hits.countGeki,
        countKatu: hits.countKatu,
        countMiss: hits.countMiss,
        totalScore: s.TotalScore,
        maxCombo: s.MaxCombo,
        perfect: s.Combo === s.MaxCombo && s.MaxCombo > 0,
        mods,
        date: s.Date,
        compressedReplay: 0,
        legacyOnlineID: s.LegacyOnlineID?.toString() ?? "",
        additionalModData: null,
        _accuracy: s.Accuracy * 100,
        _pp: s.PP,
        _lazer: true,
        _lazerMods: modsData,
        _grade: LAZER_RANK_TO_GRADE[s.Rank] ?? undefined,
        _legacyTotalScore: s.LegacyTotalScore,
        _maxObjectCount: maxObjectCount,
    };
}

export function buildBeatmapLookup(beatmaps: OsuBeatmap[]): Map<string, OsuBeatmap> {
    const m = new Map<string, OsuBeatmap>();
    for (const b of beatmaps) {
        if (b.md5Hash) m.set(b.md5Hash, b);
        if (b._contentHash && b._contentHash !== b.md5Hash) m.set(b._contentHash, b);
    }
    return m;
}

function hasBeatmapFilter(filter?: StableBeatmapFilter): filter is StableBeatmapFilter {
    return !!filter && Object.keys(filter).length > 0;
}

function lazerSpecFromBeatmapFilter(filter?: StableBeatmapFilter): Record<string, unknown> {
    if (!filter) return {};
    return {
        title: filter.title,
        rankStatuses: filter.rankStatuses,
        starRatingMin: filter.starRatingMin,
        starRatingMax: filter.starRatingMax,
        modes: filter.modes,
        includedHashes: filter.includedHashes,
        excludedHashes: filter.excludedHashes,
    };
}

function stableDedupKeysFromScores(stableScoresMap: Map<string, OsuScore[]>): string[] {
    const stableDedupKeys: string[] = [];
    stableScoresMap.forEach((scores, hash) => {
        for (const s of scores) {
            stableDedupKeys.push(makeScoreDedupKey(hash, s.totalScore, s.date, s.maxCombo));
        }
    });
    return stableDedupKeys;
}

function uniqueHashes(values: Iterable<string | undefined>): string[] {
    const hashes = new Set<string>();
    for (const value of values) {
        if (value) hashes.add(value);
    }
    return Array.from(hashes);
}

export interface FlatScore {
    md5Hash: string;
    userName: string;
    date: Date;
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    totalScore: number;
    maxCombo: number;
    mods: number;
    ruleset: number;
    beatmap: OsuBeatmap | undefined;
    _accuracy?: number;
    _pp?: number;
    _lazer?: boolean;
    _lazerMods?: LazerMod[];
    _grade?: string;
    _legacyTotalScore?: number;
    _maxObjectCount?: number;
}

export function flattenScoreMap(
    scoresMap: Map<string, OsuScore[]>,
    beatmapLookup: Map<string, OsuBeatmap>,
): FlatScore[] {
    const flat: FlatScore[] = [];
    scoresMap.forEach((scores, md5Hash) => {
        for (const s of scores) {
            flat.push({
                md5Hash,
                userName: s.userName,
                date: s.date,
                count300: s.count300,
                count100: s.count100,
                count50: s.count50,
                countMiss: s.countMiss,
                totalScore: s.totalScore,
                maxCombo: s.maxCombo,
                mods: s.mods,
                ruleset: s.ruleset,
                beatmap: beatmapLookup.get(md5Hash),
                _accuracy: s._accuracy,
                _pp: s._pp,
                _lazer: s._lazer,
                _lazerMods: s._lazerMods,
                _grade: s._grade,
                _legacyTotalScore: s._legacyTotalScore,
                _maxObjectCount: s._maxObjectCount,
            });
        }
    });
    return flat;
}

export type DataUpdateType = "beatmaps" | "scores" | "collections";
type DataUpdateCallback = () => void;

export interface ScoreLookupOptions {
    watchLazer?: boolean;
}

class OsuDataManager {
    private _stablePath: string | null = null;
    private _lazerPath: string | null = null;
    private _stableReady = false;
    private _stableInitPromise: Promise<void> | null = null;
    private _lazerReady = false;
    private _lazerInitPromise: Promise<void> | null = null;
    private _watching = false;
    private _backgroundRefreshing = false;
    private _dirtyBeatmaps = false;
    private _dirtyScores = false;
    private _dirtyCollections = false;
    private _subscribers = new Map<DataUpdateType, Set<DataUpdateCallback>>([
        ["beatmaps", new Set()],
        ["scores", new Set()],
        ["collections", new Set()],
    ]);

    private _beatmaps: OsuBeatmap[] | null = null;
    private _scores: Map<string, OsuScore[]> | null = null;
    private _stableCollections: IOsuCollection[] | null = null;
    private _lazerCollections: IOsuCollection[] | null = null;
    private _lazerBeatmaps: OsuBeatmap[] | null = null;
    private _lazerBeatmapsPromise: Promise<OsuBeatmap[]> | null = null;
    private _lazerScoresByHash: Map<string, OsuScore[]> | null = null;
    private _lazerScoresPromise: Promise<Map<string, OsuScore[]>> | null = null;
    private _lazerWatching = false;
    private _stableBeatmapsUnsub?: () => void;
    private _stableScoresUnsub?: () => void;
    private _stableCollectionsUnsub?: () => void;
    private _lazerScoresUnsub?: () => void;
    private _beatmapIndex: StableBeatmapIndex[] | null = null;
    private _beatmapsPromise: Promise<OsuBeatmap[]> | null = null;
    private _scoresPromise: Promise<Map<string, OsuScore[]>> | null = null;
    private _collectionsPromise: Promise<IOsuCollection[]> | null = null;

    private _resetStable() {
        this._stableBeatmapsUnsub?.();
        this._stableScoresUnsub?.();
        this._stableCollectionsUnsub?.();
        this._stableBeatmapsUnsub = undefined;
        this._stableScoresUnsub = undefined;
        this._stableCollectionsUnsub = undefined;
        this._watching = false;
        this._stableReady = false;
        this._stableInitPromise = null;
        this._beatmaps = null;
        this._scores = null;
        this._stableCollections = null;
        this._beatmapIndex = null;
        this._beatmapsPromise = null;
        this._scoresPromise = null;
        this._collectionsPromise = null;
    }

    private _resetLazer() {
        this._lazerScoresUnsub?.();
        this._lazerScoresUnsub = undefined;
        this._lazerWatching = false;
        this._lazerReady = false;
        this._lazerInitPromise = null;
        this._lazerCollections = null;
        this._lazerBeatmaps = null;
        this._lazerBeatmapsPromise = null;
        this._lazerScoresByHash = null;
        this._lazerScoresPromise = null;
        this._beatmaps = null;
        this._beatmapsPromise = null;
    }

    private async _ensureStable(): Promise<boolean> {
        const path = (g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "").trim();
        if (this._stablePath !== path) {
            this._stablePath = path;
            this._resetStable();
        }
        if (path.length === 0) return false;
        if (!this._stableReady) {
            if (!this._stableInitPromise) {
                this._stableInitPromise = (async () => {
                    await window.olsCore.initStableReader(path);
                    this._stableReady = true;
                    this._stableInitPromise = null;
                })();
            }
            await this._stableInitPromise;
        }
        return true;
    }

    private get _lazerEnabled(): boolean {
        return (g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "").trim().length > 0 && getUseLazerModeExperiment();
    }

    private _syncLazerPath(): string {
        const path = (g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "").trim();
        if (this._lazerPath !== path) {
            this._lazerPath = path;
            this._resetLazer();
        }
        return path;
    }

    async ensureLazer(): Promise<boolean> {
        const path = this._syncLazerPath();
        if (path.length === 0) return false;
        if (!this._lazerReady) {
            if (!this._lazerInitPromise) {
                this._lazerInitPromise = (async () => {
                    await window.olsCore.initReader(path);
                    this._lazerReady = true;
                    this._lazerInitPromise = null;
                })();
            }
            await this._lazerInitPromise;
        }
        return true;
    }

    get hasData(): boolean {
        return this._beatmaps !== null;
    }

    get isStableReady(): boolean {
        return this._stableReady;
    }

    private async _ensureWatching(): Promise<boolean> {
        if (!(await this._ensureStable())) return false;
        if (this._watching) return true;
        await window.olsCore.startStableWatch();
        this._stableBeatmapsUnsub = window.olsCore.onStableBeatmapsChanged(this._onBeatmapsChanged);
        this._stableScoresUnsub = window.olsCore.onStableScoresChanged(this._onScoresChanged);
        this._stableCollectionsUnsub = window.olsCore.onStableCollectionsChanged(this._onCollectionsChanged);
        this._watching = true;
        return true;
    }

    private async _ensureLazerWatch(): Promise<boolean> {
        if (!(await this.ensureLazer())) return false;
        if (this._lazerWatching) return true;
        await window.olsCore.startLazerWatch();
        this._lazerScoresUnsub = window.olsCore.onLazerScoresChanged(this._onLazerScoresChanged);
        this._lazerWatching = true;
        return true;
    }

    private _onLazerScoresChanged = () => {
        this._lazerScoresByHash = null;
        this._lazerScoresPromise = null;
        this._notifyType("scores");
    };

    /**
     * Subscribe to data updates of a specific type.
     * If there is already pending dirty data for this type, the callback will be
     * called immediately (after the current refresh loop finishes or on next tick).
     * Returns an unsubscribe function.
     */
    subscribe(type: DataUpdateType, fn: DataUpdateCallback): () => void {
        this._subscribers.get(type)?.add(fn);
        // If there's already dirty data for this type that was deferred, flush it now
        const hasPending =
            (type === "beatmaps" && this._dirtyBeatmaps) ||
            (type === "scores" && this._dirtyScores) ||
            (type === "collections" && this._dirtyCollections);
        if (hasPending && !this._backgroundRefreshing) {
            void this._runRefreshLoop();
        }
        return () => this.unsubscribe(type, fn);
    }

    unsubscribe(type: DataUpdateType, fn: DataUpdateCallback) {
        this._subscribers.get(type)?.delete(fn);
    }

    private _notifyType(type: DataUpdateType) {
        this._subscribers.get(type)?.forEach((fn) => {
            fn();
        });
    }

    private _hasSubscribers(type: DataUpdateType): boolean {
        return (this._subscribers.get(type)?.size ?? 0) > 0;
    }

    private _onBeatmapsChanged = () => {
        this._dirtyBeatmaps = true;
        this._runRefreshLoop();
    };

    private _onScoresChanged = () => {
        this._dirtyScores = true;
        this._lazerScoresByHash = null;
        this._lazerScoresPromise = null;
        this._runRefreshLoop();
    };

    private _onCollectionsChanged = () => {
        this._dirtyCollections = true;
        this._runRefreshLoop();
    };

    private _flushBeatmapDirty() {
        if (!this._dirtyBeatmaps || this._beatmapsPromise) return;
        this._dirtyBeatmaps = false;
        this._beatmaps = null;
        this._beatmapIndex = null;
    }

    private async _runRefreshLoop() {
        if (this._backgroundRefreshing) return;
        this._backgroundRefreshing = true;
        let showedLoading = false;
        try {
            while (this._dirtyBeatmaps || this._dirtyScores || this._dirtyCollections) {
                if (this._dirtyBeatmaps) {
                    if (!this._hasSubscribers("beatmaps")) {
                        // no subscriber yet — keep dirty, will flush when one subscribes
                    } else {
                        this._dirtyBeatmaps = false;
                        this._beatmaps = null;
                        this._beatmapIndex = null;
                        g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                        showedLoading = true;
                        await yieldToMain();
                        log.info("getBeatmaps start");
                        const _t0b = Date.now();
                        await this.getBeatmaps();
                        log.info(`getBeatmaps done in ${Date.now() - _t0b}ms`);
                        g.setLoading(false);
                        this._notifyType("beatmaps");
                    }
                }
                if (this._dirtyScores) {
                    if (!this._hasSubscribers("scores")) {
                        // no subscriber yet — keep dirty, will flush when one subscribes
                    } else {
                        this._dirtyScores = false;
                        this._scores = null;
                        g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_SCORES));
                        showedLoading = true;
                        await yieldToMain();
                        log.info("getScores start");
                        const _t0s = Date.now();
                        await this.getScores();
                        log.info(`getScores done in ${Date.now() - _t0s}ms`);
                        g.setLoading(false);
                        this._notifyType("scores");
                    }
                }
                if (this._dirtyCollections) {
                    if (!this._hasSubscribers("collections")) {
                        // no subscriber yet — keep dirty, will flush when one subscribes
                    } else {
                        this._dirtyCollections = false;
                        this._stableCollections = null;
                        g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_COLLECTIONS));
                        showedLoading = true;
                        await yieldToMain();
                        await this.getCollections();
                        g.setLoading(false);
                        this._notifyType("collections");
                    }
                }
                // if all remaining dirty types have no subscribers, stop looping
                const allDeferred =
                    (!this._dirtyBeatmaps || !this._hasSubscribers("beatmaps")) &&
                    (!this._dirtyScores || !this._hasSubscribers("scores")) &&
                    (!this._dirtyCollections || !this._hasSubscribers("collections"));
                if (allDeferred) break;
            }
        } finally {
            this._backgroundRefreshing = false;
            // Only clear the global loading if this loop actually showed it —
            // otherwise it would kill loading owned by other flows.
            if (showedLoading) g.setLoading(false);
        }
    }

    async init(): Promise<void> {
        await this._ensureWatching();
        await this.getBeatmaps();
        await this.getCollections();
    }

    /**
     * Stable-only beatmap read for the picker's "stable" source: bypasses the
     * shared `_beatmaps` cache and never merges lazer beatmaps, so other
     * interfaces keep their merged behavior while the picker stays separate.
     */
    async getStableBeatmapsOnly(): Promise<OsuBeatmap[]> {
        if (!(await this._ensureWatching())) return [];
        return await this._readStableBeatmaps();
    }

    private async _readStableBeatmaps(filter?: StableBeatmapFilter): Promise<OsuBeatmap[]> {
        const spec = filter ?? {};
        const first = await window.olsCore.queryStableBeatmaps(spec, 0, PAGE_SIZE);
        const all = await readAllWithOffset(
            (offset, limit) => window.olsCore.queryStableBeatmaps(spec, offset, limit),
            first,
        );
        return all.data as OsuBeatmap[];
    }

    async getBeatmaps(filter?: StableBeatmapFilter): Promise<OsuBeatmap[]> {
        const stableReady = await this._ensureWatching();
        this._syncLazerPath();
        this._flushBeatmapDirty();
        if (hasBeatmapFilter(filter) && !this._beatmaps) {
            const beatmaps = stableReady ? await this._readStableBeatmaps(filter) : [];
            if (this._lazerEnabled) {
                const existingHashes = new Set(beatmaps.map((b) => b.md5Hash));
                const lazerBeatmaps = await this.queryLazerBeatmaps(filter).catch(() => [] as OsuBeatmap[]);
                for (const lb of lazerBeatmaps) {
                    if (lb.md5Hash && !existingHashes.has(lb.md5Hash)) {
                        beatmaps.push(lb);
                        existingHashes.add(lb.md5Hash);
                    }
                }
            }
            return beatmaps;
        }
        if (!this._beatmaps) {
            if (!this._beatmapsPromise) {
                this._beatmapsPromise = (async () => {
                    log.info("IPC queryStableBeatmaps start");
                    const _t0 = Date.now();
                    const beatmaps = stableReady ? await this._readStableBeatmaps() : [];
                    log.info(`IPC queryStableBeatmaps done in ${Date.now() - _t0}ms, count: ${beatmaps.length}`);
                    if (this._lazerEnabled) {
                        const existingHashes = new Set(beatmaps.map((b) => b.md5Hash));
                        const lazerBeatmaps = await this.queryLazerBeatmaps().catch(() => [] as OsuBeatmap[]);
                        for (const lb of lazerBeatmaps) {
                            if (lb.md5Hash && !existingHashes.has(lb.md5Hash)) {
                                beatmaps.push(lb);
                                existingHashes.add(lb.md5Hash);
                            }
                        }
                        log.info(`Merged ${lazerBeatmaps.length} lazer beatmaps, total: ${beatmaps.length}`);
                    }
                    this._beatmaps = beatmaps;
                    this._beatmapsPromise = null;
                    return this._beatmaps;
                })();
            }
            const result = await this._beatmapsPromise;
            if (!filter || Object.keys(filter).length === 0) {
                return result;
            }
            return applyBeatmapFilter(result, filter);
        }
        if (!filter || Object.keys(filter).length === 0) {
            return this._beatmaps;
        }
        return applyBeatmapFilter(this._beatmaps, filter);
    }

    async getScores(): Promise<Map<string, OsuScore[]>> {
        if (!(await this._ensureWatching())) return new Map();
        if (!this._scores) {
            if (!this._scoresPromise) {
                this._scoresPromise = (async () => {
                    const map = new Map<string, OsuScore[]>();
                    const raw = await window.olsCore.getScores(OsuClients.Stable, 0, PAGE_SIZE);
                    if (!("error" in raw)) {
                        const all = await readAllWithOffset(
                            async (offset, limit) =>
                                (await window.olsCore.getScores(OsuClients.Stable, offset, limit)) as any,
                            raw,
                        );
                        let count = 0;
                        for (const s of all.data as StableScoreBeatmapData[]) {
                            map.set(s.md5Hash, s.scores);
                            if (++count % 500 === 0) await yieldToMain();
                        }
                    }
                    this._scores = map;
                    this._scoresPromise = null;
                    return this._scores;
                })();
            }
            return this._scoresPromise;
        }
        return this._scores;
    }

    async getScoresByUser(userName: string, dateRange?: [Date, Date]): Promise<Map<string, OsuScore[]>> {
        const stableReady = await this._ensureWatching();
        const map = new Map<string, OsuScore[]>();
        const from = dateRange?.[0]?.valueOf();
        const to = dateRange?.[1]?.valueOf();

        if (stableReady) {
            const stableFirst = await window.olsCore.queryStableScoresByUser(userName, from, to, 0, PAGE_SIZE);
            if (!("error" in stableFirst)) {
                const stableAll = await readAllWithOffset(
                    async (offset, limit) => window.olsCore.queryStableScoresByUser(userName, from, to, offset, limit),
                    stableFirst,
                );
                let count = 0;
                for (const d of stableAll.data as StableScoreBeatmapData[]) {
                    if (!d.md5Hash || !d.scores || d.scores.length === 0) continue;
                    const arr = map.get(d.md5Hash);
                    if (arr) arr.push(...d.scores);
                    else map.set(d.md5Hash, [...d.scores]);
                    if (++count % 500 === 0) await yieldToMain();
                }
            }
        }

        if (this._lazerEnabled) {
            await this.ensureLazer();
            await this._ensureLazerWatch();
            const stableDedupKeys = stableDedupKeysFromScores(map);
            const lazerFirst = await window.olsCore.queryLazerScoresByUser(
                userName,
                from,
                to,
                stableDedupKeys,
                0,
                PAGE_SIZE,
            );
            if (!("error" in lazerFirst)) {
                const lazerAll = await readAllWithOffset(
                    async (offset, limit) =>
                        window.olsCore.queryLazerScoresByUser(userName, from, to, stableDedupKeys, offset, limit),
                    lazerFirst,
                );
                const dedupSet = new Set(stableDedupKeys);
                let count = 0;
                for (const ls of lazerAll.data.filter(Boolean) as LazerScore[]) {
                    const hash = ls.BeatmapInfo?.MD5Hash ?? ls.BeatmapHash;
                    if (!hash) continue;
                    if (ls.IsLegacyScore) {
                        const totalScore = ls.LegacyTotalScore ?? ls.TotalScore;
                        const dedupKey = `${hash}-${totalScore}-${new Date(ls.Date).getTime()}-${ls.MaxCombo}`;
                        if (dedupSet.has(dedupKey)) continue;
                    }
                    const converted = lazerScoreToOsuScore(ls);
                    const arr = map.get(hash);
                    if (arr) arr.push(converted);
                    else map.set(hash, [converted]);
                    if (++count % 500 === 0) await yieldToMain();
                }
            }
        }

        return map;
    }

    async queryStableScoresByHashes(userName: string | undefined, hashes: string[]): Promise<Map<string, OsuScore[]>> {
        const queryHashes = uniqueHashes(hashes);
        if (queryHashes.length === 0) return new Map();
        if (!(await this._ensureStable())) return new Map();
        const map = new Map<string, OsuScore[]>();
        const first = await window.olsCore.queryStableScoresByHashes(queryHashes, userName, 0, PAGE_SIZE);
        if ("error" in first) return map;
        const all = await readAllWithOffset(
            (offset, limit) => window.olsCore.queryStableScoresByHashes(queryHashes, userName, offset, limit),
            first,
        );
        for (const d of all.data as StableScoreBeatmapData[]) {
            if (!d.md5Hash || !d.scores || d.scores.length === 0) continue;
            const arr = map.get(d.md5Hash);
            if (arr) arr.push(...d.scores);
            else map.set(d.md5Hash, [...d.scores]);
        }
        return map;
    }

    async getScoresForMap(
        userName: string | undefined,
        hashes: string[],
        options: ScoreLookupOptions = {},
    ): Promise<Map<string, OsuScore[]>> {
        await this._ensureWatching();
        const stableByHash = await this.queryStableScoresByHashes(userName, hashes);
        const lazerByHash = await this.queryLazerScoresByHashes(stableByHash, hashes, options);
        const merged = new Map<string, OsuScore[]>(stableByHash);
        const userLower = userName?.toLowerCase();
        lazerByHash.forEach((scores, hash) => {
            const pickedScores = userLower ? scores.filter((s) => s.userName.toLowerCase() === userLower) : scores;
            if (pickedScores.length === 0) return;
            const existing = merged.get(hash);
            if (existing) merged.set(hash, [...existing, ...pickedScores]);
            else merged.set(hash, pickedScores);
        });
        return merged;
    }

    async getBeatmapsByHashes(hashes: string[]): Promise<OsuBeatmap[]> {
        if (hashes.length === 0) return [];
        const hashSet = [...new Set(hashes.filter(Boolean))];
        let beatmaps: OsuBeatmap[] = [];
        if (await this._ensureStable()) {
            const stableFirst = await window.olsCore.queryStableBeatmaps(
                { includedHashes: hashSet },
                0,
                Math.max(hashSet.length, PAGE_SIZE),
            );
            if (!("error" in stableFirst)) {
                const stableAll = await readAllWithOffset(
                    (offset, limit) => window.olsCore.queryStableBeatmaps({ includedHashes: hashSet }, offset, limit),
                    stableFirst,
                );
                beatmaps = stableAll.data as OsuBeatmap[];
            }
        }
        if (this._lazerEnabled) {
            const existing = new Set(beatmaps.map((b) => b.md5Hash));
            const lazerBeatmaps = await this.queryLazerBeatmaps({
                includedHashes: hashSet,
            }).catch(() => [] as OsuBeatmap[]);
            for (const lb of lazerBeatmaps) {
                if (lb.md5Hash && !existing.has(lb.md5Hash)) {
                    beatmaps.push(lb);
                    existing.add(lb.md5Hash);
                }
            }
        }
        return beatmaps;
    }

    async getStableUsers(): Promise<string[]> {
        if (!(await this._ensureWatching())) return [];
        return window.olsCore.queryStableUsers();
    }

    async getAllScoresMerged(): Promise<Map<string, OsuScore[]>> {
        await this._ensureWatching();
        const map = await this.getScores();
        if (!this._lazerEnabled) return new Map(map);

        if (!(await this.ensureLazer())) return new Map(map);
        await this._ensureLazerWatch();
        const lazerUsersResult = await window.olsCore.queryLazerUsers();
        const lazerUsers = lazerUsersResult.data as string[];
        if (lazerUsers.length === 0) return new Map(map);

        const merged = new Map(map);
        const stableDedupKeys = stableDedupKeysFromScores(merged);
        for (const userName of lazerUsers) {
            const first = await window.olsCore.queryLazerScoresByUser(
                userName,
                undefined,
                undefined,
                stableDedupKeys,
                0,
                PAGE_SIZE,
            );
            if ("error" in first) continue;
            const all = await readAllWithOffset(
                (offset, limit) =>
                    window.olsCore.queryLazerScoresByUser(
                        userName,
                        undefined,
                        undefined,
                        stableDedupKeys,
                        offset,
                        limit,
                    ),
                first,
            );
            let count = 0;
            const dedupSet = new Set(stableDedupKeys);
            for (const ls of all.data.filter(Boolean) as LazerScore[]) {
                const hash = ls.BeatmapInfo?.MD5Hash ?? ls.BeatmapHash;
                if (!hash) continue;
                if (ls.IsLegacyScore) {
                    const totalScore = ls.LegacyTotalScore ?? ls.TotalScore;
                    const dedupKey = `${hash}-${totalScore}-${new Date(ls.Date).getTime()}-${ls.MaxCombo}`;
                    if (dedupSet.has(dedupKey)) continue;
                }
                const converted = lazerScoreToOsuScore(ls);
                const arr = merged.get(hash);
                if (arr) arr.push(converted);
                else merged.set(hash, [converted]);
                if (++count % 500 === 0) await yieldToMain();
            }
        }
        return merged;
    }

    async getCollections(): Promise<IOsuCollection[]> {
        if (!(await this._ensureWatching())) return [];
        if (!this._stableCollections) {
            if (!this._collectionsPromise) {
                this._collectionsPromise = (async () => {
                    let cols = await window.olsCore.getCollections(OsuClients.Stable, 0, PAGE_SIZE);
                    cols = await readAllWithOffset(
                        (offset, limit) => window.olsCore.getCollections(OsuClients.Stable, offset, limit),
                        cols,
                    );
                    this._stableCollections = cols.data as IOsuCollection[];
                    this._collectionsPromise = null;
                    return this._stableCollections;
                })();
            }
            return this._collectionsPromise;
        }
        return this._stableCollections;
    }

    async getLazerCollections(): Promise<IOsuCollection[]> {
        if (!this._lazerEnabled) return [];
        if (!(await this.ensureLazer())) return [];
        if (!this._lazerCollections) {
            let cols = await window.olsCore.getCollections(OsuClients.Lazer, 0, PAGE_SIZE);
            cols = await readAllWithOffset(
                (offset, limit) => window.olsCore.getCollections(OsuClients.Lazer, offset, limit),
                cols,
            );
            this._lazerCollections = (cols.data as BeatmapCollection[]).map((c) => ({
                name: c.Name,
                maps: c.BeatmapMD5Hashes,
            }));
        }
        return this._lazerCollections;
    }

    async queryLazerBeatmaps(filter?: StableBeatmapFilter): Promise<OsuBeatmap[]> {
        if (!this._lazerEnabled) return [];
        if (!(await this.ensureLazer())) return [];
        if (hasBeatmapFilter(filter)) {
            const spec = lazerSpecFromBeatmapFilter(filter);
            const first = await window.olsCore.queryLazerBeatmaps(spec, 0, PAGE_SIZE);
            const all = await readAllWithOffset(
                (offset, limit) => window.olsCore.queryLazerBeatmaps(spec, offset, limit),
                first,
            );
            return (all.data as LazerBeatmap[]).map(lazerBeatmapToOsuBeatmap);
        }
        if (!this._lazerBeatmaps) {
            if (!this._lazerBeatmapsPromise) {
                this._lazerBeatmapsPromise = (async () => {
                    log.info("IPC queryLazerBeatmaps start");
                    const _t0 = Date.now();
                    const first = await window.olsCore.queryLazerBeatmaps({}, 0, PAGE_SIZE);
                    const result = await readAllWithOffset(
                        (offset, limit) => window.olsCore.queryLazerBeatmaps({}, offset, limit),
                        first,
                    );
                    log.info(`IPC queryLazerBeatmaps done in ${Date.now() - _t0}ms, count: ${result.data.length}`);
                    const list: OsuBeatmap[] = [];
                    for (const b of result.data as LazerBeatmap[]) {
                        list.push(lazerBeatmapToOsuBeatmap(b));
                    }
                    this._lazerBeatmaps = list;
                    this._lazerBeatmapsPromise = null;
                    return this._lazerBeatmaps;
                })();
            }
            return this._lazerBeatmapsPromise;
        }
        return this._lazerBeatmaps;
    }

    async queryLazerBeatmapSetIds(beatmapSetIds: number[]): Promise<Set<number>> {
        if (!this._lazerEnabled || beatmapSetIds.length === 0) {
            return new Set();
        }
        try {
            if (!(await this.ensureLazer())) return new Set();
            await this._ensureLazerWatch();
            const result = await window.olsCore.queryLazerBeatmaps({
                beatmapSetIds,
                returnSetIds: true,
            });
            return new Set(result.data as number[]);
        } catch {
            return new Set();
        }
    }

    async queryLazerScoresByHashes(
        stableScoresMap: Map<string, OsuScore[]>,
        hashes: string[],
        options: ScoreLookupOptions = {},
    ): Promise<Map<string, OsuScore[]>> {
        const queryHashes = uniqueHashes(hashes);
        if (!this._lazerEnabled || queryHashes.length === 0) return new Map();
        try {
            if (!(await this.ensureLazer())) return new Map();
            if (options.watchLazer !== false) await this._ensureLazerWatch();
            const stableDedupKeys = stableDedupKeysFromScores(stableScoresMap);
            const byHash = new Map<string, OsuScore[]>();
            const HASH_BATCH = 500;
            for (let i = 0; i < queryHashes.length; i += HASH_BATCH) {
                const batch = queryHashes.slice(i, i + HASH_BATCH);
                const result = await window.olsCore.queryLazerScoresByHashes(batch, stableDedupKeys);
                for (const ls of result.data as LazerScore[]) {
                    const hash = ls.BeatmapInfo?.MD5Hash ?? ls.BeatmapHash;
                    if (!hash) continue;
                    const converted = lazerScoreToOsuScore(ls);
                    const arr = byHash.get(hash);
                    if (arr) arr.push(converted);
                    else byHash.set(hash, [converted]);
                }
            }
            return byHash;
        } catch {
            return new Map();
        }
    }

    async getBeatmapIndex(): Promise<StableBeatmapIndex[]> {
        if (!(await this._ensureStable())) return [];
        this._flushBeatmapDirty();
        if (!this._beatmapIndex) {
            let idx = await window.olsCore.getStableBeatmapIndex();
            idx = await readAllWithOffset((offset, limit) => window.olsCore.getStableBeatmapIndex(offset, limit), idx);
            this._beatmapIndex = idx.data as StableBeatmapIndex[];
        }
        return this._beatmapIndex;
    }

    async queryLazerScoresByUser(stableScoresMap: Map<string, OsuScore[]>): Promise<Map<string, OsuScore[]>> {
        this._syncLazerPath();
        if (this._lazerScoresByHash) return this._lazerScoresByHash;
        if (this._lazerScoresPromise) return this._lazerScoresPromise;
        if (!this._lazerEnabled) return new Map();
        this._lazerScoresPromise = (async () => {
            try {
                if (!(await this.ensureLazer())) return new Map();
                await this._ensureLazerWatch();
                const lazerUsersResult = await window.olsCore.queryLazerUsers();
                const lazerUsers = lazerUsersResult.data as string[];
                if (lazerUsers.length === 0) {
                    this._lazerScoresByHash = new Map();
                    this._lazerScoresPromise = null;
                    return this._lazerScoresByHash;
                }
                const stableDedupKeys = stableDedupKeysFromScores(stableScoresMap);
                const byHash = new Map<string, OsuScore[]>();
                for (const userName of lazerUsers) {
                    const result = await window.olsCore.queryLazerScoresByUser(
                        userName,
                        undefined,
                        undefined,
                        stableDedupKeys,
                    );
                    for (const ls of result.data as LazerScore[]) {
                        const hash = ls.BeatmapInfo?.MD5Hash ?? ls.BeatmapHash;
                        if (!hash) continue;
                        const converted = lazerScoreToOsuScore(ls);
                        const arr = byHash.get(hash);
                        if (arr) arr.push(converted);
                        else byHash.set(hash, [converted]);
                    }
                }
                this._lazerScoresByHash = byHash;
                this._lazerScoresPromise = null;
                return this._lazerScoresByHash;
            } catch {
                this._lazerScoresByHash = new Map();
                this._lazerScoresPromise = null;
                return this._lazerScoresByHash;
            }
        })();
        return this._lazerScoresPromise;
    }

    invalidateData() {
        this._beatmaps = null;
        this._scores = null;
        this._stableCollections = null;
        this._beatmapIndex = null;
        this._lazerCollections = null;
        this._lazerBeatmaps = null;
        this._lazerBeatmapsPromise = null;
        this._lazerScoresByHash = null;
        this._lazerScoresPromise = null;
        this._beatmapsPromise = null;
        this._scoresPromise = null;
        this._collectionsPromise = null;
    }

    invalidate() {
        this._stablePath = null;
        this._lazerPath = null;
        this._resetStable();
        this._resetLazer();
    }
}

function applyBeatmapFilter(maps: OsuBeatmap[], filter: StableBeatmapFilter): OsuBeatmap[] {
    let result = maps;
    if (filter.includedHashes?.length) {
        const set = new Set(filter.includedHashes);
        result = result.filter((m) => set.has(m.md5Hash));
    }
    if (filter.excludedHashes?.length) {
        const set = new Set(filter.excludedHashes);
        result = result.filter((m) => !set.has(m.md5Hash));
    }
    if (filter.title) {
        const t = filter.title.toLowerCase();
        result = result.filter(
            (m) => m.songTitle.toLowerCase().includes(t) || m.songTitleUnicode.toLowerCase().includes(t),
        );
    }
    if (filter.rankStatuses?.length) {
        const set = new Set(filter.rankStatuses);
        result = result.filter((m) => set.has(m.rankedStatus));
    }
    if (filter.starRatingMin != null) {
        const min = filter.starRatingMin;
        result = result.filter(
            (m) => (m.mode === 1 ? m.srTaiko : m.mode === 2 ? m.srCtb : m.mode === 3 ? m.srMania : m.srStd) >= min,
        );
    }
    if (filter.starRatingMax != null) {
        const max = filter.starRatingMax;
        result = result.filter(
            (m) => (m.mode === 1 ? m.srTaiko : m.mode === 2 ? m.srCtb : m.mode === 3 ? m.srMania : m.srStd) <= max,
        );
    }
    if (filter.modes?.length) {
        const set = new Set(filter.modes);
        result = result.filter((m) => set.has(m.mode));
    }
    return result;
}

export const OsuData = new OsuDataManager();
