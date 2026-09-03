import { app, BrowserWindow, ipcMain, Menu } from "electron";

// Disable automation signals before Chromium starts (must be before app.whenReady)
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");

import * as crypto from "crypto";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import SharedManager from "../../shared/sharedManager";
import { createUpdateReadyMarker } from "../../updater-core/updateReady";
import { getAllFiles, pathJoin, pI18n, readJson } from "../../utils/file";
import { setDefaultLang, setI18n } from "../../utils/i18n";
import { createLogger } from "../../utils/logger";
import { ConfigKey } from "../../utils/typed/config";
import { register as ipcAcCmdRegister } from "./ipc/ac";
import { register as ipcCnCmdRegister } from "./ipc/cn";
import { register as ipcDlCmdRegister } from "./ipc/dl";
import { register as ipcFsCmdRegister } from "./ipc/fs";
import { register as ipcLaCmdRegister } from "./ipc/la";
import { IPC_LA_NAMES } from "./ipc/ns";
import { register as ipcOdCmdRegister, DB_PATH as ONLINE_DB_PATH } from "./ipc/od";
import { getDeepLinkFromArgv, handleDeepLinkUrl } from "./ipc/pc";
import { register as ipcPkCmdRegister } from "./ipc/pk";
import { register as ipcRdCmdRegister } from "./ipc/rd";
import { register as ipcTrCmdRegister } from "./ipc/tr";
import { register as ipcUpCmdRegister } from "./ipc/up";
import { UPDATE_READY_FILE_ENV, UPDATE_READY_SESSION_ENV } from "./updater/constants";

const log = createLogger("Main");

let mainWindow: Electron.BrowserWindow | null;
let windowStateTimer: NodeJS.Timeout | null = null;

const exeDir = path.dirname(process.execPath);
const dirHash = crypto.createHash("md5").update(exeDir.toLowerCase()).digest("hex").slice(0, 16);
const lockPipePath =
    process.platform === "win32" ? `\\\\.\\pipe\\olsync-${dirHash}` : path.join(os.tmpdir(), `olsync-${dirHash}.sock`);

let lockServer: net.Server | null = null;

const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const LOCK_PROBE_TIMEOUT_MS = 500;
const LOCK_RETRY_DELAY_MS = 250;

function acquireDirectoryLock(): Promise<boolean> {
    return new Promise((resolve) => {
        const start = Date.now();

        const giveUpAndStart = () => {
            log.error("Could not acquire directory lock within timeout; refusing to start without it");
            resolve(false);
        };

        const tryListen = (): void => {
            const server = net.createServer((conn) => {
                const chunks: Buffer[] = [];
                conn.on("data", (chunk) => {
                    chunks.push(chunk);
                });
                conn.on("end", () => {
                    try {
                        const argv = JSON.parse(Buffer.concat(chunks).toString("utf8")) as string[];
                        const deepLink = getDeepLinkFromArgv(argv);
                        if (deepLink) handleDeepLinkUrl(deepLink);
                    } catch {}
                    if (mainWindow) {
                        if (mainWindow.isMinimized()) mainWindow.restore();
                        mainWindow.focus();
                    }
                });
            });

            server.on("error", () => {
                server.close();
                const probe = net.connect(lockPipePath);
                let probeDone = false;

                const probeTimeout = setTimeout(() => {
                    if (probeDone) return;
                    probeDone = true;
                    probe.destroy();
                    if (Date.now() - start > LOCK_ACQUIRE_TIMEOUT_MS) {
                        giveUpAndStart();
                    } else {
                        setTimeout(tryListen, LOCK_RETRY_DELAY_MS);
                    }
                }, LOCK_PROBE_TIMEOUT_MS);

                probe.on("connect", () => {
                    if (probeDone) return;
                    probeDone = true;
                    clearTimeout(probeTimeout);
                    probe.end();
                    resolve(false);
                });

                probe.on("error", () => {
                    if (probeDone) return;
                    probeDone = true;
                    clearTimeout(probeTimeout);
                    if (process.platform !== "win32") {
                        try {
                            fs.unlinkSync(lockPipePath);
                        } catch {}
                    }
                    if (Date.now() - start > LOCK_ACQUIRE_TIMEOUT_MS) {
                        giveUpAndStart();
                    } else {
                        setTimeout(tryListen, LOCK_RETRY_DELAY_MS);
                    }
                });

                probe.on("close", () => {
                    if (probeDone) return;
                    probeDone = true;
                    clearTimeout(probeTimeout);
                    if (Date.now() - start > LOCK_ACQUIRE_TIMEOUT_MS) {
                        giveUpAndStart();
                    } else {
                        setTimeout(tryListen, LOCK_RETRY_DELAY_MS);
                    }
                });
            });

            server.listen(lockPipePath, () => {
                lockServer = server;
                resolve(true);
            });
        };
        tryListen();
    });
}

function forwardArgvToExistingInstance(): Promise<void> {
    return new Promise((resolve) => {
        const client = net.connect(lockPipePath);
        client.on("connect", () => {
            client.end(JSON.stringify(process.argv));
        });
        client.on("error", () => resolve());
        client.on("close", () => resolve());
    });
}

function getUpdateReadyFilePath(): string | undefined {
    const readyFile = process.env[UPDATE_READY_FILE_ENV];
    const sessionId = process.env[UPDATE_READY_SESSION_ENV];
    if (!readyFile || !sessionId) return undefined;

    const tempRoot = path.resolve(app.getPath("temp"));
    const readyPath = path.resolve(readyFile);
    const relative = path.relative(tempRoot, readyPath);
    if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        path.basename(readyPath) !== "relaunch-ready.json"
    ) {
        log.warn("Rejected updater ready marker path:", readyPath);
        return undefined;
    }
    return readyPath;
}

function signalUpdateReady(): void {
    const readyPath = getUpdateReadyFilePath();
    const sessionId = process.env[UPDATE_READY_SESSION_ENV];
    if (!readyPath || !sessionId) return;

    try {
        const tempPath = `${readyPath}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(createUpdateReadyMarker(sessionId)), "utf8");
        fs.renameSync(tempPath, readyPath);
    } catch (error) {
        log.warn("Failed to signal updater readiness:", error);
    }
}

function createWindow() {
    const savedWidth = SharedManager.config.get(ConfigKey.WINDOW_WIDTH) as number | undefined;
    const savedHeight = SharedManager.config.get(ConfigKey.WINDOW_HEIGHT) as number | undefined;
    const savedX = SharedManager.config.get(ConfigKey.WINDOW_X) as number | undefined;
    const savedY = SharedManager.config.get(ConfigKey.WINDOW_Y) as number | undefined;

    const options: Electron.BrowserWindowConstructorOptions = {
        width: savedWidth ?? 1100,
        height: savedHeight ?? 700,
        backgroundColor: "#f2f2f2",
        webPreferences: {
            preload: pathJoin(__dirname, "js/preload.b.js"),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: process.env.NODE_ENV !== "production",
        },
    };

    if (savedX !== undefined && savedY !== undefined) {
        options.x = savedX;
        options.y = savedY;
    }

    mainWindow = new BrowserWindow(options);
    mainWindow.webContents.once("did-finish-load", signalUpdateReady);

    if (process.env.NODE_ENV === "development") {
        mainWindow.loadURL("http://localhost:18519");
    } else {
        mainWindow.loadURL(
            url.format({
                pathname: pathJoin(__dirname, "renderer/index.html"),
                protocol: "file:",
                slashes: true,
            }),
        );
    }

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    const saveWindowState = () => {
        if (!mainWindow || mainWindow.isMinimized()) return;
        const bounds = mainWindow.getBounds();
        SharedManager.config.save_multiple([
            { k: ConfigKey.WINDOW_WIDTH, v: bounds.width },
            { k: ConfigKey.WINDOW_HEIGHT, v: bounds.height },
            { k: ConfigKey.WINDOW_X, v: bounds.x },
            { k: ConfigKey.WINDOW_Y, v: bounds.y },
        ]);
    };

    const debouncedSave = () => {
        if (windowStateTimer) clearTimeout(windowStateTimer);
        windowStateTimer = setTimeout(() => {
            windowStateTimer = null;
            saveWindowState();
        }, 500);
    };

    mainWindow.on("resize", debouncedSave);
    mainWindow.on("move", debouncedSave);

    if (process.env.NODE_ENV === "development") {
        const preloadFile = pathJoin(__dirname, "js/preload.b.js");
        let reloadTimer: NodeJS.Timeout | null = null;
        try {
            fs.watch(preloadFile, { persistent: false }, () => {
                if (reloadTimer) clearTimeout(reloadTimer);
                reloadTimer = setTimeout(() => {
                    if (mainWindow) {
                        log.child("dev").debug("preload rebuilt, reloading window...");
                        mainWindow.reload();
                    }
                }, 300);
            });
        } catch (error) {
            log.child("dev").warn("failed to watch preload bundle:", error);
        }
    }

    createMenu();
}
function createMenu() {
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev) {
        Menu.setApplicationMenu(null);
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    const gotLock = await acquireDirectoryLock();
    if (!gotLock) {
        await forwardArgvToExistingInstance();
        app.quit();
        return;
    }

    await SharedManager.config.init();

    // cmd register
    ipcFsCmdRegister();
    ipcRdCmdRegister();
    ipcCnCmdRegister();
    ipcAcCmdRegister();
    ipcLaCmdRegister();
    await ipcDlCmdRegister();
    ipcOdCmdRegister();
    ipcUpCmdRegister();
    ipcPkCmdRegister();
    ipcTrCmdRegister();

    try {
        await fs.promises.access(ONLINE_DB_PATH);
        const opened = SharedManager.onlineDbReader.open(ONLINE_DB_PATH);
        if (opened) {
            log.info(`online.db opened on startup. Tags: ${SharedManager.onlineDbReader.tagCount}`);
        } else {
            log.warn(`online.db exists but could not be opened: ${ONLINE_DB_PATH}`);
        }
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
            log.error("Failed to access online.db:", e);
        }
    }

    // render
    createWindow();

    // Start polling osu!stable for the current player/game state
    SharedManager.stableIpcMonitor.start();
    await SharedManager.stableScoreRecorder.start();

    // Handle deep link from cold start (osu:// in argv)
    const coldDeepLink = getDeepLinkFromArgv(process.argv);
    if (coldDeepLink) {
        setTimeout(() => handleDeepLinkUrl(coldDeepLink), 2000);
    }
});

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    // On OS X it"s common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});

app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLinkUrl(url);
});

app.on("before-quit", () => {
    SharedManager.downloadManager.close_login_window_for_shutdown();
});

app.on("will-quit", () => {
    if (lockServer) {
        lockServer.close();
        lockServer = null;
    }
    SharedManager.stableIpcMonitor.stop();
    SharedManager.stableScoreRecorder.stop();
    SharedManager.stableIpc.close();
});

const reloadI18n = () => {
    getAllFiles(pI18n).forEach((filename: string) => {
        const lang = filename.split(".")[0];
        readJson(pathJoin(pI18n, filename)).then((json: any) => {
            setI18n(lang, json);
            BrowserWindow.getAllWindows().forEach((window) => {
                window.webContents.send("i18n-updated", lang);
            });
        });
    });
};

let _langWatcher: fs.FSWatcher | null = null;
let _watchedLang: string | null = null;

const getI18nFilePath = (lang: unknown): string | undefined => {
    if (typeof lang !== "string" || !/^[A-Za-z]{2,8}(?:[-_][A-Za-z]{2,8})?$/.test(lang)) return undefined;
    const fileName = `${lang}.json`;
    let availableFiles: string[];
    try {
        availableFiles = getAllFiles(pI18n);
    } catch {
        return undefined;
    }
    if (!availableFiles.includes(fileName)) return undefined;

    const root = path.resolve(pI18n);
    const filePath = path.resolve(root, fileName);
    const relative = path.relative(root, filePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    return filePath;
};

const watchCurrentLang = (lang: string) => {
    if (_watchedLang === lang && _langWatcher !== null) return;
    _langWatcher?.close();
    _langWatcher = null;
    _watchedLang = lang;
    const filePath = getI18nFilePath(lang);
    if (!filePath) {
        log.warn("Rejected unsupported language:", lang);
        return;
    }
    let lastMtimeMs = fs.statSync(filePath).mtimeMs;
    try {
        _langWatcher = fs.watch(filePath, { persistent: false }, () => {
            try {
                const mtimeMs = fs.statSync(filePath).mtimeMs;
                if (mtimeMs === lastMtimeMs) return;
                lastMtimeMs = mtimeMs;
                readJson(filePath).then((json: any) => {
                    if (!json) return;
                    setI18n(lang, json);
                    BrowserWindow.getAllWindows().forEach((w) => {
                        w.webContents.send(IPC_LA_NAMES.I18N_CHANGED, lang);
                    });
                });
            } catch {}
        });
    } catch {}
};

ipcMain.handle(IPC_LA_NAMES.FETCH_CURRENT, async (event) => {
    reloadI18n();
    const config = await readJson(pathJoin(require("../../utils/file").pRoot, "data/config.json")).catch(() => null);
    const configuredLang = config?.[ConfigKey.I18N_LANG];
    const lang = typeof configuredLang === "string" && getI18nFilePath(configuredLang) ? configuredLang : "zh-TW";
    setDefaultLang(lang);
    watchCurrentLang(lang);
    event.sender.send(IPC_LA_NAMES.I18N_CHANGED, lang);
    return lang;
});

ipcMain.handle(IPC_LA_NAMES.SET_LANG, (_event, lang: unknown) => {
    if (typeof lang !== "string" || !getI18nFilePath(lang)) {
        throw new Error(`Unsupported language: ${String(lang)}`);
    }
    setDefaultLang(lang);
    watchCurrentLang(lang);
    BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send(IPC_LA_NAMES.I18N_CHANGED, lang);
    });
    return true;
});

reloadI18n();
