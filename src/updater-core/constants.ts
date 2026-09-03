/**
 * Pure, environment-agnostic updater constants shared by the runtime
 * (Electron main process) and the build-time release generator.
 *
 * These values are not controlled by the renderer.
 */

export const GITHUB_OWNER = "WEDeach";
export const GITHUB_REPO = "olsync";
export const GITHUB_API_HOST = "api.github.com";
export const GITHUB_RELEASE_HOST = "github.com";
export const GITHUB_DOWNLOAD_HOSTS = [
    "github.com",
    "objects.githubusercontent.com",
    // GitHub has been serving release asset redirects from this host since 2025
    // (permanent feature flag); omitting it makes every update fail with EHOST.
    "release-assets.githubusercontent.com",
];

export const UPDATE_CHANNEL = "stable";
export const UPDATE_SCHEMA_VERSION = 1;
export const UPDATER_PRODUCT = "olsync";

export const APP_ALLOWLIST = [
    "resources/app.asar",
    "resources/app.asar.unpacked/**",
    "i18n/**",
    "bin/win/**",
    "manifest.json",
];

export const PUBLIC_KEY_PEM = `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAy6o0Ax7zPtaOQdbbmJkNg4ii3AIQqoNHog9YuN5ZWIf+cFp/yUfz
kWGsc55eDMUgZXD5FyupIYuZ0ACagxq3o6kVnhlfUth32UQeT0xJ5cgD3mRFxoTy
dDTxja670ak2fAJQGk9nc7vocIdUi2I9eQoyyR1sVJ3FEJLlRf0qTTdIVHQTCEMx
ZuPNJUTPDtQmHyQyqcQpmwh+aqD7OhKG5GDZXmmnFTdwxlWqx8NbPnvXlcU0x+F9
2HsuP6ZNwlgU+a0WBKtU6cPupG2X/ju8x6r+oPbiPq5LQpXKj2Y+2mdpiVIQvrEL
z+qWe/NUXGz64Ar1w6PiAbReqBKLgH1ZkQIDAQAB
-----END RSA PUBLIC KEY-----`;

// Package / extraction guardrails. 2 GiB is generous for an Electron app update
// without exposing the process to arbitrary mega-files.
export const UPDATE_PACKAGE_MAX_SIZE = 2_000_000_000;
export const UPDATE_MAX_EXTRACT_SIZE = 2_000_000_000;
export const UPDATE_MAX_EXTRACT_FILES = 50_000;
export const UPDATE_CONCURRENCY = 1;

// Limit how many HTTP redirects we are willing to follow for a single asset.
export const UPDATE_MAX_REDIRECTS = 5;
