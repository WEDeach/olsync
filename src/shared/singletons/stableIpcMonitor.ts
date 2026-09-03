import { BrowserWindow } from "electron";
import { StableIpcClientData, StableIpcMode } from "../../defines/stable_structs";
import { IPC_RD_NAMES } from "../../entrypoint/js/ipc/ns";
import { createLogger } from "../../utils/logger";
import SingletonBase from "./base";
import StableIpcClient from "./stableIpc";

const log = createLogger("StableIpcMonitor");

/**
 * Polls the stable IPC client for the current player/game state and
 * broadcasts updates to the renderer. This is used for gameplay detection.
 *
 * - When osu! is not running, the bridge returns `Connected: false` and
 *   we poll every 30s.
 * - When osu! is running, we poll every 1s during play and every 5s
 *   in other modes so the UI can observe changes in real time.
 */
export default class StableIpcMonitor extends SingletonBase {
    private _timer?: NodeJS.Timeout;
    private _latest: StableIpcClientData = { Connected: false };
    private _running = false;
    private _idleMs = 30000;
    private _activeMs = 5000;
    private _playingMs = 1000;
    private _listeners = new Set<(data: StableIpcClientData) => void>();

    start() {
        if (this._running || process.platform !== "win32") return;
        this._running = true;
        this._tick();
    }

    stop() {
        this._running = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = undefined;
        }
    }

    getLatest(): StableIpcClientData {
        return this._latest;
    }

    addListener(fn: (data: StableIpcClientData) => void) {
        this._listeners.add(fn);
    }

    removeListener(fn: (data: StableIpcClientData) => void) {
        this._listeners.delete(fn);
    }

    private _notifyListeners(data: StableIpcClientData) {
        for (const fn of this._listeners) {
            try {
                fn(data);
            } catch {}
        }
    }

    private async _tick() {
        if (!this._running) return;

        try {
            const data = await (StableIpcClient.getInstance as StableIpcClient).get_client_data();
            const changed = JSON.stringify(data) !== JSON.stringify(this._latest);
            this._latest = data;
            if (changed) {
                this.broadcast(IPC_RD_NAMES.STABLE_CLIENT_DATA_CHANGED, data);
                this._notifyListeners(data);
            }
            const delay = data.Connected
                ? data.Mode === StableIpcMode.Play
                    ? this._playingMs
                    : this._activeMs
                : this._idleMs;
            this._timer = setTimeout(() => this._tick(), delay);
        } catch (e: any) {
            log.warn("StableIpcMonitor tick failed:", e);
            this._timer = setTimeout(() => this._tick(), this._idleMs);
        }
    }

    broadcast(channel: string, payload: unknown) {
        BrowserWindow.getAllWindows().forEach((w) => {
            try {
                if (!w.isDestroyed()) w.webContents.send(channel, payload);
            } catch {}
        });
    }
}
