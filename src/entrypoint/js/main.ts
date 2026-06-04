import { app, BrowserWindow, ipcMain, Menu } from "electron";
import * as fs from "fs";
import * as url from "url";
import SharedManager from "../../shared/sharedManager";
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
import { register as ipcRdCmdRegister } from "./ipc/rd";
import { register as ipcTrCmdRegister } from "./ipc/tr";
import { register as ipcUpCmdRegister } from "./ipc/up";

const log = createLogger("Main");

let mainWindow: Electron.BrowserWindow | null;
let windowStateTimer: NodeJS.Timeout | null = null;

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

    if (process.env.NODE_ENV === "development") {
        mainWindow.loadURL("http://localhost:3519");
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
        if (!mainWindow) return;
        const bounds = mainWindow.getBounds();
        SharedManager.config.save(ConfigKey.WINDOW_WIDTH, bounds.width);
        SharedManager.config.save(ConfigKey.WINDOW_HEIGHT, bounds.height);
        SharedManager.config.save(ConfigKey.WINDOW_X, bounds.x);
        SharedManager.config.save(ConfigKey.WINDOW_Y, bounds.y);
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
    await SharedManager.config.init();

    // cmd register
    ipcFsCmdRegister();
    ipcRdCmdRegister();
    ipcCnCmdRegister();
    ipcAcCmdRegister();
    ipcLaCmdRegister();
    ipcDlCmdRegister();
    ipcUpCmdRegister();
    ipcTrCmdRegister();

    // render
    createWindow();
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

const watchCurrentLang = (lang: string) => {
    if (_watchedLang === lang && _langWatcher !== null) return;
    _langWatcher?.close();
    _langWatcher = null;
    _watchedLang = lang;
    const filePath = pathJoin(pI18n, `${lang}.json`);
    if (!fs.existsSync(filePath)) return;
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

ipcMain.on("fetch-i18n", async (event) => {
    reloadI18n();
    const config = await readJson(pathJoin(require("../../utils/file").pRoot, "data/config.json")).catch(() => null);
    const lang: string = config?.[ConfigKey.I18N_LANG] || "zh-TW";
    setDefaultLang(lang);
    watchCurrentLang(lang);
    event.sender.send(IPC_LA_NAMES.I18N_CHANGED, lang);
});

ipcMain.on("set-i18n-lang", (_, lang: string) => {
    setDefaultLang(lang);
    watchCurrentLang(lang);
    BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send(IPC_LA_NAMES.I18N_CHANGED, lang);
    });
});

reloadI18n();
