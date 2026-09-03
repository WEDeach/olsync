import type { StableBeatmapDetail } from "../../../defines/stable_structs";
import type { OsuBeatmap } from "../../../utils/osu";

const getBasename = (filePath: string): string => filePath.replace(/\\/g, "/").split("/").pop() ?? "";

export const guessMimeTypeFromPath = (filePath: string): string => {
    const extension = filePath.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        case "gif":
            return "image/gif";
        case "bmp":
            return "image/bmp";
        case "mp3":
            return "audio/mpeg";
        case "ogg":
            return "audio/ogg";
        case "wav":
            return "audio/wav";
        case "flac":
            return "audio/flac";
        default:
            return "application/octet-stream";
    }
};

export async function loadBeatmapBackground(
    map: OsuBeatmap,
    osuPath: string,
    detail?: StableBeatmapDetail | null,
): Promise<string | null> {
    const fallback = map._coverUrl ?? null;
    if (!osuPath) return fallback;

    const resolvedDetail = detail === undefined ? await window.olsCore.getStableBeatmapDetail(map.md5Hash) : detail;
    if (!resolvedDetail) return fallback;

    const songsPath = `${osuPath}/Songs`;
    const osuFile = await window.olsCore.readBeatmapAsset(
        songsPath,
        resolvedDetail.path,
        resolvedDetail.osuFileName,
        "utf8",
    );
    if (typeof osuFile !== "string") return fallback;

    const line = osuFile.split(/\r?\n/).find((value) => /^0,0,"/.test(value.trim()));
    const match = line ? /^0,0,"([^"]+)"/.exec(line.trim()) : null;
    if (!match?.[1]) return fallback;

    const backgroundFile = getBasename(match[1]);
    const backgroundBase64 = await window.olsCore.readBeatmapAsset(
        songsPath,
        resolvedDetail.path,
        backgroundFile,
        "base64",
    );
    if (typeof backgroundBase64 !== "string") return fallback;

    return `data:${guessMimeTypeFromPath(match[1])};base64,${backgroundBase64}`;
}
