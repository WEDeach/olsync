/**
 * Lazer score statistics parsing, shared by the lazer worker process and the
 * main-process picker roll. No renderer dependencies.
 */
export function parseLazerStatistics(
    statisticsJson: string | undefined,
    rulesetId: number,
): {
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    countGeki: number;
    countKatu: number;
} {
    const empty = { count300: 0, count100: 0, count50: 0, countMiss: 0, countGeki: 0, countKatu: 0 };
    if (!statisticsJson) return empty;
    try {
        const s = JSON.parse(statisticsJson) as Record<string, number>;
        const count300 = s.great ?? 0;
        const countMiss = rulesetId === 2 ? (s.miss ?? 0) + (s.large_tick_miss ?? 0) : (s.miss ?? 0);
        let count100: number;
        let count50: number;
        let countGeki: number;
        let countKatu: number;
        switch (rulesetId) {
            case 1:
                count100 = s.ok ?? 0;
                count50 = 0;
                countGeki = s.large_bonus ?? 0;
                countKatu = 0;
                break;
            case 2:
                count100 = s.large_tick_hit ?? 0;
                count50 = s.small_tick_hit ?? 0;
                countGeki = 0;
                countKatu = s.small_tick_miss ?? 0;
                break;
            case 3:
                count100 = s.ok ?? 0;
                count50 = s.meh ?? 0;
                countGeki = s.perfect ?? 0;
                countKatu = s.good ?? 0;
                break;
            default:
                count100 = s.ok ?? 0;
                count50 = s.meh ?? 0;
                countGeki = 0;
                countKatu = 0;
                break;
        }
        return { count300, count100, count50, countMiss, countGeki, countKatu };
    } catch {
        return empty;
    }
}
