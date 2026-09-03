import { app } from "electron";
import * as fs from "original-fs";
import * as path from "path";
import { Transform } from "stream";
import * as yauzl from "yauzl";
import { type AppInstallLayout, resolveInstallTargetPath } from "../../../updater-core/appLayout";
import { ensureDir, pathJoin } from "../../../utils/file";
import { APP_ALLOWLIST, UPDATE_CONCURRENCY, UPDATE_MAX_EXTRACT_FILES, UPDATE_MAX_EXTRACT_SIZE } from "./constants";
import { applyBinaryPatch } from "./patch";
import { isWithinRoots, matchesAllowlist, normalizeArchivePath } from "./pathSafety";
import { sha256Buffer } from "./signature";
import { PayloadManifest, UpdateError, VerifiedPackage } from "./types";

export interface StagedUpdate {
    stagingDir: string;
    payloadManifest: PayloadManifest;
}

export async function stagePackage(
    packageBuffer: Buffer,
    selected: VerifiedPackage,
    appLayout: AppInstallLayout,
): Promise<StagedUpdate> {
    const stagingDir = pathJoin(
        app.getPath("temp"),
        `olsync-update-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const zipPath = pathJoin(stagingDir, "package.zip");
    const seen = new Set<string>();
    let keepStaging = false;

    try {
        await ensureDir(stagingDir);
        await fs.promises.writeFile(zipPath, packageBuffer);
        console.log(
            "[stager debug] packageBuffer length",
            packageBuffer.length,
            "head",
            packageBuffer.slice(0, 16).toString("hex"),
            "zipPath",
            zipPath,
        );
        await extractZip(zipPath, stagingDir, seen);

        const payloadManifestPath = pathJoin(stagingDir, "payload-manifest.json");
        if (!fs.existsSync(payloadManifestPath)) {
            throw new UpdateError("Missing payload-manifest.json", "EPAYLOAD");
        }

        const payloadText = await fs.promises.readFile(payloadManifestPath, "utf8");
        if (sha256Buffer(Buffer.from(payloadText, "utf8")) !== selected.descriptor.payloadManifestSha256) {
            throw new UpdateError("Payload manifest hash mismatch", "EHASH");
        }

        let payloadManifest: PayloadManifest;
        try {
            payloadManifest = JSON.parse(payloadText) as PayloadManifest;
        } catch {
            throw new UpdateError("Invalid payload manifest JSON", "EJSON");
        }

        validatePayloadManifestSchema(payloadManifest, stagingDir);
        await applyPatchesToStaging(payloadManifest, stagingDir, appLayout);
        await verifyStagedFiles(stagingDir, payloadManifest);
        await fs.promises.rm(zipPath, { force: true }).catch(() => {});
        keepStaging = true;

        return { stagingDir, payloadManifest };
    } catch (error) {
        console.error("[stager debug] stagePackage error:", error, "stagingDir:", stagingDir, "zipPath:", zipPath);
        throw error;
    } finally {
        if (!keepStaging) {
            await fs.promises.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        }
    }
}

class ByteLimitTransform extends Transform {
    private written = 0;

    constructor(
        private entryLimit: number,
        private totalLimit: number,
        private totalTracker: { value: number },
        private onExceeded: () => void,
    ) {
        super();
    }

    _transform(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void) {
        const length = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        this.written += length;
        this.totalTracker.value += length;

        if (this.written > this.entryLimit || this.totalTracker.value > this.totalLimit) {
            this.onExceeded();
            callback(new UpdateError("Archive extraction exceeded size limit", "ELARGE"));
            return;
        }

        callback(null, chunk);
    }
}

async function extractZip(zipPath: string, stagingDir: string, seen: Set<string>): Promise<void> {
    let running = 0;
    let currentCount = 0;
    const totalWritten = { value: 0 };
    const activePaths: string[] = [];
    let rejected = false;

    await new Promise<void>((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
            if (err) {
                reject(err);
                return;
            }

            let ended = false;

            const maybeEnd = () => {
                if (running === 0 && ended) {
                    zipfile.close();
                    resolve();
                }
            };

            const readNext = () => {
                if (!rejected && running < UPDATE_CONCURRENCY && !ended) {
                    zipfile.readEntry();
                }
            };

            const abort = (e: Error) => {
                if (rejected) return;
                rejected = true;
                zipfile.close();
                // Remove partially written outputs on failure.
                for (const p of activePaths) {
                    fs.unlink(p, () => {});
                }
                reject(e);
            };

            zipfile.on("entry", (entry) => {
                const normalizedFileName = entry.fileName.replace(/\\/g, "/");
                if (normalizedFileName.endsWith("/") || normalizedFileName.startsWith("__MACOSX/")) {
                    readNext();
                    return;
                }

                let relPath: string;
                try {
                    relPath = normalizeArchivePath(normalizedFileName, stagingDir);
                } catch (e) {
                    abort(e as Error);
                    return;
                }

                const lower = relPath.toLowerCase();
                if (seen.has(lower)) {
                    abort(new UpdateError(`Duplicate or case-collision path: ${relPath}`, "EDUPE"));
                    return;
                }
                seen.add(lower);

                currentCount += 1;
                if (currentCount > UPDATE_MAX_EXTRACT_FILES) {
                    abort(new UpdateError("Too many files in archive", "EMANYFILES"));
                    return;
                }

                // Treat the entry's declared uncompressed size as a hint, but the real
                // limit is enforced on bytes flowing through the write stream.
                if (entry.uncompressedSize > UPDATE_MAX_EXTRACT_SIZE) {
                    abort(new UpdateError(`Declared entry size exceeds extraction limit: ${relPath}`, "ELARGE"));
                    return;
                }

                running += 1;
                readNext();

                const targetPath = pathJoin(stagingDir, relPath);
                activePaths.push(targetPath);

                ensureDir(path.dirname(targetPath))
                    .then(() => {
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) {
                                abort(err);
                                return;
                            }

                            const writeStream = fs.createWriteStream(targetPath);
                            const limiter = new ByteLimitTransform(
                                entry.uncompressedSize > 0 ? entry.uncompressedSize : UPDATE_MAX_EXTRACT_SIZE,
                                UPDATE_MAX_EXTRACT_SIZE,
                                totalWritten,
                                () => writeStream.destroy(),
                            );

                            readStream.on("error", (e) => abort(e));
                            limiter.on("error", (e) => {
                                writeStream.destroy();
                                abort(e);
                            });
                            writeStream.on("error", (e) => {
                                limiter.destroy();
                                abort(e);
                            });
                            writeStream.on("finish", () => {
                                try {
                                    const lstat = fs.lstatSync(targetPath);
                                    if (lstat.isSymbolicLink()) {
                                        fs.unlinkSync(targetPath);
                                        throw new UpdateError("Symlinks are not allowed", "ESYMLINK");
                                    }
                                } catch (e) {
                                    abort(e as Error);
                                    return;
                                }

                                const idx = activePaths.indexOf(targetPath);
                                if (idx !== -1) activePaths.splice(idx, 1);
                                running -= 1;
                                readNext();
                                maybeEnd();
                            });

                            readStream.pipe(limiter).pipe(writeStream);
                        });
                    })
                    .catch((e) => abort(e));
            });

            zipfile.on("end", () => {
                ended = true;
                maybeEnd();
            });

            zipfile.on("error", (e) => abort(e));
            zipfile.readEntry();
        });
    });
}

function validatePayloadManifestSchema(manifest: PayloadManifest, stagingDir: string): void {
    if (manifest.schemaVersion !== 1) throw new UpdateError("Unsupported payload manifest schema", "ESCHEMA");

    const seen = new Set<string>();
    for (const entry of manifest.entries) {
        const rel = entry.path.replace(/\\/g, "/");
        if (seen.has(rel.toLowerCase())) throw new UpdateError("Duplicate path in payload manifest", "EDUPE");
        seen.add(rel.toLowerCase());

        normalizeArchivePath(rel, stagingDir);
        if (!isWithinRoots(pathJoin(stagingDir, rel), [stagingDir])) {
            throw new UpdateError(`Payload path outside staging: ${rel}`, "EOUTSIDE");
        }

        if (entry.operation === "delete") {
            if (!matchesAllowlist(rel, APP_ALLOWLIST)) {
                throw new UpdateError(`Delete path not in allowlist: ${rel}`, "EALLOWLIST");
            }
            if (entry.baseSha256 && !/^[0-9a-f]{64}$/i.test(entry.baseSha256)) {
                throw new UpdateError(`Invalid base hash: ${rel}`, "EHASH");
            }
            continue;
        }

        if (entry.operation !== "add" && entry.operation !== "replace") {
            throw new UpdateError(`Invalid operation: ${entry.operation}`, "EOPERATION");
        }

        if (!matchesAllowlist(rel, APP_ALLOWLIST)) {
            throw new UpdateError(`Payload path not in allowlist: ${rel}`, "EALLOWLIST");
        }

        if (!/^[0-9a-f]{64}$/i.test(entry.targetSha256)) {
            throw new UpdateError(`Invalid target hash: ${rel}`, "EHASH");
        }

        if (entry.targetSize < 0) {
            throw new UpdateError(`Invalid target size: ${rel}`, "ESIZE");
        }

        if (entry.patchSha256) {
            if (!/^[0-9a-f]{64}$/i.test(entry.patchSha256)) {
                throw new UpdateError(`Invalid patch hash: ${rel}`, "EHASH");
            }
            if (entry.patchSize === undefined || entry.patchSize < 0) {
                throw new UpdateError(`Missing patch size: ${rel}`, "ESIZE");
            }
            if (!entry.baseSha256 || !/^[0-9a-f]{64}$/i.test(entry.baseSha256)) {
                throw new UpdateError(`Missing base hash for patch: ${rel}`, "EHASH");
            }
        }
    }
}

async function applyPatchesToStaging(
    manifest: PayloadManifest,
    stagingDir: string,
    appLayout: AppInstallLayout,
): Promise<void> {
    for (const entry of manifest.entries) {
        if (!entry.patchSha256) continue;

        const rel = entry.path.replace(/\\/g, "/");
        const patchPath = pathJoin(stagingDir, rel);
        if (!fs.existsSync(patchPath)) throw new UpdateError(`Patch file missing: ${rel}`, "EMISSING");

        const patchBuffer = await fs.promises.readFile(patchPath);
        if (sha256Buffer(patchBuffer) !== entry.patchSha256) {
            throw new UpdateError(`Patch hash mismatch: ${rel}`, "EHASH");
        }
        if (entry.patchSize !== undefined && patchBuffer.length !== entry.patchSize) {
            throw new UpdateError(`Patch size mismatch: ${rel}`, "ESIZE");
        }

        const basePath = resolveInstallTargetPath(rel, appLayout);
        if (!fs.existsSync(basePath)) throw new UpdateError(`Base file missing for patch: ${rel}`, "EMISSING");
        const baseBuffer = await fs.promises.readFile(basePath);
        if (sha256Buffer(baseBuffer) !== entry.baseSha256) {
            throw new UpdateError(`Base hash mismatch for patch: ${rel}`, "EHASH");
        }

        let result: Buffer;
        try {
            result = applyBinaryPatch(baseBuffer, patchBuffer);
        } catch (error) {
            throw new UpdateError(`Patch apply failed: ${rel}: ${(error as Error).message}`, "EPATCH");
        }

        if (sha256Buffer(result) !== entry.targetSha256) {
            throw new UpdateError(`Patched result hash mismatch: ${rel}`, "EHASH");
        }
        if (result.length !== entry.targetSize) {
            throw new UpdateError(`Patched result size mismatch: ${rel}`, "ESIZE");
        }

        await fs.promises.writeFile(patchPath, result);
        // The in-memory entry no longer represents a patch for the installer.
        entry.patchSha256 = undefined;
        entry.patchSize = undefined;
    }
}

async function verifyStagedFiles(stagingDir: string, manifest: PayloadManifest): Promise<void> {
    for (const entry of manifest.entries) {
        if (entry.operation === "delete") continue;

        const rel = entry.path.replace(/\\/g, "/");
        const filePath = pathJoin(stagingDir, rel);
        if (!fs.existsSync(filePath)) throw new UpdateError(`Staged file missing: ${rel}`, "EMISSING");

        const stat = await fs.promises.stat(filePath);
        if (stat.size !== entry.targetSize) throw new UpdateError(`Staged size mismatch: ${rel}`, "ESIZE");

        const hash = sha256Buffer(await fs.promises.readFile(filePath));
        if (hash !== entry.targetSha256) throw new UpdateError(`Staged hash mismatch: ${rel}`, "EHASH");
    }
}
