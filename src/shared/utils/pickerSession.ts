export type PickerSource = "stable" | "lazer";

export function shouldRestorePickerSession(source: PickerSource | null, hasStableCache: boolean): boolean {
    return source === "lazer" || (source === "stable" && hasStableCache);
}
