import type { RespUserMostPlayedBeatmap } from "../../api/v2/types/api_resp";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { StableLocalBeatmapStatus } from "../../defines/stable_structs";
import { FilterType, SubFilterType, TFilterSetting } from "../../renderer/components/beatmapFilter";
import { OsuBeatmap } from "../../utils/osu";

export interface BeatmapFilterAccessor {
    beatmapId: number;
    md5Hash: string;
    songTitle: string;
    songTitleUnicode: string;
    rankedStatus: number;
    mode: number;
    srStd: number;
    srTaiko: number;
    srCtb: number;
    srMania: number;
    _onlineOnly: boolean;
    playCount: number;
    languageId: number;
}

export interface BeatmapFilterOptions {
    playerTagBeatmapIds: Set<number> | null;
    includedHashes: Set<string> | null;
    excludedHashes: Set<string> | null;
    subFilter: Partial<Record<FilterType, SubFilterType>>;
}

const RANKED_STATUS_TO_LOCAL: Record<string, number> = {
    [RankedStatus.Graveyard]: StableLocalBeatmapStatus.Unsubmitted,
    [RankedStatus.WIP]: StableLocalBeatmapStatus.Unranked,
    [RankedStatus.Pending]: StableLocalBeatmapStatus.Unranked,
    [RankedStatus.Ranked]: StableLocalBeatmapStatus.Ranked,
    [RankedStatus.Approved]: StableLocalBeatmapStatus.Approved,
    [RankedStatus.Qualified]: StableLocalBeatmapStatus.Qualified,
    [RankedStatus.Loved]: StableLocalBeatmapStatus.Loved,
};

export function create_osu_beatmap_accessor(m: OsuBeatmap): BeatmapFilterAccessor {
    return {
        beatmapId: m.beatmapId,
        md5Hash: m.md5Hash,
        songTitle: m.songTitle ?? "",
        songTitleUnicode: m.songTitleUnicode ?? "",
        rankedStatus: m.rankedStatus,
        mode: m.mode,
        srStd: m.srStd,
        srTaiko: m.srTaiko,
        srCtb: m.srCtb,
        srMania: m.srMania,
        _onlineOnly: m._onlineOnly ?? false,
        playCount: 0,
        languageId: -1,
    };
}

export function create_api_beatmap_accessor(m: RespUserMostPlayedBeatmap): BeatmapFilterAccessor {
    const statusStr = m.beatmapset.status as string;
    const rankedStatus = RANKED_STATUS_TO_LOCAL[statusStr] ?? StableLocalBeatmapStatus.Unknown;
    const modeMap: Record<string, number> = { osu: 0, taiko: 1, fruits: 2, mania: 3 };
    const mode = modeMap[m.beatmap.mode] ?? 0;
    const dr = m.beatmap.difficulty_rating;
    return {
        beatmapId: m.beatmap_id,
        md5Hash: "",
        songTitle: m.beatmapset.title ?? "",
        songTitleUnicode: m.beatmapset.title_unicode ?? "",
        rankedStatus,
        mode,
        srStd: dr,
        srTaiko: dr,
        srCtb: dr,
        srMania: dr,
        _onlineOnly: true,
        playCount: m.count,
        languageId: m.beatmapset.language_id,
    };
}

function get_effective_sr(a: BeatmapFilterAccessor, modes: Set<number> | null): number {
    const native = a.mode === 1 ? a.srTaiko : a.mode === 2 ? a.srCtb : a.mode === 3 ? a.srMania : a.srStd;
    if (!modes || modes.size === 0 || modes.has(a.mode)) return native;
    if (a.mode === 0) {
        if (modes.has(1)) return a.srTaiko;
        if (modes.has(2)) return a.srCtb;
        if (modes.has(3)) return a.srMania;
    }
    return native;
}

function is_all_or_includes(values: any[], target: number): boolean {
    return values.includes("all") || values.includes(target);
}

export function apply_beatmap_filter(
    a: BeatmapFilterAccessor,
    filter: TFilterSetting,
    opts: BeatmapFilterOptions,
): boolean {
    if (a.beatmapId === 0) return false;

    const titleQ = filter[FilterType.Title] ? (filter[FilterType.Title] as string).toLowerCase() : null;
    if (titleQ) {
        const title = a.songTitle.toLowerCase();
        const titleU = a.songTitleUnicode.toLowerCase();
        if (!title.includes(titleQ) && !titleU.includes(titleQ)) return false;
    }

    const rankLocalRaw = filter[FilterType.RankStateLocal];
    const rankOnlineRaw = filter[FilterType.RankState];
    if (rankLocalRaw) {
        const rankVals = rankLocalRaw as Array<number | "all">;
        if (!rankVals.includes("all") && !rankVals.includes(a.rankedStatus)) return false;
    } else if (rankOnlineRaw) {
        const rankVals = rankOnlineRaw as Array<string | "all">;
        if (!rankVals.includes("all")) {
            const localStatuses = rankVals
                .filter((v) => v !== "all")
                .map((v) => RANKED_STATUS_TO_LOCAL[v] ?? StableLocalBeatmapStatus.Unknown);
            if (!localStatuses.includes(a.rankedStatus)) return false;
        }
    }

    const modeRaw = filter[FilterType.Mode];
    if (modeRaw) {
        const modeVals = modeRaw as Array<number | "all">;
        if (!modeVals.includes("all")) {
            const modeSet = new Set(modeVals.map(Number));
            if (!(modeSet.has(a.mode) || a.mode === 0)) return false;
        }
    }

    if (filter[FilterType.StarRating]) {
        const sr = filter[FilterType.StarRating] as [number, number];
        const srSubFilter = opts.subFilter[FilterType.StarRating];
        const modeSet = modeRaw && !modeRaw.includes("all") ? new Set((modeRaw as number[]).map(Number)) : null;
        const eSR = get_effective_sr(a, modeSet);

        if (srSubFilter !== undefined) {
            const target = sr[0];
            const targetStr = String(target);
            const dotIdx = targetStr.indexOf(".");
            const decimals = dotIdx === -1 ? 0 : targetStr.length - dotIdx - 1;
            const factor = 10 ** decimals;
            const roundedSR = Math.round(eSR * factor) / factor;
            if (srSubFilter === SubFilterType.Greater && !(roundedSR >= target)) return false;
            if (srSubFilter === SubFilterType.Equal && roundedSR !== target) return false;
            if (srSubFilter === SubFilterType.Less && !(roundedSR <= target)) return false;
        } else {
            const [min = 0, max = 15] = sr;
            if ((min !== 0 || max !== 15) && (eSR < min || eSR > max)) return false;
        }
    }

    if (filter[FilterType.PlayCount] != null) {
        const pc = Number(filter[FilterType.PlayCount]) || 0;
        const pcfs = opts.subFilter[FilterType.PlayCount] ?? SubFilterType.Greater;
        if (
            !(pcfs === SubFilterType.Greater
                ? a.playCount >= pc
                : pcfs === SubFilterType.Equal
                  ? a.playCount === pc
                  : a.playCount <= pc)
        )
            return false;
    }

    if (filter[FilterType.Language] != null) {
        const las = filter[FilterType.Language] as Array<number | "all">;
        if (!is_all_or_includes(las, a.languageId)) return false;
    }

    if (opts.playerTagBeatmapIds && !opts.playerTagBeatmapIds.has(a.beatmapId)) return false;

    if (opts.includedHashes && !opts.includedHashes.has(a.md5Hash)) return false;
    if (opts.excludedHashes?.has(a.md5Hash)) return false;

    return true;
}
