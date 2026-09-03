export interface BeatmapCollection {
    Name: string;
    BeatmapMD5Hashes: string[];
    LastModified: Date;
}

export interface LazerRealmUser {
    OnlineID: number;
    Username?: string;
    CountryCode?: string;
}

export interface LazerRuleset {
    ShortName?: string;
    OnlineID: number;
    Name?: string;
    InstantiationInfo?: string;
    Available: boolean;
    LastAppliedDifficultyVersion: number;
}

export interface LazerBeatmapDifficulty {
    DrainRate: number;
    CircleSize: number;
    OverallDifficulty: number;
    ApproachRate: number;
    SliderMultiplier: number;
    SliderTickRate: number;
}

export interface LazerBeatmapMetadata {
    Title?: string;
    TitleUnicode?: string;
    Artist?: string;
    ArtistUnicode?: string;
    Author?: LazerRealmUser;
    Source?: string;
    Tags?: string;
    PreviewTime: number;
    AudioFile?: string;
    BackgroundFile?: string;
    UserTags: string[];
}

/** Realm `BeatmapSet` subset carried by beatmap DTOs. */
export interface LazerBeatmapSetRef {
    OnlineID: number;
}

export interface LazerBeatmap {
    ID: string;
    DifficultyName?: string;
    Ruleset?: LazerRuleset;
    Difficulty?: LazerBeatmapDifficulty;
    Metadata?: LazerBeatmapMetadata;
    BeatmapSet?: LazerBeatmapSetRef;
    Status: number;
    OnlineID: number;
    Length: number;
    BPM: number;
    Hash?: string;
    StarRating: number;
    MD5Hash?: string;
    Hidden: boolean;
    BeatDivisor: number;
    OnlineMD5Hash?: string;
    LastLocalUpdate?: Date;
    LastOnlineUpdate?: Date;
    LastPlayed?: Date;
    EndTimeObjectCount: number;
    TotalObjectCount: number;
    /**
     * Hit-object counts parsed from the stored `.osu` file by the dedicated
     * `get_beatmap_detail` path. All three are absent together when the file is
     * missing, fails its digest check or cannot be parsed — they are never
     * derived from `TotalObjectCount` / `EndTimeObjectCount`.
     */
    CircleCount?: number;
    SliderCount?: number;
    SpinnerCount?: number;
    /** `[General] StackLeniency` from the stored `.osu`; absent when unavailable. */
    StackLeniency?: number;
}

/**
 * One-map lookup for the dedicated lazer detail read. `md5Hash` accepts either
 * the beatmap MD5 or the `.osu` content hash; `beatmapId` is used as a fallback
 * when it is a positive OnlineID.
 */
export interface LazerBeatmapDetailRequest {
    md5Hash?: string;
    beatmapId?: number;
}

export interface LazerMod {
    acronym: string;
    settings?: Record<string, unknown>;
}

export interface LazerScore {
    ID: string;
    BeatmapInfo?: LazerBeatmap;
    Ruleset?: LazerRuleset;
    Hash?: string;
    DeletePending: boolean;
    TotalScore: number;
    MaxCombo: number;
    Accuracy: number;
    Date: Date;
    PP?: number;
    OnlineID: number;
    User?: LazerRealmUser;
    Mods?: string;
    Statistics?: string;
    Rank: number;
    Combo: number;
    MaximumStatistics?: string;
    BeatmapHash?: string;
    IsLegacyScore: boolean;
    TotalScoreVersion: number;
    LegacyTotalScore?: number;
    ClientVersion?: string;
    BackgroundReprocessingFailed: boolean;
    LegacyOnlineID: number;
    TotalScoreWithoutMods: number;
    Pauses: number[];
}

/**
 * Filter spec for Realm-based lazer beatmap queries (lazer.process.ts).
 * `ar`/`cs`/`hp`/`od` use `{ op, val }` comparison objects.
 */
export interface LazerBeatmapQuerySpec {
    title?: string;
    artist?: string;
    creator?: string;
    srMin?: number;
    srMax?: number;
    drainMin?: number;
    drainMax?: number;
    modes?: number[];
    rankStatuses?: number[];
    ar?: { op: ">" | ">=" | "<" | "<=" | "=="; val: number };
    cs?: { op: ">" | ">=" | "<" | "<=" | "=="; val: number };
    hp?: { op: ">" | ">=" | "<" | "<=" | "=="; val: number };
    od?: { op: ">" | ">=" | "<" | "<=" | "=="; val: number };
    unplayed?: boolean;
    includedHashes?: string[];
    excludedHashes?: string[];
    beatmapSetIds?: number[];
    beatmapIds?: number[];
    includedCollectionNames?: string[];
    excludedCollectionNames?: string[];
    playerTagBeatmapIds?: number[];
    returnSetIds?: boolean;
    returnLightweight?: boolean;
}

/**
 * Minimal beatmap fields required by the picker's weight/wishlist evaluation
 * (returned by lazer.process.ts `query_beatmaps` with `returnLightweight: true`).
 */
export interface LazerLightweightBeatmap {
    beatmapId: number;
    beatmapSetId: number;
    md5Hash: string;
    difficultyName: string;
    rankedStatus: number;
    drainSeconds: number;
    starRating: number;
    lastPlayed?: string;
    unplayed: boolean;
    mode: number;
    title: string;
    artist: string;
    creatorName: string;
    tags: string;
    ar: number;
    cs: number;
    hp: number;
    od: number;
    sliderMultiplier: number;
}
