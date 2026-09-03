import type { LastPlayingStatus, StableIpcClientData } from "../defines/stable_structs";
import { StableIpcMode } from "../defines/stable_structs";

export const INITIAL_LAST_PLAYING_STATUS: LastPlayingStatus = {
    BeatmapId: 0,
    BeatmapChecksum: "",
    IsChecked: false,
};

export function isActiveLocalStablePlay(data: StableIpcClientData): boolean {
    return (
        data.Connected === true &&
        data.Mode === StableIpcMode.Play &&
        data.LReplayMode === false &&
        data.LReplayStreaming !== true &&
        (data.SpectatingID ?? 0) <= 0
    );
}

export function updateLastPlayingStatus(previous: LastPlayingStatus, data: StableIpcClientData): LastPlayingStatus {
    if (!isActiveLocalStablePlay(data)) {
        return previous;
    }

    const next = {
        BeatmapId: data.BeatmapId ?? 0,
        BeatmapChecksum: data.BeatmapChecksum ?? "",
        IsChecked: false,
    };
    if (
        previous.BeatmapId === next.BeatmapId &&
        previous.BeatmapChecksum === next.BeatmapChecksum &&
        previous.IsChecked === next.IsChecked
    ) {
        return previous;
    }
    return next;
}
