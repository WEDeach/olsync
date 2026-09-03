import * as nodeFs from "fs";

let rawFs: typeof nodeFs | undefined;
let rawFsInit: Promise<typeof nodeFs> | undefined;

/**
 * Returns the raw Node fs module, preferring `original-fs` when available
 * (Electron) so .asar files are read/written as plain files instead of being
 * intercepted by Electron's asar virtual filesystem. Falls back to the standard
 * `fs` module in plain Node (e.g. the release generator).
 */
export async function getRawFs(): Promise<typeof nodeFs> {
    if (rawFs) return rawFs;
    if (rawFsInit) return rawFsInit;

    rawFsInit = (async () => {
        try {
            const mod = (await import("original-fs")) as typeof nodeFs;
            return mod;
        } catch {
            return nodeFs;
        }
    })();

    rawFs = await rawFsInit;
    return rawFs;
}
