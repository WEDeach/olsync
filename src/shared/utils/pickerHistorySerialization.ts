import type { IPickerHistory } from "../../renderer/components/beatmapPickerTypes";

const OPTIONAL_ROOT_FIELDS = [
    "md5Hash",
    "artist",
    "songTitle",
    "difficultyName",
    "creatorName",
    "beatmapData",
] as const;

export function preparePickerHistoryEntryForSave(entry: IPickerHistory): IPickerHistory {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const prepared: Record<string, unknown> = { ...entry };
    for (const field of OPTIONAL_ROOT_FIELDS) {
        if (prepared[field] === undefined) delete prepared[field];
    }
    const snapshot = prepared.beatmapData;
    if (snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot)) {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(snapshot as Record<string, unknown>)) {
            if (value !== undefined) cleaned[key] = value;
        }
        prepared.beatmapData = cleaned;
    }
    return prepared as unknown as IPickerHistory;
}
