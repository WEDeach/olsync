export interface TrackerDailyStat {
    date: string;
    playCount: number;
    totalScore: number;
    totalAccSum: number;
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    gradeCount: Record<string, number>;
}

export interface TrackerUserSummary {
    userName: string;
    updatedAt: number;
    dailyStats: TrackerDailyStat[];
    totalGrades: Record<string, number>;
    zoomStart?: number;
    zoomEnd?: number;
}
