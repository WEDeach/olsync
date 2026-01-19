import APIError from "./api_error";

export type ApiResponse<T>=T|APIError;

export interface RespOAuthToken {
    token_type: string;
    expires_in: number;
    access_token: string;
}

export type RespUserMostPlayedBeatmaps=RespUserMostPlayedBeatmap[];

export interface RespUserMostPlayedBeatmap {
    beatmap_id: number;
    count: number;
    beatmap: Beatmap;
    beatmapset: Beatmapset;
}

export interface RespUserInfo {
    avatar_url: string;
    country_code: string;
    default_group: string;
    id: number;
    is_active: boolean;
    is_bot: boolean;
    is_deleted: boolean;
    is_online: boolean;
    is_supporter: boolean;
    last_visit: Date;
    pm_friends_only: boolean;
    profile_colour: null;
    username: string;
    cover_url: string;
    discord: null;
    has_supported: boolean;
    interests: null;
    join_date: Date;
    location: string;
    max_blocks: number;
    max_friends: number;
    occupation: null;
    playmode: string;
    playstyle: string[];
    post_count: number;
    profile_hue: number;
    profile_order: string[];
    title: null;
    title_url: null;
    twitter: null;
    website: string;
    country: Country;
    cover: Cover;
    kudosu: Kudosu;
    account_history: any[];
    active_tournament_banner: null;
    active_tournament_banners: any[];
    badges: any[];
    beatmap_playcounts_count: number;
    comments_count: number;
    current_season_stats: CurrentSeasonStats;
    daily_challenge_user_stats: DailyChallengeUserStats;
    favourite_beatmapset_count: number;
    follower_count: number;
    graveyard_beatmapset_count: number;
    groups: any[];
    guest_beatmapset_count: number;
    loved_beatmapset_count: number;
    mapping_follower_count: number;
    matchmaking_stats: any[];
    monthly_playcounts: Count[];
    nominated_beatmapset_count: number;
    page: Page;
    pending_beatmapset_count: number;
    previous_usernames: any[];
    rank_highest: RankHighest;
    ranked_beatmapset_count: number;
    replays_watched_counts: Count[];
    scores_best_count: number;
    scores_first_count: number;
    scores_pinned_count: number;
    scores_recent_count: number;
    statistics: Statistics;
    support_level: number;
    team: Team;
    user_achievements: UserAchievement[];
    rank_history: RankHistory;
    rankHistory: RankHistory;
    ranked_and_approved_beatmapset_count: number;
    unranked_beatmapset_count: number;
}

export interface Country {
    code: string;
    name: string;
}

export interface Cover {
    custom_url: string;
    url: string;
    id: null;
}

export interface CurrentSeasonStats {
    division: Division;
    rank: number;
    season: Season;
    total_score: number;
}

export interface Division {
    colour_tier: string;
    id: number;
    image_url: string;
    name: string;
    threshold: number;
}

export interface Season {
    end_date: null;
    id: number;
    name: string;
    room_count: number;
    start_date: Date;
}

export interface DailyChallengeUserStats {
    daily_streak_best: number;
    daily_streak_current: number;
    last_update: Date;
    last_weekly_streak: Date;
    playcount: number;
    top_10p_placements: number;
    top_50p_placements: number;
    user_id: number;
    weekly_streak_best: number;
    weekly_streak_current: number;
}

export interface Kudosu {
    available: number;
    total: number;
}

export interface Count {
    start_date: Date;
    count: number;
}

export interface Page {
    html: string;
    raw: string;
}

export interface RankHistory {
    mode: string;
    data: number[];
}

export interface RankHighest {
    rank: number;
    updated_at: Date;
}

export interface Statistics {
    count_100: number;
    count_300: number;
    count_50: number;
    count_miss: number;
    level: Level;
    global_rank: number;
    global_rank_percent: number;
    global_rank_exp: null;
    pp: number;
    pp_exp: number;
    ranked_score: number;
    hit_accuracy: number;
    play_count: number;
    play_time: number;
    total_score: number;
    total_hits: number;
    maximum_combo: number;
    replays_watched_by_others: number;
    is_ranked: boolean;
    grade_counts: GradeCounts;
    country_rank: number;
    rank: Rank;
}

export interface GradeCounts {
    ss: number;
    ssh: number;
    s: number;
    sh: number;
    a: number;
}

export interface Level {
    current: number;
    progress: number;
}

export interface Rank {
    country: number;
}

export interface Team {
    flag_url: string;
    id: number;
    name: string;
    short_name: string;
}

export interface UserAchievement {
    achieved_at: Date;
    achievement_id: number;
}


export interface Beatmap {
    beatmapset_id: number;
    difficulty_rating: number;
    id: number;
    mode: string;
    status: string;
    total_length: number;
    user_id: number;
    version: string;
}

export enum RankedStatus {
    Graveyard="graveyard", // -2
    WIP="wip", // -1
    Pending="pending", // 0
    Ranked="ranked", // 1
    Approved="approved", // 2
    Qualified="qualified", // 3
    Loved="loved", // 4
}

export interface Beatmapset {
    anime_cover: boolean;
    artist: string;
    artist_unicode: string;
    covers: Covers;
    creator: string;
    favourite_count: number;
    genre_id: number;
    hype: null;
    id: number;
    language_id: number;
    nsfw: boolean;
    offset: number;
    play_count: number;
    preview_url: string;
    source: string;
    spotlight: boolean;
    status: RankedStatus;
    title: string;
    title_unicode: string;
    track_id: number|null;
    user_id: number;
    video: boolean;
    bpm: number;
    can_be_hyped: boolean;
    deleted_at: null;
    discussion_enabled: boolean;
    discussion_locked: boolean;
    is_scoreable: boolean;
    last_updated: Date;
    legacy_thread_url: string;
    nominations_summary: NominationsSummary;
    ranked: number;
    ranked_date: Date;
    rating: number;
    storyboard: boolean;
    submitted_date: Date;
    tags: string;
    availability: Availability;
}

export interface Covers {
    cover: string;
    "cover@2x": string;
    card: string;
    "card@2x": string;
    list: string;
    "list@2x": string;
    slimcover: string;
    "slimcover@2x": string;
}

export interface RespBeatmapPacks {
    beatmap_packs: BeatmapPack[];
    cursor: Cursor;
    cursor_string: string;
}

export interface BeatmapPack {
    author: string;
    date: string;
    name: string;
    no_diff_reduction: boolean;
    ruleset_id: number|null;
    tag: string;
    url: string;
}

export interface Cursor {
    pack_id: number;
}

export interface RespBeatmapPack {
    author: string;
    date: string;
    name: string;
    no_diff_reduction: boolean;
    ruleset_id: null;
    tag: string;
    url: string;
    beatmapsets: Beatmapset[];
    user_completion_data: UserCompletionData;
}

export interface Availability {
    download_disabled: boolean;
    more_information: null;
}

export interface NominationsSummary {
    current: number;
    eligible_main_rulesets: string[];
    required_meta: RequiredMeta;
}

export interface RequiredMeta {
    main_ruleset: number;
    non_main_ruleset: number;
}

export interface UserCompletionData {
    completed: boolean;
    beatmapset_ids: any[];
}
