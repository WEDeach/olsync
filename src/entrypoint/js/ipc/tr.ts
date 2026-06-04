import { ipcMain } from "electron";
import { TrackerUserSummary } from "../../../defines/tracker_types";
import SharedManager from "../../../shared/sharedManager";
import { IPC_TR_NAMES } from "./ns";

export function register() {
    ipcMain.handle(IPC_TR_NAMES.GET_USER_SUMMARY, async (_, userName: string) => {
        return SharedManager.tracker.get_user_summary(userName);
    });

    ipcMain.handle(IPC_TR_NAMES.SAVE_USER_SUMMARY, async (_, data: TrackerUserSummary) => {
        await SharedManager.tracker.save_user_summary(data);
    });

    ipcMain.handle(IPC_TR_NAMES.LIST_USER_SUMMARIES, async () => {
        return SharedManager.tracker.list_user_summaries();
    });
}
