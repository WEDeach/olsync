import { dumps, loads } from "@zenoaihq/tson";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fDevMode } from "./common";
import { createLogger } from "./logger";
import { ServiceCode, SpaceId } from "./typed/file";

const log = createLogger("uFile");

let originalFs: typeof fs;
try {
    originalFs = require("original-fs");
    log.info("original-fs loaded successfully");
} catch (_e) {
    log.info("original-fs not available, using standard fs");
    originalFs = fs;
}

export const pRoot = fDevMode ? path.resolve(__dirname, "..") : path.dirname(process.execPath);

export const pData = path.resolve(pRoot, ServiceCode.Data);
export const pBackupData = path.resolve(pRoot, ServiceCode.BackupData);
export const pCache = path.resolve(pRoot, ServiceCode.Cache);
export const pI18n = path.resolve(pRoot, ServiceCode.I18n);

log.info(`DEV_MODE: ${fDevMode}`);
log.info(`APP_ROOT: ${pRoot}`);

export const pathJoin = (...args: string[]) => path.join(...args);

export const readFileSync = (filePath: string) => fs.readFileSync(filePath, "utf8");
export const readFileSyncBinary = (filePath: string) => fs.readFileSync(filePath);

export const readAsarFile = (filePath: string): Buffer => {
    const flog = log.child("readAsarFile");
    try {
        flog.info(`Reading: ${filePath}`);
        const buffer = originalFs.readFileSync(filePath);
        flog.info(`Success, read ${buffer.length} bytes`);
        return buffer;
    } catch (error) {
        flog.error(`Failed to read ${filePath}:`, error);
        throw error;
    }
};

export const writeAsarFile = (filePath: string, data: Buffer): void => {
    const flog = log.child("writeAsarFile");
    try {
        flog.info(`Writing to: ${filePath} (${data.length} bytes)`);
        const dir = path.dirname(filePath);
        if (!originalFs.existsSync(dir)) {
            originalFs.mkdirSync(dir, { recursive: true });
        }
        originalFs.writeFileSync(filePath, data);
        flog.info("Success");
    } catch (error) {
        flog.error(`Failed to write ${filePath}:`, error);
        throw error;
    }
};

export const outputFileSync = (filePath: string, data: string | NodeJS.ArrayBufferView) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data);
};

export const outputBatchFileSync = (filePath: string, content: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const contentBuffer = Buffer.from(content, "utf8");
    const fileBuffer = Buffer.concat([bom, contentBuffer]);
    fs.writeFileSync(filePath, fileBuffer);
};

export const getAllFiles = (dir: string) => fs.readdirSync(dir);
export const pathExistsSync = (path: string) => fs.existsSync(path);

export const ensureDir = (path: string) => fs.promises.mkdir(path, { recursive: true });

export const emptyDir = async (dirPath: string) => {
    const flog = log.child("emptyDir");
    try {
        if (fs.existsSync(dirPath)) {
            flog.info(`Clearing directory: ${dirPath}`);
            // Delete files individually to avoid EBUSY on locked .asar files
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                try {
                    if (entry.isDirectory()) {
                        await fs.promises.rm(fullPath, { recursive: true, force: true, maxRetries: 2 });
                    } else {
                        await fs.promises.unlink(fullPath);
                    }
                } catch (e) {
                    // Skip locked files (usually .asar held by Electron)
                    flog.warn(`Skipped deleting ${entry.name}: ${e}`);
                }
            }
            flog.info("Directory cleared (some locked files may remain)");
        } else {
            await fs.promises.mkdir(dirPath, { recursive: true });
            flog.info(`Directory created: ${dirPath}`);
        }
    } catch (error) {
        flog.error(`Failed to empty directory ${dirPath}:`, error);
        throw error;
    }
};

export const copyFile = (src: string, dest: string, options?: fs.CopyOptions) => fs.promises.cp(src, dest, options);
export const removeFile = (path: string) => fs.promises.rm(path, { force: true });

export const backupFileBySha256 = (in_path: string, out_path: string) => {
    const data = readFileSyncBinary(in_path);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 8);
    const out_info = path.parse(out_path);
    const out_ext = out_info.ext;
    const p_out = path.join(out_info.dir, `${out_info.name}.${hash}${out_ext}`);
    outputFileSync(p_out, data);
    return p_out;
};

export const saveFile = (data: Buffer, out_path: string) => {
    outputFileSync(out_path, data);
    return out_path;
};

export const saveJson = async (name: string, data: object) => {
    try {
        const json = JSON.stringify(data, null, 4);
        await fs.promises.mkdir(path.dirname(name), { recursive: true });
        await fs.promises.writeFile(name, json, "utf8");
    } catch (e) {
        log.child("saveJson").error(`Failed to save ${name}:`, e);
        throw e;
    }
};

export const readJson = async (name: string) => {
    try {
        const content = await fs.promises.readFile(name, "utf8");
        return JSON.parse(content);
    } catch (e) {
        log.child("readJson").error(`Failed to read ${name}:`, e);
        return null;
    }
};

export const saveJsonV2 = async (svc: ServiceCode, sid: SpaceId | null, name: string, data: any) => {
    try {
        const d = dumps(data);
        const p = path.join(pRoot, svc, sid || "", name);
        await fs.promises.mkdir(path.dirname(p), { recursive: true });
        await fs.promises.writeFile(p, d, "utf8");
        log.child("saveJsonV2").info(`Saved: ${p}`);
    } catch (e) {
        log.child("saveJsonV2").error(`Failed to save ${name}:`, e);
        throw e;
    }
};

export const readJsonV2 = async <T = unknown>(svc: ServiceCode, sid: SpaceId | null, name: string) => {
    try {
        const p = path.join(pRoot, svc, sid || "", name);
        if (fs.existsSync(p)) {
            const d = await fs.promises.readFile(p, "utf8");
            return loads(d) as T;
        }
        return null;
    } catch (e) {
        log.child("readJsonV2").error(`Failed to read ${name}:`, e);
        return null;
    }
};
