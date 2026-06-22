import { app, BrowserWindow, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { EnqueueRequest } from "../../../defines/download_types";
import { HostType } from "../../../defines/types";
import SharedManager from "../../../shared/sharedManager";
import { pathJoin } from "../../../utils/file";
import { ConfigKey } from "../../../utils/typed/config";
import { IPC_DL_NAMES } from "./ns";

export async function register() {
    const dm = () => SharedManager.downloadManager;

    // Initialize download manager (load cache)
    await dm().init();

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
        const result = dm().enqueue(req);
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
            const task = dm().enqueue(req);
            let type: "enqueued" | "duplicate" | "exists" = "enqueued";
            if (["done", "missing"].includes(task.status)) {
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

    ipcMain.handle(IPC_DL_NAMES.INSTALL_FILE, async (_event, taskId: string) => {
        const task = dm()
            .get_all_tasks()
            .find((t) => t.id === taskId);
        if (!task || task.status !== "done") {
            return { success: false, reason: "not_done" };
        }

        const config = dm()["_config"]();
        const stableDir = config.get(ConfigKey.PATH_STABLE_DIR) as string;
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

        const ext = path.extname(task.filename).toLowerCase();
        let installedCount = 0;

        if (ext === ".osz") {
            // Direct copy for .osz files
            const dest = path.join(songsDir, task.filename);
            try {
                fs.copyFileSync(task.savePath, dest);
                installedCount = 1;
            } catch {
                return { success: false, reason: "copy_failed" };
            }
        } else if (ext === ".zip") {
            // Extract zip and copy all .osz files
            const extractDir = path.join(path.dirname(task.savePath), ".extract");
            try {
                const { execSync } = require("child_process");
                // Use PowerShell Expand-Archive for better compatibility
                execSync(
                    `powershell -command "Expand-Archive -Path '${task.savePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
                    { timeout: 60000 },
                );
                // Find all .osz files in extracted directory
                const findOszFiles = (dir: string): string[] => {
                    const files: string[] = [];
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            files.push(...findOszFiles(fullPath));
                        } else if (entry.name.toLowerCase().endsWith(".osz")) {
                            files.push(fullPath);
                        }
                    }
                    return files;
                };
                const oszFiles = findOszFiles(extractDir);
                for (const osz of oszFiles) {
                    const dest = path.join(songsDir, path.basename(osz));
                    fs.copyFileSync(osz, dest);
                    installedCount++;
                }
                // Cleanup extract directory
                fs.rmSync(extractDir, { recursive: true, force: true });
            } catch {
                return { success: false, reason: "extract_failed" };
            }
        } else {
            return { success: false, reason: "unsupported_type" };
        }

        return { success: true, installedCount };
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
        return dm().get_all_tasks();
    });

    ipcMain.handle(IPC_DL_NAMES.OPEN_SAVE_DIR, () => {
        dm().open_save_dir();
    });

    ipcMain.handle(IPC_DL_NAMES.REVEAL_FILE, (_event, filePath: string) => {
        dm().reveal_file(filePath);
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
