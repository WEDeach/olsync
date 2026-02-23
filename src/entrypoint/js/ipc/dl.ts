import { app, ipcMain } from "electron";
import path from "path";
import { HostType } from "../../../defines/types";
import SharedManager from "../../../shared/sharedManager";
import { pathJoin } from "../../../utils/file";
import { IPC_DL_NAMES } from "./ns";

export function register() {
    ipcMain.handle(IPC_DL_NAMES.INIT, async (_, hostType: HostType) => {
        const appDataPath = app.getPath("appData");
        const localAppDataPath = pathJoin(path.dirname(appDataPath), "Local");
        const hostPath = pathJoin(localAppDataPath, "Softdeluxe", "Free Download Manager", "wenativehost.exe");

        const result = await SharedManager.nativeHost.start(hostType, hostPath);

        return result;
    });

    ipcMain.handle(IPC_DL_NAMES.SEND, async (_, hostType: HostType, message: any) => {
        return await SharedManager.nativeHost.sendMessage(hostType, message);
    });
}
