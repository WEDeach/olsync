import { BeatmapCollection } from "../defines/lazer_structs";
import {
    StableBeatmapFilter,
    StableBeatmapIndex,
    StableScore,
    StableScoreBeatmapData,
} from "../defines/stable_structs";
import { IOsuCollection, OsuClients } from "../defines/types";
import { IPC_RD_NAMES } from "../entrypoint/js/ipc/ns";
import g from "../renderer/state";
import __ from "./i18n";
import { readAllWithOffset, yieldToMain } from "./reader";
import { ConfigKey } from "./typed/config";
import { I18nStrings } from "./typed/i18n";

const PAGE_SIZE = 500;

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
};

export type OsuScore = StableScore;

type DataUpdateCallback = () => void;

class OsuDataManager {
    private _stablePath: string | null = null;
    private _lazerPath: string | null = null;
    private _stableReady = false;
    private _lazerReady = false;
    private _watching = false;
    private _backgroundRefreshing = false;
    private _dirtyBeatmaps = false;
    private _dirtyScores = false;
    private _dirtyCollections = false;
    private _subscribers = new Set<DataUpdateCallback>();

    private _beatmaps: OsuBeatmap[] | null = null;
    private _scores: Map<string, OsuScore[]> | null = null;
    private _stableCollections: IOsuCollection[] | null = null;
    private _lazerCollections: IOsuCollection[] | null = null;
    private _beatmapIndex: StableBeatmapIndex[] | null = null;

    private _resetStable() {
        if (this._watching) {
            window.olsCore.removeListener(IPC_RD_NAMES.STABLE_BEATMAPS_CHANGED, this._onBeatmapsChanged);
            window.olsCore.removeListener(IPC_RD_NAMES.STABLE_SCORES_CHANGED, this._onScoresChanged);
            window.olsCore.removeListener(IPC_RD_NAMES.STABLE_COLLECTIONS_CHANGED, this._onCollectionsChanged);
            this._watching = false;
        }
        this._stableReady = false;
        this._beatmaps = null;
        this._scores = null;
        this._stableCollections = null;
        this._beatmapIndex = null;
    }

    private _resetLazer() {
        this._lazerReady = false;
        this._lazerCollections = null;
    }

    private async _ensureStable() {
        const path = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
        if (this._stablePath !== path) {
            this._stablePath = path;
            this._resetStable();
        }
        if (!this._stableReady) {
            await window.olsCore.initStableReader(path);
            this._stableReady = true;
        }
    }

    private async _ensureLazer() {
        const path = g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";
        if (this._lazerPath !== path) {
            this._lazerPath = path;
            this._resetLazer();
        }
        if (!this._lazerReady) {
            await window.olsCore.initReader(path);
            this._lazerReady = true;
        }
    }

    get hasData(): boolean {
        return this._beatmaps !== null;
    }

    subscribe(fn: DataUpdateCallback) {
        this._subscribers.add(fn);
    }

    unsubscribe(fn: DataUpdateCallback) {
        this._subscribers.delete(fn);
    }

    private _notify() {
        this._subscribers.forEach((fn) => {
            fn();
        });
    }

    private _onBeatmapsChanged = () => {
        this._dirtyBeatmaps = true;
        this._runRefreshLoop();
    };

    private _onScoresChanged = () => {
        this._dirtyScores = true;
        this._runRefreshLoop();
    };

    private _onCollectionsChanged = () => {
        this._dirtyCollections = true;
        this._runRefreshLoop();
    };

    private async _runRefreshLoop() {
        if (this._backgroundRefreshing) return;
        this._backgroundRefreshing = true;
        try {
            while (this._dirtyBeatmaps || this._dirtyScores || this._dirtyCollections) {
                if (this._dirtyBeatmaps) {
                    this._dirtyBeatmaps = false;
                    this._beatmaps = null;
                    this._beatmapIndex = null;
                    g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                    await yieldToMain();
                    await this.getBeatmaps();
                }
                if (this._dirtyScores) {
                    this._dirtyScores = false;
                    this._scores = null;
                    g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_SCORES));
                    await yieldToMain();
                    await this.getScores();
                }
                if (this._dirtyCollections) {
                    this._dirtyCollections = false;
                    this._stableCollections = null;
                    g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_COLLECTIONS));
                    await yieldToMain();
                    await this.getCollections();
                }
            }
            this._notify();
        } finally {
            this._backgroundRefreshing = false;
            g.setLoading(false);
        }
    }

    async init(): Promise<void> {
        await this._ensureStable();
        if (!this._watching) {
            await window.olsCore.startStableWatch();
            window.olsCore.on(IPC_RD_NAMES.STABLE_BEATMAPS_CHANGED, this._onBeatmapsChanged);
            window.olsCore.on(IPC_RD_NAMES.STABLE_SCORES_CHANGED, this._onScoresChanged);
            window.olsCore.on(IPC_RD_NAMES.STABLE_COLLECTIONS_CHANGED, this._onCollectionsChanged);
            this._watching = true;
        }
        await this.getBeatmaps();
        await this.getScores();
        await this.getCollections();
    }

    async getBeatmaps(filter?: StableBeatmapFilter): Promise<OsuBeatmap[]> {
        await this._ensureStable();
        if (!this._beatmaps) {
            const first = await window.olsCore.queryStableBeatmaps({}, 0, PAGE_SIZE);
            const all = await readAllWithOffset(
                (offset, limit) => window.olsCore.queryStableBeatmaps({}, offset, limit),
                first,
            );
            this._beatmaps = all.data as OsuBeatmap[];
        }
        if (!filter || Object.keys(filter).length === 0) {
            return this._beatmaps;
        }
        return applyBeatmapFilter(this._beatmaps, filter);
    }

    async getScores(): Promise<Map<string, OsuScore[]>> {
        await this._ensureStable();
        if (!this._scores) {
            const raw = await window.olsCore.getScores(OsuClients.Stable, 0, PAGE_SIZE);
            const map = new Map<string, OsuScore[]>();
            if (!("error" in raw)) {
                const all = await readAllWithOffset(
                    async (offset, limit) => (await window.olsCore.getScores(OsuClients.Stable, offset, limit)) as any,
                    raw,
                );
                let count = 0;
                for (const s of all.data as StableScoreBeatmapData[]) {
                    map.set(s.md5Hash, s.scores);
                    if (++count % 500 === 0) await yieldToMain();
                }
            }
            this._scores = map;
        }
        return this._scores;
    }

    async getCollections(): Promise<IOsuCollection[]> {
        await this._ensureStable();
        if (!this._stableCollections) {
            let cols = await window.olsCore.getCollections(OsuClients.Stable, 0, PAGE_SIZE);
            cols = await readAllWithOffset(
                (offset, limit) => window.olsCore.getCollections(OsuClients.Stable, offset, limit),
                cols,
            );
            this._stableCollections = cols.data as IOsuCollection[];
        }
        return this._stableCollections;
    }

    async getLazerCollections(): Promise<IOsuCollection[]> {
        await this._ensureLazer();
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

    async getBeatmapIndex(): Promise<StableBeatmapIndex[]> {
        await this._ensureStable();
        if (!this._beatmapIndex) {
            let idx = await window.olsCore.getStableBeatmapIndex();
            idx = await readAllWithOffset((offset, limit) => window.olsCore.getStableBeatmapIndex(offset, limit), idx);
            this._beatmapIndex = idx.data as StableBeatmapIndex[];
        }
        return this._beatmapIndex;
    }

    invalidateData() {
        this._beatmaps = null;
        this._scores = null;
        this._stableCollections = null;
        this._beatmapIndex = null;
        this._lazerCollections = null;
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
