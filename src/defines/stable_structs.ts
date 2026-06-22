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
}

export interface StableBeatmapIndex {
    md5Hash: string;
    beatmapSetId: number;
    beatmapId: number;
}

export interface PPCalcArgs {
    md5Hash: string;
    mods: number;
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
