import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/en";
import "dayjs/locale/ja";
import "dayjs/locale/zh-tw";
import { useEffect, useState } from "react";

// plugins
dayjs.extend(relativeTime);
dayjs.locale("zh-tw");

export function setDayjsLocale(lang: string): void {
    const localeMap: Record<string, string> = {
        "zh-TW": "zh-tw",
        "en-US": "en",
        "ja-JP": "ja",
    };
    dayjs.locale(localeMap[lang] ?? "en");
}

export function formatTimeAgo(timestamp: number): string {
    return dayjs(timestamp).fromNow();
}

export function useNow(intervalMs: number | null = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (intervalMs === null) return;
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

export function useNowAdaptive(latestTimestamp: number | null): number {
    const [now, setNow] = useState(() => Date.now());
    const highFreq = latestTimestamp !== null && now - latestTimestamp < 60_000;
    useEffect(() => {
        if (latestTimestamp === null) return;
        const id = setInterval(() => setNow(Date.now()), highFreq ? 1000 : 30_000);
        return () => clearInterval(id);
    }, [latestTimestamp, highFreq]);
    return now;
}

export function formatDateTime(timestamp: number): string {
    return dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss");
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, _) => {
        if (signal?.aborted) {
            return;
        }

        const timeout = setTimeout(() => {
            resolve();
        }, ms);

        if (signal) {
            signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                resolve();
            });
        }
    });
}
