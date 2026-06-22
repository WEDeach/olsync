import { DownloadTask } from "../../../defines/download_types";

export function createSpeedLimiter(limitBps: number): { throttle: (bytes: number) => Promise<void> } | null {
    if (limitBps <= 0) return null;
    const state = { tokens: limitBps, lastRefill: Date.now() };
    return {
        throttle: async (bytes: number): Promise<void> => {
            const now = Date.now();
            const elapsed = (now - state.lastRefill) / 1000;
            state.tokens = Math.min(limitBps, state.tokens + elapsed * limitBps);
            state.lastRefill = now;
            if (state.tokens < bytes) {
                const waitMs = Math.ceil(((bytes - state.tokens) / limitBps) * 1000);
                await new Promise((r) => setTimeout(r, waitMs));
            }
            state.tokens -= Math.min(state.tokens, bytes);
        },
    };
}

export function createProgressTracker(
    task: DownloadTask,
    totalBytes: number,
    onEmit: (task: DownloadTask) => void,
    emitIntervalMs = 500,
): { onBytes: (bytes: number) => void } {
    let lastCalc = Date.now();
    let lastBytes = task.receivedBytes;
    return {
        onBytes: (bytes: number): void => {
            task.receivedBytes = bytes;
            task.progress = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
            const now = Date.now();
            if (now - lastCalc >= emitIntervalMs) {
                const elapsed = (now - lastCalc) / 1000;
                task.speedBps = Math.round((bytes - lastBytes) / elapsed);
                lastCalc = now;
                lastBytes = bytes;
                onEmit(task);
            }
        },
    };
}
