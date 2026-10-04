// See more info at ppy wiki on github
// https://github.com/ppy/osu/wiki/Legacy-database-file-structure

export enum StableLocalBeatmapStatus {
    Unknown = 0,
    Unsubmitted = 1,
    Unranked = 2,
    Unused = 3,
    Ranked = 4,
    Approved = 5,
    Qualified = 6,
    Loved = 7,
}

export interface StableCollection {
    version: number;
    collectionCount: number;
    collections: StableCollectionData[];
}

export interface StableCollectionData {
    name: string;
    mapCount: number;
    maps: StableCollectionMapData[];
}

export interface StableCollectionMapData {
    checksum: string;
}

export interface StableLocalBeatmap {
    artist: string;
    artistUnicode: string;
    songTitle: string;
    songTitleUnicode: string;
    creatorName: string;
    difficultyName: string;
    audioFileName: string;
    md5Hash: string;
    osuFileName: string;
    rankedStatus: number;
    numCircles: number;
    numSliders: number;
    numSpinners: number;
    lastModificationTime: string;
    ar: number;
    cs: number;
    hp: number;
    od: number;
    sliderMultiplier: number;
    drainSeconds: number;
    totalMilliseconds: number;
    previewMilliseconds: number;
    numTimingPoints: number;
    beatmapId: number;
    beatmapSetId: number;
    threadId: number;
    osuStandardGrade: number;
    taikoGrade: number;
    ctbGrade: number;
    maniaGrade: number;
    localOffset: number;
    stackLeniency: number;
    mode: number;
    source: string;
    tags: string;
    onlineOffset: number;
    titleFont: string;
    unplayed: boolean;
    lastPlayedTime: Date;
    isOsz2: boolean;
    path: string;
    lastOnlineCheckTime: Date;
    disableCustomSound: boolean;
    disableCustomSkin: boolean;
    disableStoryboard: boolean;
    disableVideo: boolean;
    visualOverride: boolean;
    lastEditTime: number;
    scrollSpeed: number;
}

export interface StableScoreBeatmapData {
    md5Hash: string;
    scoreCount: number;
    scores: StableScore[];
}

export interface StableScore {
    ruleset: number;
    version: number;
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
    mods: number;
    date: Date;
    compressedReplay: number;
    legacyOnlineID: string;
    additionalModData: number | null;
}

export interface StableBeatmapDetail {
    md5Hash: string;
    path: string;
    audioFileName: string;
    osuFileName: string;
}

export interface StableBeatmapFilter {
    title?: string;
    rankStatuses?: number[];
    starRatingMin?: number;
    starRatingMax?: number;
    modes?: number[];
    includedHashes?: string[];
    excludedHashes?: string[];
    includedIds?: number[];
}

export interface StableBeatmapIndex {
    md5Hash: string;
    beatmapSetId: number;
    beatmapId: number;
}

export interface PPCalcArgs {
    md5Hash: string;
    mods: number;
    modsData?: { acronym: string; settings?: Record<string, unknown> }[];
    combo?: number;
    n300?: number;
    n100?: number;
    n50?: number;
    misses?: number;
    totalScore?: number;
    beatmapId?: number;
    ar?: number;
    od?: number;
    nCircles?: number;
    nSliders?: number;
    ruleset?: number;
    lazer?: boolean;
}

export interface PPCalcResult {
    pp: number;
    maxPP: number;
    stars: number;
    aim?: number;
    speed?: number;
    acc?: number;
    maxAim?: number;
    maxSpeed?: number;
    maxAcc?: number;
}

export enum StableIpcMode {
    Menu = 0,
    Edit = 1,
    Play = 2,
    Exit = 3,
    SelectEdit = 4,
    SelectPlay = 5,
    SelectDrawings = 6,
    Rank = 7,
    Update = 8,
    Busy = 9,
    Unknown = 10,
    Lobby = 11,
    MatchSetup = 12,
    SelectMulti = 13,
    RankingVs = 14,
    OnlineSelection = 15,
    OptionsOffsetWizard = 16,
    RankingTagCoop = 17,
    RankingTeam = 18,
    BeatmapImport = 19,
    PackageUpdater = 20,
    Benchmark = 21,
    Tourney = 22,
    Charts = 23,
}

export interface LastPlayingStatus {
    BeatmapId: number;
    BeatmapChecksum: string;
    IsChecked: boolean;
}

export interface StableIpcClientData {
    Connected: boolean;
    Mode?: StableIpcMode;
    BeatmapId?: number;
    BeatmapChecksum?: string;
    Score?: number;
    AudioTime?: number;
    ReplayTime?: number;
    SpectatingID?: number;
    MenuTime?: number;
    AudioPlaying?: boolean;
    DimLevel?: number;
    Buffering?: boolean;
    SkipCalculations?: boolean;
    LReplayFrame?: number;
    LReplayMode?: boolean;
    LReplayStreaming?: boolean;
    LPlayerLoaded?: boolean;
    LReplayToEnd?: boolean;
}

export type StableClientData = StableIpcClientData;
