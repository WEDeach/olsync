import { exec } from "child_process";
import { dialog, ipcMain, shell } from "electron";
import { promises as fsp } from "fs";
import { promisify } from "util";
import { fDevMode } from "../../../utils/common";
import { IPC_FS_NAMES } from "./ns";

const execAsync = promisify(exec);

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

            if (canceled) return undefined;
            return filePaths[0];
        },
    );
    ipcMain.handle(IPC_FS_NAMES.READ_FILE, async (_, filePath: string, encoding: string = "utf8") => {
        const content = await fsp.readFile(filePath, encoding as BufferEncoding);
        if (encoding === "base64") {
            return content.toString();
        }
        return content.toString();
    });
    ipcMain.handle(IPC_FS_NAMES.IS_DEV_MODE, async (_) => {
        return fDevMode;
    });
    ipcMain.handle(IPC_FS_NAMES.EXEC, async (_, progId: string) => {
        const command = `reg query "HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command" /ve`;
        const { stdout } = await execAsync(command);

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
        return shell.openExternal(url);
    });
}
