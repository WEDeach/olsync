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
    lastPlayedTime: string;
    isOsz2: boolean;
    path: string;
    lastOnlineCheckTime: string;
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
    replyHash: string;
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
    hpGraphString: null;
    date: string;
    compressedReplay: number;
    legacyOnlineID: string;
    additionalModData: null;
}
