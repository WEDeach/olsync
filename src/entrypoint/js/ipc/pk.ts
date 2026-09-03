import { ipcMain } from "electron";
import { LazerRollRequest, LazerRollResponse } from "../../../defines/lazer_picker";
import { rollLazerBeatmap } from "../../../shared/singletons/lazerPickerRoll";
import { createLogger } from "../../../utils/logger";
import { IPC_PK_NAMES } from "./ns";

const log = createLogger("IPC_PK");

export function register() {
    ipcMain.handle(
        IPC_PK_NAMES.ROLL_LAZER_BEATMAP,
        async (_event, req: LazerRollRequest): Promise<LazerRollResponse> => {
            try {
                return await rollLazerBeatmap(req);
            } catch (error) {
                log.error("roll lazer beatmap failed:", error);
                return { poolCount: 0, count: 0 };
            }
        },
    );
}
