import { app,ipcMain } from "electron";
import { IPC_DL_NAMES } from "./ns";
import path from "path";
import SharedManager from "../../../shared/sharedManager";
import { HostType } from "../../../defines/types";
import { pathJoin } from "../../../utils/file";

export function register() {
    ipcMain.handle(IPC_DL_NAMES.INIT,async (_,hostType: HostType) => {
        const appDataPath=app.getPath('appData');
        const localAppDataPath=pathJoin(path.dirname(appDataPath),'Local');
        const hostPath=pathJoin(localAppDataPath,'Softdeluxe','Free Download Manager','wenativehost.exe');

        const result=await SharedManager.nativeHost.start(hostType,hostPath);

        return result;
    });

    ipcMain.handle(IPC_DL_NAMES.SEND,async (_,hostType: HostType,message: any) => {
        return await SharedManager.nativeHost.sendMessage(hostType,message);
    });
}