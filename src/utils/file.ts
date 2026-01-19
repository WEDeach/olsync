import { createHash } from 'crypto';
import path from 'path';
import { dumps,loads } from '@zenoaihq/tson';
import { ServiceCode,SpaceId } from './typed/file';
import { fDevMode } from './common';
import fs from 'fs';

let originalFs: typeof fs;
try {
    originalFs=require('original-fs');
    console.log('[File] original-fs loaded successfully');
} catch(e) {
    console.log('[File] original-fs not available, using standard fs');
    originalFs=fs;
}

export const pRoot=fDevMode
    ? path.resolve(__dirname,'..')
    :path.dirname(process.execPath);

export const pData=path.resolve(pRoot,ServiceCode.Data)
export const pBackupData=path.resolve(pRoot,ServiceCode.BackupData)
export const pCache=path.resolve(pRoot,ServiceCode.Cache)
export const pI18n=path.resolve(pRoot,ServiceCode.I18n)

console.log(`[File] DEV_MODE: ${fDevMode}`);
console.log(`[File] APP_ROOT: ${pRoot}`);

export const pathJoin=(...args: string[]) => path.join(...args);

export const readFileSync=(filePath: string) => fs.readFileSync(filePath,'utf8');
export const readFileSyncBinary=(filePath: string) => fs.readFileSync(filePath);

export const readAsarFile=(filePath: string): Buffer => {
    try {
        console.log(`[readAsarFile] Reading: ${filePath}`);
        const buffer=originalFs.readFileSync(filePath);
        console.log(`[readAsarFile] Success, read ${buffer.length} bytes`);
        return buffer;
    } catch(error) {
        console.error(`[readAsarFile] Failed to read ${filePath}:`,error);
        throw error;
    }
};

export const writeAsarFile=(filePath: string,data: Buffer): void => {
    try {
        console.log(`[writeAsarFile] Writing to: ${filePath} (${data.length} bytes)`);
        const dir=path.dirname(filePath);
        if(!originalFs.existsSync(dir)) {
            originalFs.mkdirSync(dir,{ recursive: true });
        }
        originalFs.writeFileSync(filePath,data);
        console.log(`[writeAsarFile] Success`);
    } catch(error) {
        console.error(`[writeAsarFile] Failed to write ${filePath}:`,error);
        throw error;
    }
};

export const outputFileSync=(filePath: string,data: string|NodeJS.ArrayBufferView) => {
    fs.mkdirSync(path.dirname(filePath),{ recursive: true });
    fs.writeFileSync(filePath,data);
};

export const outputBatchFileSync=(filePath: string,content: string) => {
    fs.mkdirSync(path.dirname(filePath),{ recursive: true });
    const bom=Buffer.from([0xEF,0xBB,0xBF]);
    const contentBuffer=Buffer.from(content,'utf8');
    const fileBuffer=Buffer.concat([bom,contentBuffer]);
    fs.writeFileSync(filePath,fileBuffer);
};

export const getAllFiles=(dir: string) => fs.readdirSync(dir);
export const pathExistsSync=(path: string) => fs.existsSync(path);

export const ensureDir=(path: string) => fs.promises.mkdir(path,{ recursive: true });

export const emptyDir=async (dirPath: string) => {
    try {
        if(fs.existsSync(dirPath)) {
            console.log(`[emptyDir] Clearing directory: ${dirPath}`);
            await fs.promises.rm(dirPath,{ recursive: true,force: true,maxRetries: 3 });
            await fs.promises.mkdir(dirPath,{ recursive: true });
            console.log(`[emptyDir] Directory cleared and recreated`);
        } else {
            await fs.promises.mkdir(dirPath,{ recursive: true });
            console.log(`[emptyDir] Directory created: ${dirPath}`);
        }
    } catch(error) {
        console.error(`[emptyDir] Failed to empty directory ${dirPath}:`,error);
        throw error;
    }
};

export const copyFile=(src: string,dest: string,options?: fs.CopyOptions) => fs.promises.cp(src,dest,options);
export const removeFile=(path: string) => fs.promises.rm(path,{ force: true });

export const backupFileBySha256=(in_path: string,out_path: string) => {
    const data=readFileSyncBinary(in_path);
    const hash=createHash('sha256').update(data).digest('hex').slice(0,8);
    const out_info=path.parse(out_path);
    const out_ext=out_info.ext;
    const p_out=path.join(out_info.dir,`${out_info.name}.${hash}${out_ext}`);
    outputFileSync(p_out,data);
    return p_out;
};


export const saveFile=(data: Buffer,out_path: string) => {
    outputFileSync(out_path,data);
    return out_path;
};

export const saveJson=async (name: string,data: object) => {
    try {
        const json=JSON.stringify(data,null,4);
        await fs.promises.mkdir(path.dirname(name),{ recursive: true });
        await fs.promises.writeFile(name,json,'utf8');
    } catch(e) {
        console.error(`[saveJson] Failed to save ${name}:`,e);
        throw e;
    }
}

export const readJson=async (name: string) => {
    try {
        const content=await fs.promises.readFile(name,'utf8');
        return JSON.parse(content);
    } catch(e) {
        console.error(`[readJson] Failed to read ${name}:`,e);
        return null;
    }
}


export const saveJsonV2=async (svc: ServiceCode,sid: SpaceId,name: string,data: any) => {
    try {
        const d=dumps(data)
        const p=path.join(pRoot,svc,sid,name);
        await fs.promises.mkdir(path.dirname(p),{ recursive: true });
        await fs.promises.writeFile(p,d,'utf8');
        console.log(`[saveJsonV2] Saved: ${p}`);
    } catch(e) {
        console.error(`[saveJsonV2] Failed to save ${name}:`,e);
        throw e;
    }
}

export const readJsonV2=async <T=unknown>(svc: ServiceCode,sid: SpaceId,name: string) => {
    try {
        const p=path.join(pRoot,svc,sid,name);
        if(fs.existsSync(p)) {
            const d=await fs.promises.readFile(p,'utf8');
            return loads(d) as T;
        }
        return null;
    } catch(e) {
        console.error(`[readJsonV2] Failed to read ${name}:`,e);
        return null;
    }
}