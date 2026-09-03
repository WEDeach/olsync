import { execFile } from "child_process";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as fsp } from "fs";
import * as path from "path";
import { promisify } from "util";
import Config from "../../../shared/singletons/config";
import { fDevMode } from "../../../utils/common";
import { ConfigKey } from "../../../utils/typed/config";
import { IPC_FS_NAMES } from "./ns";

const execFileAsync = promisify(execFile);

const ALLOWED_OSU_PROGID_KEYS = ["osu!", "osustable.File.osz"] as const;
const BEATMAP_ASSET_OSU_EXTS = [".osu"];
const BEATMAP_ASSET_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
const BEATMAP_ASSET_AUDIO_EXTS = [".mp3", ".ogg", ".wav", ".flac"];

const MAX_OSU_FILE_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_AUDIO_SIZE = 50 * 1024 * 1024;

function is_allowed_external_url(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        if (url.protocol === "https:") return true;
        if (url.protocol === "osu:") {
            const action = url.host;
            const id = url.pathname.replace(/^\//, "");
            return ["b", "s", "dl"].includes(action) && /^\d+$/.test(id) && Number(id) > 0;
        }
        return false;
    } catch {
        return false;
    }
}

function validate_beatmap_asset_path(songsPath: string, target: string) {
    const prefix = path.normalize(songsPath + path.sep);
    const normalized = path.normalize(target);
    if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
        throw new Error("Beatmap asset path escapes target folder");
    }
}

export function register() {
    ipcMain.handle(
        IPC_FS_NAMES.OPEN,
        async (
            _,
            title?: string,
            propertie: "openFile" | "openDirectory" | "multiSelections" = "openFile",
            filters?: { name: string; extensions: string[] }[],
        ) => {
            const { canceled, filePaths } = await dialog.showOpenDialog({
                title: title ?? "選擇一個檔案",
                properties: [propertie],
                filters: [
                    { name: "All Files", extensions: ["*"] },
                    ...(filters ?? [{ name: "osu database", extensions: ["realm"] }]),
                ],
            });

            if (canceled || filePaths.length === 0) return undefined;
            const selected = filePaths[0];
            return selected;
        },
    );
    /** @deprecated Replaced by IMPORT_PICKER_PROFILES. */
    ipcMain.handle(IPC_FS_NAMES.READ_FILE, async () => {
        throw new Error("READ_FILE is deprecated");
    });
    ipcMain.handle(IPC_FS_NAMES.IS_DEV_MODE, async (_) => {
        return fDevMode;
    });
    ipcMain.handle(IPC_FS_NAMES.GET_OSU_STABLE_INSTALL_PATH, async (_, key?: string) => {
        const progId = key === "osz" ? "osustable.File.osz" : "osu!";
        if (!ALLOWED_OSU_PROGID_KEYS.includes(progId as (typeof ALLOWED_OSU_PROGID_KEYS)[number])) {
            throw new Error("Disallowed registry key");
        }
        const args = ["query", `HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`, "/ve"];
        const { stdout } = await execFileAsync("reg", args);

        const lines = stdout.split("\n");
        const valueLine = lines.find((line) => line.includes("REG_SZ"));

        if (valueLine) {
            const value = valueLine.split("REG_SZ")[1]?.trim();
            const pathMatch = value?.match(/"([^"]+)"/);

            if (pathMatch?.[1]) {
                return pathMatch[1].replace("osu!.exe", "");
            }
        }
        throw new Error("Failed to get osu!.exe path.");
    });
    ipcMain.handle(IPC_FS_NAMES.OPEN_EXTERNAL, async (_, url: string) => {
        if (!is_allowed_external_url(url)) {
            throw new Error(`Disallowed external URL: ${url}`);
        }
        return shell.openExternal(url);
    });
    ipcMain.handle(IPC_FS_NAMES.OPEN_BEATMAP_PAGE, async (_, beatmapId: number) => {
        const win = new BrowserWindow({
            width: 1024,
            height: 720,
            title: `osu! beatmap ${beatmapId}`,
            webPreferences: { sandbox: true, contextIsolation: true },
        });
        await win.loadURL(`https://osu.ppy.sh/beatmaps/${beatmapId}`);
    });
    ipcMain.handle(
        IPC_FS_NAMES.READ_BEATMAP_ASSET,
        async (_, songsPath: string, beatmapFolder: string, fileName: string, encoding: "utf8" | "base64") => {
            if (typeof songsPath !== "string" || typeof beatmapFolder !== "string" || typeof fileName !== "string") {
                throw new Error("Invalid beatmap asset arguments");
            }

            const stableDir = Config.getInstance.get(ConfigKey.PATH_STABLE_DIR) as string | undefined;
            if (!stableDir) {
                throw new Error("Stable path not configured");
            }
            const expectedSongsPath = path.resolve(stableDir, "Songs");
            const resolvedSongsPath = path.resolve(songsPath);
            const [realExpectedSongsPath, realResolvedSongsPath] = await Promise.all([
                fsp.realpath(expectedSongsPath).catch(() => expectedSongsPath),
                fsp.realpath(resolvedSongsPath).catch(() => resolvedSongsPath),
            ]);
            if (realResolvedSongsPath.toLowerCase() !== realExpectedSongsPath.toLowerCase()) {
                throw new Error("Invalid songs path");
            }

            if (
                beatmapFolder.trim() === "" ||
                beatmapFolder === "." ||
                beatmapFolder === ".." ||
                beatmapFolder.includes("/") ||
                beatmapFolder.includes("\\")
            ) {
                throw new Error("Invalid beatmap folder");
            }

            const safeFileName = path.basename(fileName.replace(/\\/g, "/"));
            if (safeFileName === "." || safeFileName === ".." || safeFileName.trim() === "") {
                throw new Error("Invalid beatmap file name");
            }

            const baseDir = path.resolve(realResolvedSongsPath, beatmapFolder);
            const target = path.resolve(baseDir, safeFileName);
            validate_beatmap_asset_path(realResolvedSongsPath, target);

            const realTarget = await fsp.realpath(target).catch(() => target);
            validate_beatmap_asset_path(realResolvedSongsPath, realTarget);

            const ext = path.extname(realTarget).toLowerCase();
            if (encoding === "utf8") {
                if (!BEATMAP_ASSET_OSU_EXTS.includes(ext)) {
                    throw new Error("Invalid beatmap file extension");
                }
            } else if (encoding === "base64") {
                if (![...BEATMAP_ASSET_IMAGE_EXTS, ...BEATMAP_ASSET_AUDIO_EXTS].includes(ext)) {
                    throw new Error("Invalid beatmap asset extension");
                }
            } else {
                throw new Error("Invalid beatmap asset encoding");
            }

            const stats = await fsp.stat(realTarget);
            if (encoding === "utf8" && stats.size > MAX_OSU_FILE_SIZE) {
                throw new Error("Beatmap file too large");
            }
            if (encoding === "base64") {
                if (BEATMAP_ASSET_IMAGE_EXTS.includes(ext) && stats.size > MAX_IMAGE_SIZE) {
                    throw new Error("Beatmap image too large");
                }
                if (BEATMAP_ASSET_AUDIO_EXTS.includes(ext) && stats.size > MAX_AUDIO_SIZE) {
                    throw new Error("Beatmap audio too large");
                }
            }

            if (encoding === "base64") {
                const buffer = await fsp.readFile(realTarget);
                return buffer.toString("base64");
            }
            return fsp.readFile(realTarget, "utf8");
        },
    );
}
