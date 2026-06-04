import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-tw";
import "dayjs/locale/en";
import { useEffect, useState } from "react";

// plugins
dayjs.extend(relativeTime);
dayjs.locale(navigator.language.toLocaleLowerCase());

export function formatTimeAgo(timestamp: number): string {
    return dayjs(timestamp).fromNow();
}

export function useNow(intervalMs = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
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
