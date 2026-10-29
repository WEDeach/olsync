import { pickerDateTimestamp } from "./pickerLogic";

export type NumericMode = "greater" | "equal" | "less";

export interface NumericRange {
    min?: number;
    max?: number;
}

export interface DateBounds {
    since?: number;
    until?: number;
}

export const MATCH_NOTHING_BOUNDS: DateBounds = { since: Number.POSITIVE_INFINITY };

const RANGE_SLACK = 1e-4;

export function numericRangeOf(target: number, mode: NumericMode, tolerance: number): NumericRange {
    const slack = tolerance + RANGE_SLACK;
    if (mode === "less") return { max: target + slack };
    if (mode === "equal") return { min: target - slack, max: target + slack };
    return { min: target - slack };
}

export function inNumericRange(value: number, range: NumericRange): boolean {
    if (!Number.isFinite(value)) return false;
    return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

export function dateRangeBounds(from: string, to: string): DateBounds | null {
    const since = from ? pickerDateTimestamp(from) : undefined;
    const until = to ? pickerDateTimestamp(to, true) : undefined;
    if (since !== undefined && !Number.isFinite(since)) return null;
    if (until !== undefined && !Number.isFinite(until)) return null;
    if (since !== undefined && until !== undefined && since > until) return null;
    return { since, until };
}

export function lastPlayedInBounds(played: number, bounds: DateBounds): boolean {
    if (played <= 0) return false;
    return (
        (bounds.since === undefined || played >= bounds.since) && (bounds.until === undefined || played <= bounds.until)
    );
}

export function parseDrainInput(text: string): number | undefined {
    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    const clock = /^(?:(\d+):)?([0-5]?\d):([0-5]?\d)$/.exec(trimmed);
    if (!clock) return undefined;
    const hours = clock[1] ? Number(clock[1]) : 0;
    return hours * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
}

export function formatDrainSeconds(seconds: number): string {
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const secs = String(total % 60).padStart(2, "0");
    return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`;
}
