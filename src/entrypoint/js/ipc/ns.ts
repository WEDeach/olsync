// PROTOCOL
export enum IPC_PC_NAMES {
    DEEP_LINK_RECEIVED = "ipc:pc:deep_link_received",
}

// FILE_SYSTEM
export enum IPC_FS_NAMES {
    OPEN = "ipc:fs:open",
    IS_DEV_MODE = "ipc:fs:is_dev_mode",
    GET_OSU_STABLE_INSTALL_PATH = "ipc:fs:get_osu_stable_install_path",
    OPEN_EXTERNAL = "ipc:fs:open_external",
    OPEN_BEATMAP_PAGE = "ipc:fs:open_beatmap_page",
    READ_FILE = "ipc:fs:read_file",
    READ_BEATMAP_ASSET = "ipc:fs:read_beatmap_asset",
}

// READER
export enum IPC_RD_NAMES {
    INIT = "ipc:rd:init",
    READ = "ipc:rd:read",
    SCHEMAS = "ipc:rd:schemas",
    GET_SCHEMA = "ipc:rd:get_schema",
    GET_SCHEMA_OBJS = "ipc:rd:get_schema_objs",
    CLOSE = "ipc:rd:close",

    // stable
    INIT_STABLE = "ipc:rd:init_stable",
    GET_COLLECTIONS = "ipc:rd:get_collections",
    SET_COLLECTIONS = "ipc:rd:set_collections",
    GET_OSU_DATABASE = "ipc:rd:get_osu_database",
    SET_OSU_DATABASE = "ipc:rd:set_osu_database",
    GET_BEATMAPS = "ipc:rd:get_beatmaps",
    SET_BEATMAPS = "ipc:rd:set_beatmaps",
    GET_SCORES = "ipc:rd:get_scores",
    SET_SCORES = "ipc:rd:set_scores",
    STABLE_CHANGED = "ipc:rd:stable_changed",
    STABLE_BEATMAPS_CHANGED = "ipc:rd:stable_beatmaps_changed",
    STABLE_SCORES_CHANGED = "ipc:rd:stable_scores_changed",
    STABLE_COLLECTIONS_CHANGED = "ipc:rd:stable_collections_changed",
    START_STABLE_WATCH = "ipc:rd:start_stable_watch",
    QUERY_BEATMAPS = "ipc:rd:query_beatmaps",
    COUNT_BEATMAPS = "ipc:rd:count_beatmaps",
    GET_BEATMAP_INDEX = "ipc:rd:get_beatmap_index",
    GET_BEATMAP_DETAIL = "ipc:rd:get_beatmap_detail",
    QUERY_STABLE_SCORES_BY_USER = "ipc:rd:query_stable_scores_by_user",
    QUERY_STABLE_SCORES_BY_HASHES = "ipc:rd:query_stable_scores_by_hashes",
    QUERY_STABLE_USERS = "ipc:rd:query_stable_users",
    CALC_PP = "ipc:rd:calc_pp",
    QUERY_LAZER_BEATMAPS = "ipc:rd:query_lazer_beatmaps",
    COUNT_LAZER_BEATMAPS = "ipc:rd:count_lazer_beatmaps",
    GET_LAZER_BEATMAP_DETAIL = "ipc:rd:get_lazer_beatmap_detail",
    QUERY_LAZER_SCORES_BY_HASHES = "ipc:rd:query_lazer_scores_by_hashes",
    QUERY_LAZER_SCORES_BY_USER = "ipc:rd:query_lazer_scores_by_user",
    QUERY_LAZER_USERS = "ipc:rd:query_lazer_users",
    LAZER_SCORES_CHANGED = "ipc:rd:lazer_scores_changed",
    START_LAZER_WATCH = "ipc:rd:start_lazer_watch",
    GET_STABLE_CLIENT_DATA = "ipc:rd:get_stable_client_data",
    STABLE_CLIENT_DATA_CHANGED = "ipc:rd:stable_client_data_changed",
    STABLE_RECENT_SCORE_CHANGED = "ipc:rd:stable_recent_score_changed",
}

// CONFIG
export enum IPC_CN_NAMES {
    INIT = "ipc:cn:init",
    GET = "ipc:cn:get",
    SAVE = "ipc:cn:save",
    GET_ALL = "ipc:cn:get_all",
    GET_SYNC_STATE_BY_USER_ID = "ipc:cn:get_sync_state_by_user_id",
    SAVE_SYNC_STATE_BY_USER_ID = "ipc:cn:save_sync_state_by_user_id",
    GET_PICKER_PROFILE = "ipc:cn:get_picker_profile",
    SAVE_PICKER_PROFILE = "ipc:cn:save_picker_profile",
    DELETE_PICKER_PROFILE = "ipc:cn:delete_picker_profile",
    LIST_PICKER_PROFILES = "ipc:cn:list_picker_profiles",
    GET_PICKER_LOG = "ipc:cn:get_picker_log",
    SAVE_PICKER_LOG = "ipc:cn:save_picker_log",
    MIGRATE_PICKER_PROFILE = "ipc:cn:migrate_picker_profile",
    IMPORT_PICKER_PROFILES = "ipc:cn:import_picker_profiles",
}

// API
export enum IPC_AC_NAMES {
    INIT = "ipc:ac:init",
    GET = "ipc:ac:get",
    GET_MAP_NAME_BY_HASH = "ipc:ac:get_map_name_by_hash",
    GET_USER_MOST_PLAYED_MAPS = "ipc:ac:get_user_most_played_maps",
    GET_USER_INFO = "ipc:ac:get_user_info",
    SAVE_CACHED_MAPS = "ipc:ac:save_cached_maps",
    GET_CACHED_MAPS = "ipc:ac:get_cached_maps",
    GET_DLINK_BY_BEATMAPSET_ID = "ipc:ac:get_dlink_by_beatmapset_id",
    FETCH_PACKS = "ipc:ac:fetch_packs",
    GET_PACK = "ipc:ac:get_pack",
    LOOKUP_MAP_BY_CHECKSUM = "ipc:ac:lookup_map_by_checksum",
    LOOKUP_MAP_BY_ID = "ipc:ac:lookup_map_by_id",
}

// i18n
export enum IPC_LA_NAMES {
    FETCH_LANGS = "ipc:la:fetch_langs",
    GET_LANG = "ipc:la:get_lang",
    FETCH_CURRENT = "ipc:la:fetch_current",
    SET_LANG = "ipc:la:set_lang",
    I18N_CHANGED = "ipc:la:i18n_changed",
}

// TRACKER
export enum IPC_TR_NAMES {
    GET_USER_SUMMARY = "ipc:tr:get_user_summary",
    SAVE_USER_SUMMARY = "ipc:tr:save_user_summary",
    LIST_USER_SUMMARIES = "ipc:tr:list_user_summaries",
}

// DL (Downloader - unified: built-in + legacy FDM)
export enum IPC_DL_NAMES {
    // Legacy FDM
    INIT = "ipc:dl:init",
    SEND = "ipc:dl:send",
    // Built-in downloader
    ENQUEUE = "ipc:dl:enqueue",
    BATCH_ENQUEUE = "ipc:dl:batch_enqueue",
    CANCEL = "ipc:dl:cancel",
    PAUSE = "ipc:dl:pause",
    RESUME = "ipc:dl:resume",
    RETRY = "ipc:dl:retry",
    CLEAR_HISTORY = "ipc:dl:clear_history",
    GET_ALL_TASKS = "ipc:dl:get_all_tasks",
    OPEN_SAVE_DIR = "ipc:dl:open_save_dir",
    REVEAL_FILE = "ipc:dl:reveal_file",
    LOGIN_OSU = "ipc:dl:login_osu",
    CHECK_EXISTS = "ipc:dl:check_exists",
    INSTALL_FILE = "ipc:dl:install_file",
    CHECK_CLIENT = "ipc:dl:check_client",
    DELETE_FILE = "ipc:dl:delete_file",
    VERIFY_FILES = "ipc:dl:verify_files",
    GET_RATE_STATUS = "ipc:dl:get_rate_status",
    // push (main → renderer)
    TASK_UPDATED = "ipc:dl:task_updated",
    TASK_REMOVED = "ipc:dl:task_removed",
    SESSION_EXPIRED = "ipc:dl:session_expired",
    SESSION_READY = "ipc:dl:session_ready",
    AUTH_REQUIRED = "ipc:dl:auth_required",
    LOGIN_RESULT = "ipc:dl:login_result",
}

// PICKER
export enum IPC_PK_NAMES {
    ROLL_LAZER_BEATMAP = "ipc:pk:roll_lazer_beatmap",
}

// ONLINE DB
export enum IPC_OD_NAMES {
    DOWNLOAD = "ipc:od:download",
    CHECK_UPDATE = "ipc:od:check_update",
    GET_TAGS = "ipc:od:get_tags",
    SEARCH_TAGS = "ipc:od:search_tags",
    GET_BEATMAP_TAGS = "ipc:od:get_beatmap_tags",
    GET_ALL_BEATMAP_TAGS = "ipc:od:get_all_beatmap_tags",
    GET_BEATMAPS_BY_TAG = "ipc:od:get_beatmaps_by_tag",
    GET_STATUS = "ipc:od:get_status",
    GET_ALL_BEATMAPS = "ipc:od:get_all_beatmaps",
}

// UPDATER
export enum IPC_UP_NAMES {
    /** @deprecated Legacy updater init; fail closed. */
    INIT = "ipc:up:init",
    /** @deprecated Legacy update check. */
    CHECK_FOR_UPDATES = "ipc:up:check_for_updates",
    /** @deprecated Legacy update download. */
    DOWNLOAD_UPDATE = "ipc:up:download_update",
    /** @deprecated Legacy update execute. */
    EXECUTE_UPDATE = "ipc:up:execute_update",
    /** @deprecated Legacy update verify. */
    VERIFY_UPDATE = "ipc:up:verify_update",
    GET_CURRENT_VERSION = "ipc:up:get_current_version",
    /** @deprecated Legacy progress channel. */
    UPDATE_PROGRESS = "ipc:up:update_progress",

    CHECK_FOR_GITHUB_UPDATE = "ipc:up:check_for_github_update",
    DOWNLOAD_GITHUB_UPDATE = "ipc:up:download_github_update",
    INSTALL_PREPARED_UPDATE = "ipc:up:install_prepared_update",
    GITHUB_UPDATE_PROGRESS = "ipc:up:github_update_progress",
}
