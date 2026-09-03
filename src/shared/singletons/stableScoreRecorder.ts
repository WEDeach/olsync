import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RespUserRecentScore } from "../../api/v2/types/api_resp";
import APIException from "../../api/v2/types/exceptions";
import type { StableIpcClientData } from "../../defines/stable_structs";
import { IPC_RD_NAMES } from "../../entrypoint/js/ipc/ns";
import { readFileSync } from "../../utils/file";
import { createLogger } from "../../utils/logger";
import { isActiveLocalStablePlay } from "../../utils/stableIpcStatus";
import { sleep } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import Api from "./api";
import SingletonBase from "./base";
import Config from "./config";
import StableReader from "./stable";
import StableIpcMonitor from "./stableIpcMonitor";

const log = createLogger("StableScoreRecorder");
const CHECK_DELAY_MS = 10_000;
const CHECK_START_TOLERANCE_MS = 30_000;
const BEST_SCORE_RESOLVE_TIMEOUT_MS = 15_000;
const BEST_SCORE_POLL_INTERVAL_MS = 3_000;
const CFG_USERNAME_RE = /^\s*Username\s*=\s*(.+?)\s*$/i;

interface PlaySequence {
    id: number;
    beatmapId: number;
    beatmapChecksum: string;
    startedAt: number;
    state: "playing" | "pending" | "done";
}

export default class StableScoreRecorder extends SingletonBase {
    public static get getInstance(): StableScoreRecorder {
        return super.getInstance as StableScoreRecorder;
    }

    private _running = false;
    private _sequenceCounter = 0;
    private _playSequence: PlaySequence | null = null;
    private _monitor = StableIpcMonitor.getInstance as StableIpcMonitor;
    private _listener = (data: StableIpcClientData) => this._onClientData(data);

    async start() {
        if (this._running) return;
        this._running = true;
        this._monitor.addListener(this._listener);
    }

    stop() {
        this._running = false;
        this._monitor.removeListener(this._listener);
        this._playSequence = null;
    }

    private _onClientData(data: StableIpcClientData) {
        if (!data.Connected) {
            this._playSequence = null;
            return;
        }

        if (isActiveLocalStablePlay(data)) {
            const beatmapId = data.BeatmapId ?? 0;
            const beatmapChecksum = data.BeatmapChecksum ?? "";
            const current = this._playSequence;
            if (
                current &&
                current.state === "playing" &&
                current.beatmapId === beatmapId &&
                current.beatmapChecksum === beatmapChecksum
            ) {
                return;
            }
            this._sequenceCounter += 1;
            this._playSequence = {
                id: this._sequenceCounter,
                beatmapId,
                beatmapChecksum,
                startedAt: Date.now(),
                state: "playing",
            };
            return;
        }

        if (this._playSequence?.state !== "playing" || this._playSequence?.beatmapId === 0) return;
        const sequence = this._playSequence;

        sequence.state = "pending";
        void this._runCheck(sequence);
    }

    private async _runCheck(sequence: PlaySequence) {
        try {
            const config = Config.getInstance as Config;
            const stablePath = config.get(ConfigKey.PATH_STABLE_DIR) ?? "";
            const clientId = config.get(ConfigKey.API_CLIENT_ID) ?? "";
            const clientSecret = config.get(ConfigKey.API_CLIENT_SECRET) ?? "";

            if (!stablePath || !clientId || !clientSecret) {
                this._broadcastNotFound();
                return;
            }

            const username = await this._getUsername(stablePath);
            if (!username) {
                this._broadcastNotFound();
                return;
            }

            const userId = await this._resolveUserId(username);
            if (!userId) {
                this._broadcastNotFound();
                return;
            }

            await sleep(CHECK_DELAY_MS);
            if (!this._running || this._playSequence?.id !== sequence.id) return;

            const api = Api.getInstance as Api;
            if (!api.is_initialized) {
                await api.init(clientId, clientSecret);
            }

            const scores = await api.get_user_recent_scores(userId, true, true);
            for (const score of scores) {
                if (this._isValidScore(score, sequence)) {
                    log.info(
                        `Broadcasting recent score for beatmap ${sequence.beatmapId}: ${score.score} (${score.rank})`,
                    );
                    score.isBest = undefined;
                    this._monitor.broadcast(IPC_RD_NAMES.STABLE_RECENT_SCORE_CHANGED, score);
                    void this._resolveIsBest(score, userId, sequence.id);
                    return;
                }
            }

            this._broadcastNotFound();
        } catch (e) {
            log.error("Failed to record recent score:", e);
            this._broadcastNotFound();
        } finally {
            sequence.state = "done";
        }
    }

    private _broadcastNotFound() {
        if (!this._running) return;
        log.info("Broadcasting recent score not found");
        this._monitor.broadcast(IPC_RD_NAMES.STABLE_RECENT_SCORE_CHANGED, null);
    }

    private async _resolveIsBest(score: RespUserRecentScore, userId: number, sequenceId: number) {
        const api = Api.getInstance as Api;
        if (!api.is_initialized || !score.beatmap) return;

        const legacyOnly = this._isLegacyScore(score);
        const start = Date.now();
        while (Date.now() - start <= BEST_SCORE_RESOLVE_TIMEOUT_MS) {
            if (!this._running || this._playSequence?.id !== sequenceId) return;
            try {
                const top = await api.get_beatmap_user_score(score.beatmap.id, userId, legacyOnly);
                if (top?.score) {
                    score.isBest = this._isTopScore(score, top.score, legacyOnly);
                    if (!this._running || this._playSequence?.id !== sequenceId) return;
                    this._monitor.broadcast(IPC_RD_NAMES.STABLE_RECENT_SCORE_CHANGED, score);
                    return;
                }
            } catch (e) {
                if (e instanceof APIException && e.status === 404) {
                    score.isBest = true;
                    if (!this._running || this._playSequence?.id !== sequenceId) return;
                    this._monitor.broadcast(IPC_RD_NAMES.STABLE_RECENT_SCORE_CHANGED, score);
                    return;
                }
                log.warn("Failed to resolve best score, retrying...", e);
            }
            if (Date.now() - start + BEST_SCORE_POLL_INTERVAL_MS > BEST_SCORE_RESOLVE_TIMEOUT_MS) break;
            await sleep(BEST_SCORE_POLL_INTERVAL_MS);
        }

        if (!this._running || this._playSequence?.id !== sequenceId) return;
        score.isBest = false;
        this._monitor.broadcast(IPC_RD_NAMES.STABLE_RECENT_SCORE_CHANGED, score);
    }

    private _isLegacyScore(score: RespUserRecentScore): boolean {
        if (score.legacy_score_id !== undefined && score.legacy_score_id !== null) return true;
        if (score.total_score !== undefined || score.legacy_total_score !== undefined) return false;
        return true;
    }

    private _isTopScore(score: RespUserRecentScore, top: RespUserRecentScore, legacyOnly: boolean): boolean {
        if (top.id === score.id) return true;
        if (!legacyOnly) {
            const myScore = score.total_score ?? score.score;
            const topScore = top.total_score ?? top.score;
            return myScore > topScore;
        }
        return score.score > top.score;
    }

    private _isValidScore(score: RespUserRecentScore, sequence: PlaySequence): boolean {
        if (!score.beatmap || score.beatmap.id !== sequence.beatmapId) return false;

        const createdAt = new Date(score.created_at).getTime();
        if (Number.isNaN(createdAt)) return false;

        if (createdAt < sequence.startedAt - CHECK_START_TOLERANCE_MS) return false;
        if (createdAt > Date.now() + CHECK_START_TOLERANCE_MS) return false;

        if (sequence.beatmapChecksum && score.beatmap.checksum) {
            return score.beatmap.checksum.toLowerCase() === sequence.beatmapChecksum.toLowerCase();
        }

        return true;
    }

    private async _getUsername(stablePath: string): Promise<string | null> {
        try {
            const reader = StableReader.getInstance as StableReader;
            await reader.init(stablePath);
            const username = await reader.get_username();
            if (username) {
                log.info(`Read username from StableReader: ${username}`);
                return username;
            }
        } catch (e) {
            log.warn("Failed to get username from StableReader:", e);
        }

        log.warn("Could not read username from StableReader; local score fallback will be used");
        return null;
    }

    /**
     * @deprecated osu!.db now stores the username in its header. This method is
     * kept only as an emergency fallback and should be removed once confirmed stable.
     */
    public static getUsernameFromIni(stablePath: string): string | null {
        let sysUser = process.env.USERNAME || "";
        try {
            sysUser = os.userInfo().username || sysUser;
        } catch {}
        const candidates = new Set<string>();

        if (sysUser) {
            candidates.add(path.join(stablePath, `osu!.${sysUser}.cfg`));
        }

        try {
            const files = fs.readdirSync(stablePath);
            for (const f of files) {
                if (/^osu!\.[^.]+\.cfg$/.test(f)) {
                    candidates.add(path.join(stablePath, f));
                }
            }
        } catch {}

        for (const p of candidates) {
            try {
                const content = readFileSync(p);
                for (const line of content.split(/\r?\n/)) {
                    const match = line.match(CFG_USERNAME_RE);
                    if (match) return match[1];
                }
            } catch {}
        }

        log.warn(`Could not read osu! username from ${stablePath}`);
        return null;
    }

    private async _resolveUserId(username: string): Promise<number | null> {
        if (/^\d+$/.test(username)) {
            return Number(username);
        }

        const config = Config.getInstance as Config;
        const clientId = config.get(ConfigKey.API_CLIENT_ID) ?? "";
        const clientSecret = config.get(ConfigKey.API_CLIENT_SECRET) ?? "";
        if (!clientId || !clientSecret) return null;

        const api = Api.getInstance as Api;
        if (!api.is_initialized) {
            await api.init(clientId, clientSecret);
        }

        try {
            const info = await api.get_user_info(username);
            return info.id;
        } catch (e) {
            log.error("Failed to resolve user id for", username, e);
            return null;
        }
    }
}
