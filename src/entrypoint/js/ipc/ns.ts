// NOT_SET
export enum IPC_CM_NAMES { }

// FILE_SYSTEM
export enum IPC_FS_NAMES {
    OPEN="ipc:fs:open",
    IS_DEV_MODE="ipc:fs:is_dev_mode",
    EXEC="ipc:fs:exec",
    OPEN_EXTERNAL="ipc:fs:open_external",
}

// READER
export enum IPC_RD_NAMES {
    INIT="ipc:rd:init",
    READ="ipc:rd:read",
    SCHEMAS="ipc:rd:schemas",
    GET_SCHEMA="ipc:rd:get_schema",
    GET_SCHEMA_OBJS="ipc:rd:get_schema_objs",
    CLOSE="ipc:rd:close",

    // stable
    INIT_STABLE="ipc:rd:init_stable",
    GET_COLLECTIONS="ipc:rd:get_collections",
    SET_COLLECTIONS="ipc:rd:set_collections",
    GET_OSU_DATABASE="ipc:rd:get_osu_database",
    SET_OSU_DATABASE="ipc:rd:set_osu_database",
    GET_BEATMAPS="ipc:rd:get_beatmaps",
    SET_BEATMAPS="ipc:rd:set_beatmaps",
    GET_SCORES="ipc:rd:get_scores",
    SET_SCORES="ipc:rd:set_scores",
}

// CONFIG
export enum IPC_CN_NAMES {
    INIT="ipc:cn:init",
    GET="ipc:cn:get",
    SAVE="ipc:cn:save",
    GET_ALL="ipc:cn:get_all",
    GET_SYNC_STATE_BY_USER_ID="ipc:cn:get_sync_state_by_user_id",
    SAVE_SYNC_STATE_BY_USER_ID="ipc:cn:save_sync_state_by_user_id",
}

// API
export enum IPC_AC_NAMES {
    INIT="ipc:ac:init",
    GET="ipc:ac:get",
    GET_MAP_NAME_BY_HASH="ipc:ac:get_map_name_by_hash",
    GET_USER_MOST_PLAYED_MAPS="ipc:ac:get_user_most_played_maps",
    GET_USER_INFO="ipc:ac:get_user_info",
    SAVE_CACHED_MAPS="ipc:ac:save_cached_maps",
    GET_CACHED_MAPS="ipc:ac:get_cached_maps",
    GET_DLINK_BY_BEATMAPSET_ID="ipc:ac:get_dlink_by_beatmapset_id",
    FETCH_PACKS="ipc:ac:fetch_packs",
    GET_PACK="ipc:ac:get_pack",
}

// i18n
export enum IPC_LA_NAMES {
    FETCH_LANGS="ipc:la:fetch_langs",
    GET_LANG="ipc:la:get_lang",
}

// DL
export enum IPC_DL_NAMES {
    INIT="ipc:dl:init",
    SEND="ipc:dl:send",
}

// UPDATER
export enum IPC_UP_NAMES {
    INIT="ipc:up:init",
    CHECK_FOR_UPDATES="ipc:up:check_for_updates",
    DOWNLOAD_UPDATE="ipc:up:download_update",
    EXECUTE_UPDATE="ipc:up:execute_update",
    VERIFY_UPDATE="ipc:up:verify_update",
    GET_CURRENT_VERSION="ipc:up:get_current_version",
    UPDATE_PROGRESS="ipc:up:update_progress",
}