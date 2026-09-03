import { makeAutoObservable, runInAction } from "mobx";
import type { RespUserRecentScore } from "../api/v2/types/api_resp";
import type { LastPlayingStatus, StableIpcClientData } from "../defines/stable_structs";
import { StableIpcMode } from "../defines/stable_structs";
import { createLogger } from "./logger";
import { INITIAL_LAST_PLAYING_STATUS, isActiveLocalStablePlay, updateLastPlayingStatus } from "./stableIpcStatus";

const log = createLogger("StableIpcState");

export { INITIAL_LAST_PLAYING_STATUS, updateLastPlayingStatus } from "./stableIpcStatus";

/**
 * Singleton frontend state for the stable IPC player/game data.
 *
 * The main process (StableIpcMonitor) polls the game and pushes updates
 * on `STABLE_CLIENT_DATA_CHANGED`. This manager listens to those pushes
 * and exposes the latest data as a persistent, observable state.
 */
class StableIpcStateManager {
    data: StableIpcClientData = { Connected: false };
    isAvailable = false;
    lastUpdatedAt = 0;
    modeName = "-";
    lastPlayingStatus: LastPlayingStatus = { ...INITIAL_LAST_PLAYING_STATUS };
    lastScore: RespUserRecentScore | null | undefined = undefined;

    private _started = false;
    private _clientDataUnsub?: () => void;
    private _recentScoreUnsub?: () => void;
    private _prevWasPlaying = false;
    private _handler = (data: StableIpcClientData) => this._update(data);
    private _scoreHandler = (score: RespUserRecentScore | null) => {
        if (score) {
            log.info("Received recent score from main:", score.beatmap?.id, score.score, score.rank);
        } else {
            log.info("Recent score not found from main");
        }
        runInAction(() => {
            this.lastScore = score;
        });
    };

    constructor() {
        makeAutoObservable(this);
    }

    start() {
        if (this._started) return;
        this._started = true;
        this._clientDataUnsub = window.olsCore.onStableClientDataChanged(this._handler);
        this._recentScoreUnsub = window.olsCore.onStableRecentScoreChanged(this._scoreHandler);
        window.olsCore.getStableClientData().then((data) => this._update(data));
    }

    stop() {
        this._started = false;
        this._clientDataUnsub?.();
        this._recentScoreUnsub?.();
        this._clientDataUnsub = undefined;
        this._recentScoreUnsub = undefined;
    }

    private _update(data: StableIpcClientData) {
        const isPlaying = isActiveLocalStablePlay(data);
        const enteringPlay = isPlaying && !this._prevWasPlaying;
        this._prevWasPlaying = isPlaying;
        runInAction(() => {
            this.data = data;
            this.isAvailable = data.Connected;
            this.lastUpdatedAt = Date.now();
            this.modeName = data.Mode !== undefined ? (StableIpcMode[data.Mode] ?? String(data.Mode)) : "-";
            if (enteringPlay) {
                this.lastPlayingStatus = { ...INITIAL_LAST_PLAYING_STATUS };
            }
            this.lastPlayingStatus = updateLastPlayingStatus(this.lastPlayingStatus, data);
            if (isPlaying) {
                this.lastScore = undefined;
            }
        });
    }
}

export const stableIpcState = new StableIpcStateManager();
