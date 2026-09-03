/**
 * Electron-main updater constants.
 * Shared values live in `src/updater-core/constants.ts` so the release generator
 * and runtime both use the same source of truth.
 */

export {
    APP_ALLOWLIST,
    GITHUB_API_HOST,
    GITHUB_DOWNLOAD_HOSTS,
    GITHUB_OWNER,
    GITHUB_RELEASE_HOST,
    GITHUB_REPO,
    PUBLIC_KEY_PEM,
    UPDATE_CHANNEL,
    UPDATE_CONCURRENCY,
    UPDATE_MAX_EXTRACT_FILES,
    UPDATE_MAX_EXTRACT_SIZE,
    UPDATE_MAX_REDIRECTS,
    UPDATE_PACKAGE_MAX_SIZE,
    UPDATE_SCHEMA_VERSION,
    UPDATER_PRODUCT,
} from "../../../updater-core/constants";

// Network / process timeouts that only apply to the Electron runtime.
export const UPDATE_TIMEOUT_MS = 60_000;
export const UPDATE_DOWNLOAD_TIMEOUT_MS = 300_000;
export const UPDATE_RELAUNCH_READY_TIMEOUT_MS = 30_000;
export const UPDATE_RELAUNCH_GRACE_MS = 10_000;
export const UPDATE_RELAUNCH_POLL_MS = 100;
export const UPDATE_FILE_RETRY_ATTEMPTS = 10;
export const UPDATE_FILE_RETRY_DELAY_MS = 200;
export const UPDATE_READY_FILE_ENV = "OLSYNC_UPDATE_READY_FILE";
export const UPDATE_READY_SESSION_ENV = "OLSYNC_UPDATE_READY_SESSION";
