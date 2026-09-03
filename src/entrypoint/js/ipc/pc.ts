import { BrowserWindow } from "electron";
import { createLogger } from "../../../utils/logger";
import { IPC_PC_NAMES } from "./ns";

const log = createLogger("IpcPc");

const PROTOCOL_SCHEME = "osu";

const parseDeepLink = (url: string): number | null => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return null;
        const segments = parsed.pathname.split("/").filter(Boolean);
        if (segments.length < 2 || segments[0] !== "dl") return null;
        const id = parseInt(segments[1], 10);
        return Number.isFinite(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
};

const forwardDeepLink = (beatmapsetId: number) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) return;
    const win = windows[0];
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send(IPC_PC_NAMES.DEEP_LINK_RECEIVED, beatmapsetId);
};

const handleDeepLinkUrl = (url: string) => {
    const setId = parseDeepLink(url);
    if (setId !== null) {
        log.info(`deep link received: beatmapset ${setId}`);
        forwardDeepLink(setId);
    } else {
        log.warn(`invalid deep link ignored: ${url}`);
    }
};

export const getDeepLinkFromArgv = (argv: string[]): string | null => {
    return argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`)) ?? null;
};

export { handleDeepLinkUrl, parseDeepLink };
