import Database from "better-sqlite3";
import { ipcMain } from "electron";
import { createWriteStream } from "fs";
import fs from "fs/promises";
import https from "https";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import unbzip2 from "unbzip2-stream";
import SharedManager from "../../../shared/sharedManager";
import { pRoot } from "../../../utils/file";
import { createLogger } from "../../../utils/logger";
import { ConfigKey } from "../../../utils/typed/config";
import { IPC_OD_NAMES } from "./ns";

const log = createLogger("ipc:od");

const DB_FILENAME = "online.db";
const DB_DIR = path.join(pRoot, "data");
export const DB_PATH = path.join(DB_DIR, DB_FILENAME);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ONLINE_DB_SIZE = 512 * 1024 * 1024;
let onlineDbDownloadPromise: Promise<{
    success: boolean;
    lastUpdate?: number;
    tagCount?: number;
    error?: string;
}> | null = null;

function buildDownloadUrl(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `https://assets.ppy.sh/client-resources/online.db.bz2?${yyyy}${mm}${dd}`;
}

function validateOnlineDb(dbPath: string): void {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
        const row = db.prepare("SELECT number FROM schema_version LIMIT 1").get() as { number: number } | undefined;
        if (!row || row.number < 3) throw new Error("online.db schema_version is invalid");
    } finally {
        db.close();
    }
}

async function downloadAndDecompress(url: string, destPath: string): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const tmpPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
    const backupPath = `${destPath}.${process.pid}.${Date.now()}.backup`;
    let renamed = false;
    let oldMoved = false;

    try {
        await new Promise<void>((resolve, reject) => {
            https
                .get(url, (res) => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    const compressedLength = Number(res.headers["content-length"] ?? 0);
                    if (compressedLength > MAX_ONLINE_DB_SIZE) {
                        res.resume();
                        reject(new Error("online.db download exceeds size limit"));
                        return;
                    }
                    let compressedBytes = 0;
                    let decompressedBytes = 0;
                    const compressedLimiter = new Transform({
                        transform(chunk: Buffer, _encoding, callback) {
                            compressedBytes += chunk.length;
                            if (compressedBytes > MAX_ONLINE_DB_SIZE) {
                                callback(new Error("online.db compressed stream exceeds size limit"));
                                return;
                            }
                            callback(null, chunk);
                        },
                    });
                    const decompressedLimiter = new Transform({
                        transform(chunk: Buffer, _encoding, callback) {
                            decompressedBytes += chunk.length;
                            if (decompressedBytes > MAX_ONLINE_DB_SIZE) {
                                callback(new Error("online.db decompressed stream exceeds size limit"));
                                return;
                            }
                            callback(null, chunk);
                        },
                    });
                    const out = createWriteStream(tmpPath);
                    pipeline(res, compressedLimiter, unbzip2(), decompressedLimiter, out).then(resolve).catch(reject);
                })
                .on("error", reject);
        });

        validateOnlineDb(tmpPath);
        await fs
            .rename(destPath, backupPath)
            .then(() => {
                oldMoved = true;
            })
            .catch((error) => {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            });
        await fs.rename(tmpPath, destPath);
        renamed = true;
        if (oldMoved)
            await fs.unlink(backupPath).catch((error) => log.warn("Failed to remove old online.db backup:", error));
    } catch (error) {
        if (!renamed) await fs.unlink(tmpPath).catch(() => {});
        if (oldMoved && !renamed) {
            await fs
                .rename(backupPath, destPath)
                .catch((restoreError) => log.error("Failed to restore previous online.db:", restoreError));
        }
        throw error;
    }
}

async function downloadOnlineDb(): Promise<{
    success: boolean;
    lastUpdate?: number;
    tagCount?: number;
    error?: string;
}> {
    const previousDbExists = await fs
        .access(DB_PATH)
        .then(() => true)
        .catch(() => false);
    try {
        const url = buildDownloadUrl();
        log.info(`Downloading online.db from: ${url}`);
        SharedManager.onlineDbReader.close();
        await downloadAndDecompress(url, DB_PATH);
        const opened = SharedManager.onlineDbReader.open(DB_PATH);
        if (!opened) {
            return { success: false, error: "Failed to open db after download" };
        }
        const now = Date.now();
        await SharedManager.config.save(ConfigKey.ONLINE_DB_LAST_UPDATE, now);
        log.info(`online.db downloaded and opened. Tags: ${SharedManager.onlineDbReader.tagCount}`);
        return { success: true, lastUpdate: now, tagCount: SharedManager.onlineDbReader.tagCount };
    } catch (e: any) {
        if (previousDbExists) SharedManager.onlineDbReader.open(DB_PATH);
        log.error("Download failed:", e);
        return { success: false, error: e?.message ?? String(e) };
    }
}

export function register() {
    ipcMain.handle(IPC_OD_NAMES.CHECK_UPDATE, async () => {
        const lastUpdate: number = SharedManager.config.get(ConfigKey.ONLINE_DB_LAST_UPDATE) ?? 0;
        const dbExists = await fs
            .access(DB_PATH)
            .then(() => true)
            .catch(() => false);
        const loaded = SharedManager.onlineDbReader.isLoaded;
        const needsUpdate = !dbExists || !loaded || Date.now() - lastUpdate > THIRTY_DAYS_MS;
        return { needsUpdate, lastUpdate, dbExists, loaded };
    });

    ipcMain.handle(IPC_OD_NAMES.DOWNLOAD, async () => {
        if (onlineDbDownloadPromise) return onlineDbDownloadPromise;
        onlineDbDownloadPromise = downloadOnlineDb();
        try {
            return await onlineDbDownloadPromise;
        } finally {
            onlineDbDownloadPromise = null;
        }
    });

    ipcMain.handle(IPC_OD_NAMES.GET_STATUS, () => {
        const lastUpdate: number = SharedManager.config.get(ConfigKey.ONLINE_DB_LAST_UPDATE) ?? 0;
        const status = SharedManager.onlineDbReader.get_status();
        return { ...status, lastUpdate };
    });

    ipcMain.handle(IPC_OD_NAMES.GET_TAGS, () => {
        return SharedManager.onlineDbReader.get_all_tags();
    });

    ipcMain.handle(IPC_OD_NAMES.SEARCH_TAGS, (_, query: string) => {
        return SharedManager.onlineDbReader.search_tags(query);
    });

    ipcMain.handle(IPC_OD_NAMES.GET_BEATMAP_TAGS, (_, beatmapId: number) => {
        return SharedManager.onlineDbReader.get_tags_for_beatmap(beatmapId);
    });

    ipcMain.handle(IPC_OD_NAMES.GET_ALL_BEATMAP_TAGS, () => {
        return Array.from(SharedManager.onlineDbReader.get_tag_index().entries());
    });

    ipcMain.handle(IPC_OD_NAMES.GET_BEATMAPS_BY_TAG, (_, tagName: string) => {
        return SharedManager.onlineDbReader.get_beatmaps_by_tag(tagName);
    });

    ipcMain.handle(IPC_OD_NAMES.GET_BEATMAPSETS_BY_APPROVED_DATE, (_, since?: number, until?: number) => {
        return SharedManager.onlineDbReader.get_beatmapset_ids_by_approved_date(since, until);
    });

    ipcMain.handle(IPC_OD_NAMES.GET_ALL_BEATMAPS, (_, offset: number = 0, limit: number = 500) => {
        return SharedManager.onlineDbReader.get_all_beatmaps(offset, limit);
    });
}
