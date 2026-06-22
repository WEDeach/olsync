export type DLSource = "osu-official" | "mirror" | "pack";

export type DLStatus = "queued" | "downloading" | "done" | "error" | "cancelled" | "held" | "missing" | "paused";

export interface AuthRequiredPayload {
    hostname: string;
}

export interface DownloadTask {
    id: string;
    source: DLSource;
    url: string;
    filename: string;
    beatmapsetId?: number;
    savePath: string;
    status: DLStatus;
    progress: number;
    speedBps: number;
    totalBytes: number;
    receivedBytes: number;
    error?: string;
    addedAt: number;
    finishedAt?: number;
    chunkCount?: number;
    activeChunkCount?: number;
}

export interface EnqueueRequest {
    source: DLSource;
    url: string;
    filename: string;
    beatmapsetId?: number;
}

export interface CachedDownload {
    id: string;
    filename: string;
    url: string;
    savePath: string;
    downloadedAt: number;
    beatmapsetId?: number | null;
    source: DLSource;
    status?: DLStatus;
    error?: string | null;
    finishedAt?: number;
}
