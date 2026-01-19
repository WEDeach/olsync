import { ipcMain } from "electron";
import { IPC_LA_NAMES } from "./ns";
import { getLang,getLangs } from "../../../utils/i18n";


export function register() {
    ipcMain.handle(IPC_LA_NAMES.FETCH_LANGS,async () => {
        return getLangs();
    });
    ipcMain.handle(IPC_LA_NAMES.GET_LANG,async (_,lang: string) => {
        return getLang(lang);
    });
}