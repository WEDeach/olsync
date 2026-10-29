/**
 * Beatmap conversions shared by the renderer and the main-process lazer roll.
 * No renderer/MobX imports — types only.
 */
import type { LazerBeatmap, LazerLightweightBeatmap } from "../../defines/lazer_structs";
import type { OsuBeatmap } from "../../utils/osu";

/** Accepts only finite, non-negative counts; anything else means "not available". */
function optionalCount(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function lazerBeatmapToOsuBeatmap(b: LazerBeatmap): OsuBeatmap {
    const d = b.Difficulty;
    const m = b.Metadata;
    const contentHash = b.Hash ?? "";
    const circles = optionalCount(b.CircleCount);
    const sliders = optionalCount(b.SliderCount);
    const spinners = optionalCount(b.SpinnerCount);
    // Only the dedicated detail read supplies all three; never fabricate them
    // from TotalObjectCount / EndTimeObjectCount.
    const objectCountsAvailable = circles !== undefined && sliders !== undefined && spinners !== undefined;
    return {
        beatmapId: b.OnlineID ?? 0,
        beatmapSetId: b.BeatmapSet?.OnlineID ?? 0,
        md5Hash: b.MD5Hash ?? b.Hash ?? b.OnlineMD5Hash ?? "",
        _contentHash: contentHash || undefined,
        artist: m?.Artist ?? "",
        artistUnicode: m?.ArtistUnicode ?? m?.Artist ?? "",
        songTitle: m?.Title ?? "",
        songTitleUnicode: m?.TitleUnicode ?? m?.Title ?? "",
        creatorName: m?.Author?.Username ?? "",
        difficultyName: b.DifficultyName ?? "",
        osuStandardGrade: 0,
        rankedStatus: b.Status,
        numCircles: circles ?? 0,
        numSliders: sliders ?? 0,
        numSpinners: spinners ?? 0,
        objectCountsAvailable,
        drainSeconds: b.Length / 1000,
        ar: d?.ApproachRate ?? 0,
        cs: d?.CircleSize ?? 0,
        hp: d?.DrainRate ?? 0,
        od: d?.OverallDifficulty ?? 0,
        sliderMultiplier: d?.SliderMultiplier ?? 0,
        stackLeniency: optionalCount(b.StackLeniency) ?? 0,
        mode: b.Ruleset?.OnlineID ?? 0,
        unplayed: !b.LastPlayed,
        // Epoch sentinel kept for compatibility: lazer has no stable "last played"
        // equivalent here, and the renderer treats epoch as missing.
        lastPlayedTime: b.LastPlayed ? new Date(b.LastPlayed) : new Date(0),
        tags: m?.Tags ?? "",
        source: m?.Source ?? "",
        srStd: b.StarRating,
        srTaiko: 0,
        srCtb: 0,
        srMania: 0,
        totalMilliseconds: b.Length,
        bpm: b.BPM,
    };
}

export function lazerLightweightToOsuBeatmap(b: LazerLightweightBeatmap): OsuBeatmap {
    return {
        beatmapId: b.beatmapId,
        beatmapSetId: b.beatmapSetId,
        md5Hash: b.md5Hash,
        artist: b.artist,
        artistUnicode: b.artist,
        songTitle: b.title,
        songTitleUnicode: b.title,
        creatorName: b.creatorName,
        difficultyName: b.difficultyName,
        osuStandardGrade: 0,
        rankedStatus: b.rankedStatus,
        numCircles: 0,
        numSliders: 0,
        numSpinners: 0,
        // The lightweight query never reads stored files, so counts are unknown.
        objectCountsAvailable: false,
        drainSeconds: b.drainSeconds,
        ar: b.ar,
        cs: b.cs,
        hp: b.hp,
        od: b.od,
        sliderMultiplier: b.sliderMultiplier,
        stackLeniency: 0,
        mode: b.mode,
        unplayed: b.unplayed,
        lastPlayedTime: b.lastPlayed ? new Date(b.lastPlayed) : new Date(0),
        tags: b.tags,
        source: b.source,
        srStd: b.starRating,
        srTaiko: 0,
        srCtb: 0,
        srMania: 0,
        totalMilliseconds: b.drainSeconds * 1000,
    };
}
