import * as path from "path";
import { ProtocolError } from "./types";

const WIN_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;

/**
 * Normalize an archive entry name to a safe relative POSIX path and verify it
 * stays inside the provided root directory.
 */
export function normalizeArchivePath(entryName: string, rootDir: string): string {
    if (entryName.startsWith("/") || entryName.startsWith("\\") || /^[A-Za-z]:/.test(entryName)) {
        throw new ProtocolError(`Absolute path in archive: ${entryName}`, "EPATH");
    }
    if (entryName.startsWith("\\\\")) {
        throw new ProtocolError(`UNC path in archive: ${entryName}`, "EUNC");
    }

    const normalized = entryName
        .replace(/\\/g, "/")
        .split("/")
        .filter((s) => s !== "" && s !== ".")
        .join("/");

    if (normalized.includes("..")) {
        throw new ProtocolError(`Path traversal in archive: ${entryName}`, "ETRAVERSE");
    }

    const parts = normalized.split("/");
    for (const part of parts) {
        if (WIN_RESERVED_NAMES.test(part)) {
            throw new ProtocolError(`Reserved path segment: ${part}`, "ERESERVED");
        }
    }

    if (normalized === "") {
        throw new ProtocolError("Empty archive path", "EEMPTY");
    }

    const resolved = path.resolve(rootDir, ...parts);
    const resolvedRoot = path.resolve(rootDir);
    if (!isInsideRoot(resolved, resolvedRoot)) {
        throw new ProtocolError(`Resolved path outside root: ${entryName}`, "EOUTSIDE");
    }

    return normalized;
}

export function isWithinRoots(filePath: string, roots: string[]): boolean {
    const resolved = path.resolve(filePath);
    return roots.some((r) => isInsideRoot(resolved, path.resolve(r)));
}

function isInsideRoot(child: string, root: string): boolean {
    const lowerChild = child.toLowerCase();
    const lowerRoot = root.toLowerCase();
    const prefix = lowerRoot.endsWith(path.sep) ? lowerRoot : `${lowerRoot}${path.sep}`;
    return lowerChild === lowerRoot || lowerChild.startsWith(prefix);
}

export function matchesAllowlist(relativePath: string, patterns: string[]): boolean {
    const parts = relativePath.split("/");
    for (const pattern of patterns) {
        if (matchGlob(parts, pattern.split("/"))) return true;
    }
    return false;
}

function matchGlob(pathParts: string[], patternParts: string[]): boolean {
    let pi = 0;
    for (let i = 0; i < patternParts.length; i++) {
        const pat = patternParts[i];
        if (pat === "**") {
            if (i === patternParts.length - 1) return true;
            const next = patternParts[i + 1];
            while (pi < pathParts.length && pathParts[pi] !== next) pi++;
            if (pi >= pathParts.length) return false;
            continue;
        }
        if (pi >= pathParts.length) return false;
        if (pat !== "*" && pat !== pathParts[pi]) return false;
        pi++;
    }
    return pi === pathParts.length;
}
