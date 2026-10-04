import { createHash } from "crypto";

export interface LazerHashableFile {
    Filename: string;
    File: { Hash: string };
}

export function computeLazerSetHash(
    files: Iterable<LazerHashableFile>,
    previous: string,
    readFile: (hash: string) => Buffer | undefined,
): string {
    const hash = createHash("sha256");
    let size = 0;
    const ordered = Array.from(files)
        .filter((file) => file.Filename.toLowerCase().endsWith(".osu"))
        .sort((a, b) => a.Filename.localeCompare(b.Filename));
    for (const file of ordered) {
        const bytes = readFile(file.File.Hash);
        if (bytes === undefined) throw new Error(`Cannot read hashable beatmap file: ${file.Filename}`);
        hash.update(bytes);
        size += bytes.length;
    }
    return size > 0 ? hash.digest("hex") : previous;
}
