import { BrowserWindow, ipcMain } from "electron";
import { createLogger } from "../../../utils/logger";
import { UpdateConfig, UpdateDiff } from "../updater";
import { GithubUpdater } from "../updater/githubUpdater";
import { UpdateProgress } from "../updater/types";
import { IPC_UP_NAMES } from "./ns";

const log = createLogger("IPC_UP");

const githubUpdater = new GithubUpdater();

function legacyDeprecatedError() {
    return { error: "Legacy update API is deprecated and no longer accepts renderer parameters." };
}

export function register() {
    // Legacy handlers fail closed; they do not act on renderer-supplied config/diff/path.
    ipcMain.handle(IPC_UP_NAMES.INIT, async (_event, _config: UpdateConfig) => legacyDeprecatedError());
    ipcMain.handle(IPC_UP_NAMES.CHECK_FOR_UPDATES, async (_event) => legacyDeprecatedError());
    ipcMain.handle(IPC_UP_NAMES.DOWNLOAD_UPDATE, async (_event, _diff: UpdateDiff) => legacyDeprecatedError());
    ipcMain.handle(IPC_UP_NAMES.EXECUTE_UPDATE, async (_event, _tempDir: string) => legacyDeprecatedError());
    ipcMain.handle(IPC_UP_NAMES.VERIFY_UPDATE, async (_event) => legacyDeprecatedError());
    ipcMain.handle(IPC_UP_NAMES.GET_CURRENT_VERSION, async (_event) => {
        const { Updater } = await import("../updater");
        const tempInstance = new Updater({ sources: [] });
        return await tempInstance.getCurrentVersion();
    });

    // New, main-owned GitHub release updater
    ipcMain.handle(IPC_UP_NAMES.CHECK_FOR_GITHUB_UPDATE, async (_event) => {
        return await githubUpdater.checkForGithubUpdate();
    });

    ipcMain.handle(IPC_UP_NAMES.DOWNLOAD_GITHUB_UPDATE, async (_event) => {
        return await githubUpdater.downloadGithubUpdate();
    });

    ipcMain.handle(IPC_UP_NAMES.INSTALL_PREPARED_UPDATE, async (_event) => {
        await githubUpdater.installPreparedUpdate();
        return true;
    });

    githubUpdater.addProgressListener((progress: UpdateProgress) => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) {
                window.webContents.send(IPC_UP_NAMES.GITHUB_UPDATE_PROGRESS, progress);
            }
        }
    });

    githubUpdater.cleanupOldStagings().catch((error: Error) => log.warn("Cleanup old update stagings failed:", error));
}
