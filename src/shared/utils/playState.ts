export interface ScoreSummary {
    count: number;
    latestMs: number;
}

export const NO_SCORES: ScoreSummary = { count: 0, latestMs: 0 };

export function summarizeScores(scores: readonly { date: Date | number | string }[] | undefined): ScoreSummary {
    if (!scores || scores.length === 0) return NO_SCORES;
    let latestMs = 0;
    for (const score of scores) {
        const time = score.date instanceof Date ? score.date.getTime() : new Date(score.date).getTime();
        if (Number.isFinite(time) && time > latestMs) latestMs = time;
    }
    return { count: scores.length, latestMs };
}

export function lastPlayedMs(value: Date | number | null | undefined): number {
    const time = value instanceof Date ? value.getTime() : Number(value ?? 0);
    return Number.isFinite(time) && time > 0 ? time : 0;
}

export interface PlayState {
    played: boolean;
    lastPlayedMs: number;
}

export function resolvePlayState(
    map: { unplayed: boolean; storedLastPlayedMs: number },
    scores: ScoreSummary,
): PlayState {
    return {
        played: !map.unplayed || scores.count > 0,
        lastPlayedMs: Math.max(map.storedLastPlayedMs, scores.latestMs),
    };
}
