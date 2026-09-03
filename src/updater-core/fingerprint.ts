import * as nodeFs from "fs";
import * as path from "path";
import { getRawFs } from "./fs";
import { sha256Buffer } from "./hash";
import { matchesAllowlist } from "./pathPolicy";
import type { RuntimeFingerprintEntry } from "./types";

// Build/runtime artifacts and user data that should never influence the
// runtime fingerprint (and therefore should not force a manual update).
export const EXCLUDED_RUNTIME_DIRS = [
    "data",
    "cache",
    "logs",
    "backup",
    "update-",
    ".build-snapshots",
    "release",
    "node_modules",
    ".git",
    "olsync-update-",
    "olsync-overall-",
    "olsync-full-",
    "olsync-diff-",
];

export interface ComputeFingerprintOptions {
    allowlist: string[];
    excludedDirs?: string[];
    negateAllowlist?: string[];
}

export async function computeRuntimeFingerprint(appDir: string, options: ComputeFingerprintOptions): Promise<string> {
    const rawFs = await getRawFs();
    const entries = await walkRuntimeFiles(appDir, options, rawFs);
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const parts: string[] = [];
    for (const e of entries) {
        parts.push(`${e.relativePath}|${String(e.size)}|${e.hash}`);
    }
    return sha256Buffer(Buffer.from(parts.join("\n"), "utf8"));
}

export async function collectRuntimeFingerprintEntries(
    appDir: string,
    options: ComputeFingerprintOptions,
): Promise<RuntimeFingerprintEntry[]> {
    const rawFs = await getRawFs();
    const entries = await walkRuntimeFiles(appDir, options, rawFs);
    entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return entries;
}

async function walkRuntimeFiles(
    dir: string,
    options: ComputeFingerprintOptions,
    rawFs: typeof nodeFs,
    root = dir,
    rel = "",
    out: RuntimeFingerprintEntry[] = [],
): Promise<RuntimeFingerprintEntry[]> {
    const excludedDirs = options.excludedDirs ?? EXCLUDED_RUNTIME_DIRS;
    const entries = await rawFs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) {
            continue;
        }
        if (entry.isDirectory()) {
            if (excludedDirs.some((ex) => isExcludedRuntimeName(entry.name, ex))) continue;
            await walkRuntimeFiles(path.join(dir, entry.name), options, rawFs, root, entryRel, out);
        } else if (entry.isFile()) {
            if (!matchesAllowlist(entryRel, options.allowlist)) continue;
            if (options.negateAllowlist && matchesAllowlist(entryRel, options.negateAllowlist)) continue;
            const fullPath = path.join(dir, entry.name);
            const stat = await rawFs.promises.stat(fullPath);
            const buffer = await rawFs.promises.readFile(fullPath);
            const hash = sha256Buffer(buffer);
            out.push({ relativePath: entryRel.replace(/\\/g, "/"), size: stat.size, hash });
        }
    }
    return out;
}

export function isExcludedRuntimeName(name: string, excluded: string): boolean {
    if (name === excluded) return true;
    if (excluded.endsWith("-")) return name.startsWith(excluded);
    return false;
}
