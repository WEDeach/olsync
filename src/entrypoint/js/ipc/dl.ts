import { app, BrowserWindow, ipcMain } from "electron";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { Transform } from "stream";
import * as yauzl from "yauzl";
import { EnqueueRequest } from "../../../defines/download_types";
import { HostType } from "../../../defines/types";
import SharedManager from "../../../shared/sharedManager";
import { pathJoin } from "../../../utils/file";
import { ConfigKey } from "../../../utils/typed/config";
import { IPC_DL_NAMES } from "./ns";

const LAZER_IPC_PIPE = "\\\\.\\pipe\\osu-framework-osu-lazer";
const ARCHIVE_IMPORT_MESSAGE_TYPE =
    "osu.Game.IPC.ArchiveImportMessage, osu.Game, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null";
const MAX_IMPORT_ZIP_SIZE = 100 * 1024 * 1024;
const MAX_IMPORT_UNCOMPRESSED_SIZE = 100 * 1024 * 1024;
const MAX_IMPORT_OSZ_FILES = 2000;
const MAX_IMPORT_PATH_DEPTH = 2;

const IMPORT_TEMP_CLEANUP_DELAY_MS = 5 * 60 * 1000;
const IMPORT_TEMP_MAX_AGE_MS = 60 * 60 * 1000;
const IMPORT_TEMP_PREFIXES = [
    ".olsync-lazer-",
    ".olsync-stable-",
    "olsync-lazer-extract-",
    "olsync-stable-extract-",
    "olsync-stable-imports",
];

function scheduleImportTempCleanup(targetPath: string): void {
    const timer = setTimeout(() => {
        void fs.promises.rm(targetPath, { recursive: true, force: true }).catch(() => {});
    }, IMPORT_TEMP_CLEANUP_DELAY_MS);
    timer.unref?.();
}

async function cleanupOldImportTemps(): Promise<void> {
    const tempDir = app.getPath("temp");
    const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
        if (!IMPORT_TEMP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
        const target = path.join(tempDir, entry.name);
        const stat = await fs.promises.stat(target).catch(() => null);
        if (stat && now - stat.mtimeMs > IMPORT_TEMP_MAX_AGE_MS) {
            await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {});
        }
    }
}

async function extractOszFilesFromZip(
    zipPath: string,
    extractDir?: string,
): Promise<{ extractDir: string; files: string[] }> {
    const destDir = extractDir ?? path.join(path.dirname(zipPath), `.extract-${Date.now()}`);
    const files: string[] = [];
    let totalUncompressed = 0;
    let actualUncompressed = 0;
    let oszCount = 0;

    try {
        const zipSize = fs.statSync(zipPath).size;
        if (zipSize > MAX_IMPORT_ZIP_SIZE) {
            throw new Error(`Import archive exceeds ${MAX_IMPORT_ZIP_SIZE} bytes`);
        }
        fs.mkdirSync(destDir, { recursive: true });

        await new Promise<void>((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err || !zipfile) {
                    reject(err ?? new Error("Failed to open zip file"));
                    return;
                }
                zipfile.on("error", (e) => {
                    zipfile.close();
                    reject(e);
                });
                zipfile.on("entry", (entry) => {
                    const normalized = entry.fileName.replace(/\\/g, "/");
                    if (!normalized.toLowerCase().endsWith(".osz")) {
                        zipfile.readEntry();
                        return;
                    }
                    if (path.isAbsolute(normalized)) {
                        zipfile.close();
                        reject(new Error("Absolute path in import archive"));
                        return;
                    }
                    const parts = normalized.split("/");
                    if (
                        parts.length > MAX_IMPORT_PATH_DEPTH ||
                        parts.some((p: string) => p === "" || p === "." || p === "..")
                    ) {
                        zipfile.close();
                        reject(new Error("Import archive path must contain at most one directory"));
                        return;
                    }
                    if (++oszCount > MAX_IMPORT_OSZ_FILES) {
                        zipfile.close();
                        reject(new Error(`Import archive contains more than ${MAX_IMPORT_OSZ_FILES} osz files`));
                        return;
                    }
                    if (!Number.isFinite(entry.uncompressedSize) || entry.uncompressedSize < 0) {
                        zipfile.close();
                        reject(new Error("Invalid import archive entry size"));
                        return;
                    }
                    totalUncompressed += entry.uncompressedSize;
                    if (totalUncompressed > MAX_IMPORT_UNCOMPRESSED_SIZE) {
                        zipfile.close();
                        reject(new Error(`Import archive exceeds ${MAX_IMPORT_UNCOMPRESSED_SIZE} uncompressed bytes`));
                        return;
                    }

                    const relative = path.join(...parts);
                    const target = path.resolve(destDir, relative);
                    if (!target.toLowerCase().startsWith(path.resolve(destDir).toLowerCase() + path.sep)) {
                        zipfile.close();
                        reject(new Error("Import archive path escapes extraction directory"));
                        return;
                    }
                    const targetDir = path.dirname(target);
                    try {
                        fs.mkdirSync(targetDir, { recursive: true });
                    } catch (e) {
                        zipfile.close();
                        reject(e);
                        return;
                    }

                    zipfile.openReadStream(entry, (readErr, readStream) => {
                        if (readErr || !readStream) {
                            zipfile.close();
                            reject(readErr ?? new Error("Failed to open zip entry stream"));
                            return;
                        }
                        const writeStream = fs.createWriteStream(target);
                        let entryBytes = 0;
                        const limiter = new Transform({
                            transform(chunk: Buffer, _encoding, callback) {
                                entryBytes += chunk.length;
                                actualUncompressed += chunk.length;
                                if (
                                    entryBytes > MAX_IMPORT_UNCOMPRESSED_SIZE ||
                                    actualUncompressed > MAX_IMPORT_UNCOMPRESSED_SIZE
                                ) {
                                    callback(new Error("Import archive entry exceeds size limit"));
                                    return;
                                }
                                callback(null, chunk);
                            },
                        });
                        const fail = (error: Error) => {
                            readStream.destroy();
                            limiter.destroy();
                            writeStream.destroy();
                            zipfile.close();
                            reject(error);
                        };
                        writeStream.on("error", fail);
                        limiter.on("error", fail);
                        readStream.on("error", fail);
                        writeStream.on("finish", () => {
                            files.push(target);
                            zipfile.readEntry();
                        });
                        readStream.pipe(limiter).pipe(writeStream);
                    });
                });
                zipfile.on("end", () => {
                    zipfile.close();
                    resolve();
                });
                zipfile.readEntry();
            });
        });

        return { extractDir: destDir, files };
    } catch (e) {
        try {
            fs.rmSync(destDir, { recursive: true, force: true });
        } catch {}
        throw e;
    }
}

function moveFile(sourcePath: string, targetPath: string): void {
    try {
        fs.renameSync(sourcePath, targetPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);
    }
}

function buildLazerMessage(filePath: string) {
    const message = {
        Type: ARCHIVE_IMPORT_MESSAGE_TYPE,
        Value: { Path: filePath },
    };
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeInt32LE(payload.length, 0);
    return Buffer.concat([header, payload]);
}

function connectLazerWithRetry(
    onConnect: (socket: net.Socket) => void,
    maxRetries = 3,
    retryDelay = 200,
): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        let attempt = 0;

        const tryConnect = () => {
            attempt++;
            const socket = net.connect({ path: LAZER_IPC_PIPE });
            let settled = false;

            socket.setTimeout(5000);

            const cleanup = () => {
                if (settled) return;
                settled = true;
                socket.removeAllListeners();
                socket.setTimeout(0);
            };

            const onFailure = () => {
                cleanup();
                socket.destroy();
                if (attempt < maxRetries) {
                    setTimeout(tryConnect, retryDelay);
                } else {
                    reject(new Error("lazer_not_running"));
                }
            };

            socket.on("connect", () => {
                cleanup();
                socket.setTimeout(5000);
                onConnect(socket);
                resolve(socket);
            });
            socket.on("error", onFailure);
            socket.on("timeout", onFailure);
            socket.on("close", onFailure);
        };

        tryConnect();
    });
}

async function sendLazerImport(filePath: string): Promise<{ success: boolean; reason?: string }> {
    return new Promise((resolve) => {
        let settled = false;
        let writeDone = false;
        let activeSocket: net.Socket | undefined;

        const finish = (result: { success: boolean; reason?: string }) => {
            if (settled) return;
            settled = true;
            activeSocket?.destroy();
            resolve(result);
        };

        connectLazerWithRetry((socket) => {
            activeSocket = socket;

            socket.on("error", () => {
                if (writeDone) {
                    socket.destroy();
                    return;
                }
                finish({ success: false, reason: "ipc_failed" });
            });
            socket.on("timeout", () => finish({ success: false, reason: "ipc_timeout" }));
            socket.on("close", () => {
                finish({ success: writeDone, reason: writeDone ? undefined : "ipc_failed" });
            });

            socket.write(buildLazerMessage(filePath), (err) => {
                if (err) {
                    finish({ success: false, reason: "ipc_failed" });
                    return;
                }
                writeDone = true;
                socket.end();
            });
        }).catch(() => finish({ success: false, reason: "lazer_not_running" }));
    });
}

async function checkLazerClient(): Promise<boolean> {
    return new Promise((resolve) => {
        let settled = false;
        let writeDone = false;
        let activeSocket: net.Socket | undefined;

        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            activeSocket?.destroy();
            resolve(ok);
        };

        connectLazerWithRetry((socket) => {
            activeSocket = socket;

            socket.on("error", () => {
                if (writeDone) {
                    socket.destroy();
                    return;
                }
                finish(false);
            });
            socket.on("timeout", () => finish(false));
            socket.on("close", () => finish(writeDone));

            socket.write(buildLazerMessage("C:\\olsync\\check.olsync"), (err) => {
                if (err) {
                    finish(false);
                    return;
                }
                writeDone = true;
                socket.end();
            });
        }).catch(() => finish(false));
    });
}

async function installToLazer(task: {
    status: string;
    filename: string;
    savePath: string;
}): Promise<{ success: boolean; installedCount?: number; reason?: string }> {
    if (task.status !== "done") {
        return { success: false, reason: "not_done" };
    }

    const ext = path.extname(task.filename).toLowerCase();
    if (ext === ".osz") {
        const tempPath = path.join(app.getPath("temp"), `.olsync-lazer-${Date.now()}-${task.filename}`);
        try {
            await fs.promises.copyFile(task.savePath, tempPath);
        } catch {
            return { success: false, reason: "copy_failed" };
        }
        const result = await sendLazerImport(tempPath);
        scheduleImportTempCleanup(tempPath);
        return result.success ? { success: true, installedCount: 1 } : result;
    }

    if (ext === ".zip") {
        let extractDir = "";
        let cleanup = true;
        try {
            const { extractDir: dir, files } = await extractOszFilesFromZip(
                task.savePath,
                path.join(app.getPath("temp"), `olsync-lazer-extract-${Date.now()}`),
            );
            extractDir = dir;
            for (const osz of files) {
                const result = await sendLazerImport(osz);
                if (!result.success) return result;
            }
            cleanup = false;
            scheduleImportTempCleanup(extractDir);
            return { success: true, installedCount: files.length };
        } catch {
            return { success: false, reason: "extract_failed" };
        } finally {
            if (cleanup && extractDir) {
                try {
                    fs.rmSync(extractDir, { recursive: true, force: true });
                } catch {}
            }
        }
    }

    return { success: false, reason: "unsupported_type" };
}

async function installToStable(
    task: {
        id: string;
        status: string;
        filename: string;
        savePath: string;
    },
    mode: "copy" | "ipc" = "ipc",
): Promise<{ success: boolean; installedCount?: number; reason?: string }> {
    if (task.status !== "done") {
        return { success: false, reason: "not_done" };
    }

    const ext = path.extname(task.filename).toLowerCase();
    if (ext !== ".osz" && ext !== ".zip") {
        return { success: false, reason: "unsupported_type" };
    }

    if (mode === "ipc") {
        const clientData = await SharedManager.stableIpc.get_client_data();
        if (!clientData.Connected) {
            return { success: false, reason: "stable_not_running" };
        }
    }

    if (mode === "copy") {
        const stableDir = SharedManager.config.get(ConfigKey.PATH_STABLE_DIR) as string;
        if (!stableDir) {
            return { success: false, reason: "no_stable_path" };
        }

        const songsDir = path.join(stableDir, "Songs");
        if (!fs.existsSync(songsDir)) {
            try {
                fs.mkdirSync(songsDir, { recursive: true });
            } catch {
                return { success: false, reason: "create_songs_failed" };
            }
        }

        let installedCount = 0;
        if (ext === ".osz") {
            const dest = path.join(songsDir, task.filename);
            try {
                // Copy, never move: the original download must be preserved.
                // osu! stable imports and deletes .osz files it finds in Songs/.
                fs.copyFileSync(task.savePath, dest);
                installedCount = 1;
            } catch {
                return { success: false, reason: "copy_failed" };
            }
        } else {
            let extractDir = "";
            try {
                const { extractDir: dir, files } = await extractOszFilesFromZip(
                    task.savePath,
                    path.join(app.getPath("temp"), `olsync-stable-extract-${Date.now()}`),
                );
                extractDir = dir;
                for (const osz of files) {
                    const dest = path.join(songsDir, path.basename(osz));
                    moveFile(osz, dest);
                    installedCount++;
                }
            } catch {
                return { success: false, reason: "extract_failed" };
            } finally {
                if (extractDir) {
                    try {
                        fs.rmSync(extractDir, { recursive: true, force: true });
                    } catch {}
                }
            }
        }
        return { success: true, installedCount };
    }

    if (ext === ".osz") {
        let tempPath = "";
        try {
            const importDir = path.join(app.getPath("temp"), "olsync-stable-imports");
            fs.mkdirSync(importDir, { recursive: true });
            // Keep the original filename: osu! stable names the Songs folder after
            // the .osz filename (minus extension) for flat archives, so a prefixed
            // temp name would leak into the imported folder name.
            tempPath = path.join(importDir, task.filename);
            await fs.promises.copyFile(task.savePath, tempPath);
        } catch {
            return { success: false, reason: "copy_failed" };
        }
        const ok = await SharedManager.stableIpc.handle_arguments(tempPath);
        if (!ok) {
            try {
                fs.unlinkSync(tempPath);
            } catch {}
            return { success: false, reason: "ipc_failed" };
        }
        scheduleImportTempCleanup(tempPath);
        return { success: true, installedCount: 1 };
    }

    let extractDir = "";
    let cleanup = true;
    try {
        const { extractDir: dir, files } = await extractOszFilesFromZip(
            task.savePath,
            path.join(app.getPath("temp"), `olsync-stable-extract-${Date.now()}`),
        );
        extractDir = dir;
        for (const osz of files) {
            const ok = await SharedManager.stableIpc.handle_arguments(osz);
            if (!ok) {
                return { success: false, reason: "ipc_failed" };
            }
        }
        cleanup = false;
        scheduleImportTempCleanup(extractDir);
        return { success: true, installedCount: files.length };
    } catch {
        return { success: false, reason: "extract_failed" };
    } finally {
        if (cleanup && extractDir) {
            try {
                fs.rmSync(extractDir, { recursive: true, force: true });
            } catch {}
        }
    }
}

export async function register() {
    const dm = () => SharedManager.downloadManager;

    // Initialize download manager (load cache)
    await dm().init();
    cleanupOldImportTemps().catch(() => {});

    const broadcast = (channel: string, payload: unknown) => {
        BrowserWindow.getAllWindows().forEach((w) => {
            w.webContents.send(channel, payload);
        });
    };

    // Legacy FDM (Free Download Manager) support
    ipcMain.handle(IPC_DL_NAMES.INIT, async (_, hostType: HostType) => {
        const appDataPath = app.getPath("appData");
        const localAppDataPath = pathJoin(path.dirname(appDataPath), "Local");
        const hostPath = pathJoin(localAppDataPath, "Softdeluxe", "Free Download Manager", "wenativehost.exe");

        const result = await SharedManager.nativeHost.start(hostType, hostPath);

        return result;
    });

    ipcMain.handle(IPC_DL_NAMES.SEND, async (_, hostType: HostType, message: any) => {
        return await SharedManager.nativeHost.send_message(hostType, message);
    });

    // Built-in downloader
    ipcMain.handle(IPC_DL_NAMES.ENQUEUE, async (_event, req: EnqueueRequest) => {
        const result = await dm().enqueue(req);
        if (result.status === "error") {
            return { type: "error", task: result };
        }
        // If returned task has status other than queued/downloading/held, it's a duplicate
        if (["done", "missing"].includes(result.status)) {
            return { type: "exists", filename: result.filename, savePath: result.savePath, task: result };
        }
        if (["queued", "downloading", "held"].includes(result.status) && result.addedAt < Date.now() - 1000) {
            // Task existed before this call (within last second)
            return { type: "duplicate", task: result };
        }
        return { type: "enqueued", task: result };
    });

    ipcMain.handle(IPC_DL_NAMES.BATCH_ENQUEUE, async (_event, reqs: EnqueueRequest[]) => {
        const results = [];
        for (const req of reqs) {
            const task = await dm().enqueue(req);
            let type: "enqueued" | "duplicate" | "exists" | "error" = "enqueued";
            if (task.status === "error") {
                type = "error";
            } else if (["done", "missing"].includes(task.status)) {
                type = "exists";
            } else if (["queued", "downloading", "held"].includes(task.status) && task.addedAt < Date.now() - 1000) {
                type = "duplicate";
            }
            results.push({
                type,
                req,
                task,
                filename: task.filename,
                savePath: task.savePath,
            });
        }
        return results;
    });

    ipcMain.handle(IPC_DL_NAMES.CHECK_EXISTS, (_event, filenames: string[]) => {
        const existing: string[] = [];
        for (const filename of filenames) {
            const savePath = dm().get_expected_save_path(filename);
            if (fs.existsSync(savePath)) {
                existing.push(filename);
            }
        }
        return existing;
    });

    ipcMain.handle(
        IPC_DL_NAMES.INSTALL_FILE,
        async (_event, taskId: string, clientType: "stable" | "lazer" = "stable", mode?: "copy" | "ipc") => {
            const task = dm()
                .get_all_tasks()
                .find((t) => t.id === taskId);
            if (task?.status !== "done") {
                return { success: false, reason: "not_done" };
            }

            if (clientType === "lazer") {
                return installToLazer(task);
            }
            return installToStable(task, mode);
        },
    );

    ipcMain.handle(IPC_DL_NAMES.CHECK_CLIENT, async (_event, clientType: "stable" | "lazer") => {
        if (clientType === "lazer") {
            return { ok: await checkLazerClient() };
        }
        const clientData = await SharedManager.stableIpc.get_client_data();
        return { ok: clientData.Connected };
    });

    ipcMain.handle(IPC_DL_NAMES.DELETE_FILE, (_event, taskId: string) => {
        const task = dm()
            .get_all_tasks()
            .find((t) => t.id === taskId);
        if (!task) return { success: false };
        try {
            if (fs.existsSync(task.savePath)) fs.unlinkSync(task.savePath);
            dm().remove_task(taskId);
            return { success: true };
        } catch {
            return { success: false };
        }
    });

    ipcMain.handle(IPC_DL_NAMES.CANCEL, (_event, id: string) => {
        dm().cancel(id);
    });

    ipcMain.handle(IPC_DL_NAMES.PAUSE, (_event, id: string) => {
        dm().pause(id);
    });

    ipcMain.handle(IPC_DL_NAMES.RESUME, (_event, id: string) => {
        dm().resume(id);
    });

    ipcMain.handle(IPC_DL_NAMES.RETRY, (_event, id: string) => {
        dm().retry(id);
    });

    ipcMain.handle(IPC_DL_NAMES.CLEAR_HISTORY, (_event, statuses?: string[]) => {
        dm().clear_history(statuses as import("../../../defines/download_types").DLStatus[] | undefined);
    });

    ipcMain.handle(IPC_DL_NAMES.GET_ALL_TASKS, () => {
        dm().verify_missing_files();
        return dm().get_all_tasks();
    });

    ipcMain.handle(IPC_DL_NAMES.OPEN_SAVE_DIR, () => {
        dm().open_save_dir();
    });

    ipcMain.handle(IPC_DL_NAMES.REVEAL_FILE, (_event, filePath: string) => {
        return dm().reveal_file(filePath);
    });

    ipcMain.handle(IPC_DL_NAMES.VERIFY_FILES, () => {
        return { changed: dm().verify_missing_files() };
    });

    ipcMain.handle(IPC_DL_NAMES.LOGIN_OSU, () => {
        return new Promise<{ success: boolean }>((resolve) => {
            dm().open_login_window((success) => resolve({ success }));
        });
    });

    ipcMain.handle(IPC_DL_NAMES.GET_RATE_STATUS, () => {
        return dm().get_rate_status();
    });

    dm().add_listener((event) => {
        if (event.type === "task_updated") {
            broadcast(IPC_DL_NAMES.TASK_UPDATED, event.task);
        } else if (event.type === "task_removed") {
            broadcast(IPC_DL_NAMES.TASK_REMOVED, { id: event.task?.id });
        } else if (event.type === "session_expired") {
            broadcast(IPC_DL_NAMES.SESSION_EXPIRED, null);
        } else if (event.type === "session_ready") {
            broadcast(IPC_DL_NAMES.SESSION_READY, null);
        } else if (event.type === "auth_required") {
            broadcast(IPC_DL_NAMES.AUTH_REQUIRED, event.payload);
        } else if (event.type === "login_result") {
            broadcast(IPC_DL_NAMES.LOGIN_RESULT, event.payload);
        }
    });
}
