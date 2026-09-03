/// <reference path="../src/assets.d.ts" />
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import oxipngBin from "oxipng-bin";
import pngquantBin from "pngquant-bin";

const DEFAULT_PATTERN = "src/renderer/assets/onboarding/**/*.png";

function formatSize(bytes: number): string {
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function optimizeFile(filePath: string, tempDir: string): number {
    const originalSize = fs.statSync(filePath).size;
    const quantFile = path.join(tempDir, `${randomUUID()}.png`);
    const optFile = path.join(tempDir, `${randomUUID()}.png`);

    let quantFileExists = false;
    try {
        execFileSync(pngquantBin, [
            "--speed=1",
            "--quality=80-100",
            "--skip-if-larger",
            "--output",
            quantFile,
            filePath,
        ], { stdio: ["ignore", "ignore", "pipe"] });
        quantFileExists = fs.existsSync(quantFile);
    } catch {
        quantFileExists = false;
    }

    const oxipngInput = quantFileExists ? quantFile : filePath;
    let optFileExists = false;
    try {
        execFileSync(oxipngBin, ["-o", "4", "--strip", "safe", "--out", optFile, oxipngInput], {
            stdio: ["ignore", "ignore", "pipe"],
        });
        optFileExists = fs.existsSync(optFile);
    } catch {
        optFileExists = false;
    }

    let bestFile: string | undefined;
    let bestSize = originalSize;

    if (optFileExists) {
        const size = fs.statSync(optFile).size;
        if (size < bestSize) {
            bestFile = optFile;
            bestSize = size;
        }
    }

    if (quantFileExists) {
        const size = fs.statSync(quantFile).size;
        if (size < bestSize) {
            bestFile = quantFile;
            bestSize = size;
        }
    }

    if (bestFile) {
        fs.renameSync(bestFile, filePath);
    }

    if (fs.existsSync(quantFile)) {
        fs.unlinkSync(quantFile);
    }
    if (fs.existsSync(optFile)) {
        fs.unlinkSync(optFile);
    }

    return originalSize - bestSize;
}

function main() {
    const pattern = process.argv[2] ?? DEFAULT_PATTERN;
    const cwd = process.cwd();
    const files = fs.globSync(pattern, { cwd });

    if (files.length === 0) {
        console.log(`No PNG files found for pattern: ${pattern}`);
        return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-png-"));
    let totalSaved = 0;
    let totalBefore = 0;

    for (const relativePath of files) {
        const filePath = path.resolve(cwd, relativePath);
        const before = fs.statSync(filePath).size;
        const saved = optimizeFile(filePath, tempDir);
        const after = before - saved;
        totalBefore += before;
        totalSaved += saved;

        if (saved > 0) {
            console.log(
                `Optimized: ${path.relative(cwd, filePath)} (${formatSize(before)} -> ${formatSize(after)}, saved ${formatSize(saved)})`,
            );
        } else {
            console.log(
                `Skipped: ${path.relative(cwd, filePath)} (${formatSize(before)} could not be reduced)`,
            );
        }
    }

    fs.rmdirSync(tempDir);

    console.log(
        `\nTotal: ${files.length} files, ${formatSize(totalBefore)} -> ${formatSize(totalBefore - totalSaved)}, saved ${formatSize(totalSaved)}`,
    );
}

main();
