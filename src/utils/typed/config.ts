export enum ConfigKey {
    DEBUG_PATH = "path", // For debug only!!
    PAGE_SIZE = "page_size",

    /* Path */
    PATH_LAZER_REALM = "path:lazer_realm",
    PATH_STABLE_DIR = "path:stable_dir",

    /* API */
    API_CLIENT_ID = "api:client_id",
    API_CLIENT_SECRET = "api:client_secret",
    API_DLINK = "api:dlink",
    API_DELAY_MS = "api:delay_ms",

    /* Auth */
    AUTH_OSU_SESSION = "auth:osu_session",

    /* Sync State */
    SYNC_PLAYER_ID = "sync:player_id",
    SYNC_LAST_UPDATED = "sync:last_updated",
    SYNC_LAST_OFFSET = "sync:last_offset",
    SYNC_ALAWAYS_SAVE_CACHE = "sync:always_save_cache",
    SYNC_PRE_COUNT = "sync:pre_count",

    /* DL (legacy) */
    DL_DELAY_MS = "dl:delay_ms",

    /* DL Manager */
    DL_SAVE_DIR = "dl:save_dir",
    DL_WORKERS = "dl:workers",
    DL_SPEED_LIMIT_MBPS = "dl:speed_limit_mbps",
    DL_MIRROR_URL = "dl:mirror_url",
    DL_MIRROR_WORKERS = "dl:mirror_workers",
    DL_CONCURRENCY = "dl:concurrency",
    DL_MIN_CHUNK_SIZE = "dl:min_chunk_size",
    DL_MAX_CHUNK_SIZE = "dl:max_chunk_size",
    DL_PRE_MIN_REQUESTS_LIMIT = "dl:pre_min_requests_limit",

    /* BPKS */
    BPKS_DL_TYPE = "bpks:dl:type",
    BPKS_DL_GMODE = "bpks:dl:gmode",
    BPKS_DL_DATE_RANGE = "bpks:dl:date_range",
    BPKS_DL_MODE = "bpks:dl:mode",

    /* UPDATE */
    UPDATE_BASE_URL = "update:base_url",
    UPDATE_AUTO_CHECK = "update:auto_check",
    UPDATE_CHECK_INTERVAL = "update:check_interval",
    UPDATE_LAST_CHECK = "update:last_check",

    /* i18n */
    I18N_LANG = "i18n:lang",

    /* Beatmap Picker */
    PICKER_ACTIVE_PROFILE = "picker:active_profile",

    /* Tracker */
    TRACKER_LAST_USER = "tracker:last_user",

    /* UI */
    UI_AUDIO_VOLUME = "ui:audio_volume",
    UI_AUDIO_MUTED = "ui:audio_muted",
    WINDOW_WIDTH = "window:width",
    WINDOW_HEIGHT = "window:height",
    WINDOW_X = "window:x",
    WINDOW_Y = "window:y",

    /* Experiments */
    EXPERIMENT_YINMO_CHANCE = "experiment:yinmo_chance",
    EXPERIMENT_DB_MD5_CHECK = "experiment:db_md5_check",
    EXPERIMENT_PACK_RULESET_BY_NM = "experiment:pack_ruleset_by_nm",
    EXPERIMENT_USE_API_MAP_ATTR = "experiment:use_api_map_attr",
    EXPERIMENT_SPEEDTEST_DNS_PROXY = "experiment:speedtest_dns_proxy",
}

export interface SyncState {
    player_id: number;
    last_count: number;
    last_offset: number;
    last_updated: number;
}
