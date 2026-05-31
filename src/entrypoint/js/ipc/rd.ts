import { BrowserWindow, ipcMain } from "electron";
import { StableBeatmapFilter } from "../../../defines/stable_structs";
import { IOsuCollection, OsuClients } from "../../../defines/types";
import SharedManager from "../../../shared/sharedManager";
import { ConfigKey } from "../../../utils/typed/config";
import { IPC_RD_NAMES } from "./ns";

export function register() {
    ipcMain.handle(IPC_RD_NAMES.INIT, async (_, path: string) => {
        SharedManager.lazerReader.init(path);
    });

    ipcMain.handle(IPC_RD_NAMES.SCHEMAS, async (_) => {
        const reader = SharedManager.lazerReader;
        return reader.get_schemas();
    });

    ipcMain.handle(IPC_RD_NAMES.GET_SCHEMA, async (_, name: string) => {
        return SharedManager.lazerReader.get_schema_by_name(name);
    });

    ipcMain.handle(IPC_RD_NAMES.GET_SCHEMA_OBJS, async (_, name: string, limit?: number, offset?: number) => {
        return SharedManager.lazerReader.get_objects(name, limit, offset);
    });

    ipcMain.handle(IPC_RD_NAMES.CLOSE, async (_) => {
        return SharedManager.lazerReader.close();
    });

    ipcMain.handle(IPC_RD_NAMES.INIT_STABLE, async (_, path: string) => {
        const reader = SharedManager.stableReader;
        reader.init(path);
    });

    ipcMain.handle(IPC_RD_NAMES.START_STABLE_WATCH, async (_) => {
        const win = () => BrowserWindow.getAllWindows()[0]?.webContents;
        SharedManager.stableReader.watch_files(
            () => win()?.send(IPC_RD_NAMES.STABLE_BEATMAPS_CHANGED),
            () => win()?.send(IPC_RD_NAMES.STABLE_SCORES_CHANGED),
            () => win()?.send(IPC_RD_NAMES.STABLE_COLLECTIONS_CHANGED),
            () => Boolean(SharedManager.config.get(ConfigKey.EXPERIMENT_DB_MD5_CHECK)),
        );
    });

    ipcMain.handle(
        IPC_RD_NAMES.GET_COLLECTIONS,
        async (_, type: OsuClients = OsuClients.Stable, offset?: number, limit?: number) => {
            if (type === OsuClients.Lazer) return SharedManager.lazerReader.get_collections(offset, limit);
            return SharedManager.stableReader.collections(offset, limit);
        },
    );

    ipcMain.handle(IPC_RD_NAMES.SET_COLLECTIONS, async (_, type: OsuClients, collections: IOsuCollection[]) => {
        if (type === OsuClients.Lazer) return SharedManager.lazerReader.set_collections(collections);
        return SharedManager.stableReader.set_collections(collections);
    });

    ipcMain.handle(
        IPC_RD_NAMES.GET_BEATMAPS,
        async (_, type: OsuClients = OsuClients.Stable, offset?: number, limit?: number) => {
            if (type === OsuClients.Lazer) throw new Error("Not implemented");
            return SharedManager.stableReader.beatmaps(offset, limit);
        },
    );

    ipcMain.handle(
        IPC_RD_NAMES.GET_SCORES,
        async (_, type: OsuClients = OsuClients.Stable, offset?: number, limit?: number) => {
            if (type === OsuClients.Lazer) throw new Error("Not implemented");
            return SharedManager.stableReader.scores(offset, limit);
        },
    );

    ipcMain.handle(
        IPC_RD_NAMES.QUERY_BEATMAPS,
        async (_, filter: StableBeatmapFilter, offset: number = 0, limit: number = 0) => {
            return SharedManager.stableReader.query_beatmaps(filter, offset, limit);
        },
    );

    ipcMain.handle(IPC_RD_NAMES.COUNT_BEATMAPS, async (_) => {
        return SharedManager.stableReader.count_beatmaps();
    });

    ipcMain.handle(IPC_RD_NAMES.GET_BEATMAP_INDEX, async (_, offset: number = 0, limit: number = 0) => {
        return SharedManager.stableReader.get_beatmap_index(offset, limit);
    });

    ipcMain.handle(IPC_RD_NAMES.GET_BEATMAP_DETAIL, async (_, md5Hash: string) => {
        return SharedManager.stableReader.get_beatmap_detail(md5Hash);
    });
}
