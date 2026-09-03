import type { OsuBeatmap } from "./osu";

export const getBeatmapTotalMilliseconds = (map: OsuBeatmap): number => {
    if (map.totalMilliseconds && map.totalMilliseconds > 0) return map.totalMilliseconds;
    return Math.max(0, map.drainSeconds * 1000);
};

export const getPlayingProgress = (menuTime: number | undefined, totalMilliseconds: number): number => {
    if (menuTime === undefined || !Number.isFinite(menuTime) || !Number.isFinite(totalMilliseconds)) return 0;
    if (totalMilliseconds <= 0) return 0;
    return Math.min(1, Math.max(0, menuTime / totalMilliseconds));
};

export const formatPlayingTime = (milliseconds: number): string => {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};
