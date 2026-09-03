const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeProfileId(profileId: string): string {
    const safe = profileId
        .replace(/[\\/:*?"<>|]/g, "_")
        .split("")
        .map((c) => (c.charCodeAt(0) < 32 ? "_" : c))
        .join("")
        .trim();
    if (!safe || safe === "." || safe === ".." || WINDOWS_RESERVED_NAMES.test(safe)) {
        throw new Error("Invalid picker profile id");
    }
    return safe;
}
