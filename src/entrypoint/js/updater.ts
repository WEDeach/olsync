import * as crypto from "crypto";
import * as path from "path";
import { app } from "electron";
import { copyFile,emptyDir,ensureDir,outputBatchFileSync,outputFileSync,pathExistsSync,pathJoin,pRoot,readAsarFile,readFileSyncBinary,readJson,saveJson,writeAsarFile } from "../../utils/file";
import { compareVersion,fDevMode } from "../../utils/common";

export interface FileManifest {
    version: string;
    electronVersion?: string;
    files: {
        [relativePath: string]: {
            hash: string;
            size: number;
        };
    };
}

export interface UpdateDiff {
    needsUpdate: boolean;
    requiresExeUpdate?: boolean;
    version: {
        current: string;
        latest: string;
    };
    electronVersion?: {
        current: string;
        latest: string;
    };
    files: {
        added: string[];
        modified: string[];
        removed: string[];
    };
    totalSize: number;
}

export class Updater {
    private updateCheckUrl: string;
    private updateBaseUrl: string;
    private currentManifest: FileManifest|null=null;
    private appPath: string;
    private isDev: boolean;

    constructor(updateBaseUrl: string) {
        this.updateBaseUrl=updateBaseUrl;
        this.updateCheckUrl=`${updateBaseUrl}/manifest.json`;
        this.appPath=pRoot;
        this.isDev=fDevMode;
    }

    private calculateFileHash(filePath: string): string {
        const buffer=readFileSyncBinary(filePath);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    private async loadCurrentManifest(): Promise<FileManifest|null> {
        try {
            if(this.isDev) {
                const manifestPath=pathJoin(this.appPath,"manifest.json");
                if(pathExistsSync(manifestPath)) {
                    const manifest=await readJson(manifestPath);
                    return manifest;
                }

                const packageJsonPath=pathJoin(this.appPath,"package.json");
                if(pathExistsSync(packageJsonPath)) {
                    const packageJson=await readJson(packageJsonPath);
                    return {
                        version: packageJson.version||"0.0.0",
                        files: {}
                    };
                }
                console.warn(`[Updater] package.json not found at: ${packageJsonPath}`);
                return null;
            }

            const manifestPath=pathJoin(this.appPath,"manifest.json");

            if(pathExistsSync(manifestPath)) {
                const manifest=await readJson(manifestPath);
                return manifest;
            }

            console.warn(`[Updater] manifest.json not found at: ${manifestPath}`);
            return null;
        } catch(error) {
            console.error("[Updater] Failed to load current manifest:",error);
            return null;
        }
    }

    private async fetchLatestManifest(): Promise<FileManifest|null> {
        if(this.updateCheckUrl.startsWith("file://")) {
            const localPath=this.updateCheckUrl.replace("file://","");
            return await readJson(localPath);
        }

        const response=await fetch(this.updateCheckUrl);
        if(!response.ok) {
            throw new Error(`Failed to fetch manifest: ${response.statusText}`);
        }
        return await response.json();
    }

    public async checkForUpdates(): Promise<UpdateDiff|null> {
        this.currentManifest=await this.loadCurrentManifest();
        const latestManifest=await this.fetchLatestManifest();

        if(!latestManifest) {
            return null;
        }

        const currentVersion=this.currentManifest?.version||"0.0.0";
        const latestVersion=latestManifest.version;

        const currentElectronVersion=this.currentManifest?.electronVersion||"";
        const latestElectronVersion=latestManifest.electronVersion||"";
        const requiresExeUpdate=currentElectronVersion!==latestElectronVersion&&!!latestElectronVersion;

        if(compareVersion(currentVersion,latestVersion)>=0) {
            return {
                needsUpdate: false,
                requiresExeUpdate: false,
                version: {
                    current: currentVersion,
                    latest: latestVersion
                },
                electronVersion: {
                    current: currentElectronVersion,
                    latest: latestElectronVersion
                },
                files: {
                    added: [],
                    modified: [],
                    removed: []
                },
                totalSize: 0
            };
        }

        const currentFiles=this.currentManifest?.files||{};
        const latestFiles=latestManifest.files;

        const added: string[]=[];
        const modified: string[]=[];
        const removed: string[]=[];
        let totalSize=0;

        for(const [filePath,fileInfo] of Object.entries(latestFiles)) {
            if(filePath.endsWith('.exe')) {
                if(!requiresExeUpdate) {
                    continue;
                }
            }
            if(!currentFiles[filePath]) {
                added.push(filePath);
                totalSize+=fileInfo.size;
            } else if(currentFiles[filePath].hash!==fileInfo.hash) {
                modified.push(filePath);
                totalSize+=fileInfo.size;
            }
        }

        for(const filePath of Object.keys(currentFiles)) {
            if(!latestFiles[filePath]) {
                removed.push(filePath);
            }
        }

        return {
            needsUpdate: added.length>0||modified.length>0||removed.length>0,
            requiresExeUpdate,
            version: {
                current: currentVersion,
                latest: latestVersion
            },
            electronVersion: {
                current: currentElectronVersion,
                latest: latestElectronVersion
            },
            files: {
                added,
                modified,
                removed
            },
            totalSize
        };
    }

    public async downloadFile(
        relativePath: string,
        onProgress?: (downloaded: number,total: number) => void
    ): Promise<boolean> {
        try {
            const fileUrl=`${this.updateBaseUrl}/${relativePath}`;
            const targetPath=pathJoin(this.appPath,relativePath);
            await ensureDir(path.dirname(targetPath));
            if(this.updateBaseUrl.startsWith("file://")) {
                let localPath=fileUrl.replace("file://","");
                localPath=localPath.replace(/\//g,"\\");
                if(!pathExistsSync(localPath)) {
                    console.error(`[Updater] Source file not found: ${localPath}`);
                    return false;
                }
                await copyFile(localPath,targetPath,{ force: true });
                return true;
            }
            const response=await fetch(fileUrl);
            if(!response.ok) {
                console.error(`[Updater] HTTP error: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to download file: ${response.statusText}`);
            }

            const totalSize=parseInt(response.headers.get('content-length')||'0');
            const reader=response.body?.getReader();

            if(!reader) {
                throw new Error("Failed to get response reader");
            }

            const chunks: Uint8Array[]=[];
            let downloadedSize=0;

            while(true) {
                const { done,value }=await reader.read();

                if(done) break;

                chunks.push(value);
                downloadedSize+=value.length;

                if(onProgress) {
                    onProgress(downloadedSize,totalSize);
                }
            }

            const buffer=Buffer.concat(chunks);
            outputFileSync(targetPath,buffer);

            return true;
        } catch(error) {
            console.error(`Failed to download file ${relativePath}:`,error);
            return false;
        }
    }

    public async verifyUpdate(): Promise<boolean> {
        try {
            const manifest=await this.loadCurrentManifest();
            if(!manifest) {
                return false;
            }

            for(const [relativePath,fileInfo] of Object.entries(manifest.files)) {
                const filePath=pathJoin(this.appPath,relativePath);

                if(!pathExistsSync(filePath)) {
                    console.error(`Missing file: ${relativePath}`);
                    return false;
                }

                const actualHash=this.calculateFileHash(filePath);
                if(actualHash!==fileInfo.hash) {
                    console.error(`Hash mismatch for ${relativePath}`);
                    return false;
                }
            }

            return true;
        } catch(error) {
            console.error("Failed to verify update:",error);
            return false;
        }
    }

    public async getCurrentVersion(): Promise<string> {
        try {
            const manifest=await this.loadCurrentManifest();
            return manifest?.version||"0.0.0";
        } catch(error) {
            console.error("Failed to get current version:",error);
            return "0.0.0";
        }
    }

    public async downloadAndPrepareUpdate(
        diff: UpdateDiff,
        onProgress?: (current: number,total: number,currentFile: string) => void
    ): Promise<string|null> {
        try {
            const tempDir=pathJoin(app.getPath('temp'),'olsync-update');
            await ensureDir(tempDir);
            await emptyDir(tempDir);

            const filesToDownload=[...diff.files.added,...diff.files.modified];
            const totalFiles=filesToDownload.length;
            let completedFiles=0;

            for(const filePath of filesToDownload) {
                const targetPath=pathJoin(tempDir,filePath);
                await ensureDir(path.dirname(targetPath));
                if(filePath.endsWith('.exe')) {
                    if(!diff.requiresExeUpdate) {
                        continue;
                    }
                }
                if(this.updateBaseUrl.startsWith("file://")) {
                    let basePath=this.updateBaseUrl.replace("file://","").replace(/\//g,"\\").replace(/\\+$/,'');
                    let localPath: string;

                    if(filePath.endsWith('.asar')) {
                        if(basePath.endsWith('.asar')) {
                            localPath=basePath;
                        } else if(pathExistsSync(pathJoin(basePath,'resources',filePath))) {
                            localPath=pathJoin(basePath,'resources',filePath);
                        } else if(pathExistsSync(pathJoin(basePath,filePath))) {
                            localPath=pathJoin(basePath,filePath);
                        } else {
                            const error=`無法找到 ${filePath}。搜尋路徑:\n- ${pathJoin(basePath,'resources',filePath)}\n- ${pathJoin(basePath,filePath)}`;
                            console.error(`[Updater] ${error}`);
                            throw new Error(error);
                        }
                    } else {
                        localPath=pathJoin(basePath,filePath);
                    }
                    if(!pathExistsSync(localPath)) {
                        const error=`來源檔案不存在: ${localPath}`;
                        console.error(`[Updater] ${error}`);
                        throw new Error(error);
                    }

                    if(filePath.endsWith('.asar')) {
                        try {
                            const buffer=readAsarFile(localPath);
                            writeAsarFile(targetPath,buffer);
                        } catch(err) {
                            console.error(`[Updater] Failed to copy .asar file:`,err);
                            throw err;
                        }
                    } else {
                        await copyFile(localPath,targetPath,{ force: true });
                    }
                } else {
                    const fileUrl=`${this.updateBaseUrl}/${filePath}`;
                    const response=await fetch(fileUrl);

                    if(!response.ok) {
                        const error=`下載檔案失敗 ${filePath} (HTTP ${response.status})`;
                        console.error(`[Updater] ${error}`);
                        throw new Error(error);
                    }

                    const buffer=Buffer.from(await response.arrayBuffer());

                    if(filePath.endsWith('.asar')) {
                        writeAsarFile(targetPath,buffer);
                    } else {
                        outputFileSync(targetPath,buffer);
                    }
                }

                completedFiles++;

                if(onProgress) {
                    onProgress(completedFiles,totalFiles,filePath);
                }
            }
            const latestManifest=await this.fetchLatestManifest();
            if(latestManifest) {
                const manifestPath=pathJoin(tempDir,'manifest.json');
                await saveJson(manifestPath,latestManifest);
            }

            await this.createUpdateScript(tempDir,diff);

            return tempDir;
        } catch(error) {
            console.error("[Updater] Failed to download and prepare update:",error);
            throw error;
        }
    }

    private async createUpdateScript(tempDir: string,diff: UpdateDiff): Promise<void> {
        const scriptPath=pathJoin(tempDir,'update.bat');

        const exePath=process.execPath;
        const exeDir=path.dirname(exePath);

        const appPath=app.getAppPath();
        const lines=[
            '@echo off',
            'chcp 65001 > nul',
            'echo [olSync Updater] 正在等待應用程式關閉...',
            'timeout /t 3 /nobreak > nul',
            '',
            'echo [olSync Updater] 開始套用更新...',
            '',
            `cd /d "${exeDir}"`,
            ''
        ];

        const filesToUpdate=[...diff.files.added,...diff.files.modified];

        for(const file of filesToUpdate) {
            const sourcePath=pathJoin(tempDir,file);

            if(file.endsWith('.asar')) {
                const asarPath=appPath.endsWith('.asar')? appPath:pathJoin(exeDir,'resources',file);

                lines.push(`echo [olSync Updater] 偵測到 ASAR 檔案: ${file}`);
                lines.push(`echo [olSync Updater] 準備替換: ${asarPath}`);
                lines.push('');

                lines.push('echo [olSync Updater] 備份原有檔案...');
                lines.push(`copy /Y "${asarPath}" "${asarPath}.backup" > nul`);
                lines.push('if errorlevel 1 (');
                lines.push('    echo [olSync Updater] 錯誤: 無法備份原有檔案');
                lines.push('    pause');
                lines.push('    exit /b 1');
                lines.push(')');
                lines.push('');

                lines.push('echo [olSync Updater] 正在替換 ASAR 檔案...');
                lines.push(`copy /Y "${sourcePath}" "${asarPath}" > nul`);
                lines.push('if errorlevel 1 (');
                lines.push('    echo [olSync Updater] 錯誤: 無法替換檔案,正在還原備份...');
                lines.push(`    copy /Y "${asarPath}.backup" "${asarPath}" > nul`);
                lines.push('    pause');
                lines.push('    exit /b 1');
                lines.push(')');
                lines.push('');

                lines.push('echo [olSync Updater] 清理備份檔案...');
                lines.push(`del /F /Q "${asarPath}.backup" 2>nul`);
                lines.push('');
            } else {
                const targetPath=pathJoin(exeDir,file);
                const targetDir=path.dirname(targetPath);

                lines.push(`echo [olSync Updater] 更新檔案: ${file}`);
                lines.push(`if not exist "${targetDir}" mkdir "${targetDir}"`);
                lines.push(`copy /Y "${sourcePath}" "${targetPath}" > nul`);
                lines.push(`if errorlevel 1 echo [olSync Updater] 警告: 無法更新 ${file}`);
                lines.push('');
            }
        }

        // JUST KEEP IT
        /*
        for(const file of diff.files.removed) {
            const targetPath=pathJoin(exeDir,file);
            
            lines.push(`echo [olSync Updater] 移除: ${file}`);
            lines.push(`if exist "${targetPath}" del /F /Q "${targetPath}"`);
            lines.push('');
        }
        */

        const externalFiles=['manifest.json'];

        for(const file of externalFiles) {
            const sourcePath=pathJoin(tempDir,file);
            const targetPath=pathJoin(exeDir,file);
            if(pathExistsSync(sourcePath)) {
                lines.push(`echo [olSync Updater] 更新外部檔案: ${file}`);
                lines.push(`copy /Y "${sourcePath}" "${targetPath}" > nul`);
                lines.push('');
            }
        }

        const latestManifest=await this.fetchLatestManifest();
        if(latestManifest) {
            const manifestPath=pathJoin(tempDir,'manifest.json');
            await saveJson(manifestPath,latestManifest);
        }
        lines.push('echo [olSync Updater] 更新完成!');
        lines.push('timeout /t 2 /nobreak > nul');
        lines.push('');
        lines.push('echo [olSync Updater] 正在重新啟動應用程式...');
        lines.push(`start "" "${exePath}"`);
        lines.push('');
        lines.push('echo [olSync Updater] 清理暫存檔案...');
        lines.push(`timeout /t 1 /nobreak > nul`);
        lines.push(`rd /s /q "${tempDir}" 2>nul`);
        lines.push('exit');
        outputBatchFileSync(scriptPath,lines.join('\r\n'));
    }

    public async executeUpdate(tempDir: string): Promise<void> {
        const scriptPath=pathJoin(tempDir,'update.bat');
        const vbsPath=pathJoin(tempDir,'run-update.vbs');
        if(!pathExistsSync(scriptPath)) {
            throw new Error(`更新腳本不存在: ${scriptPath}`);
        }
        try {
            const vbsScript=[
                'Set WshShell = CreateObject("WScript.Shell")',
                `WshShell.Run "cmd /c """"${scriptPath}""""", 0, False`,
                'Set WshShell = Nothing'
            ].join('\r\n');
            outputFileSync(vbsPath,vbsScript);
            const { exec }=require('child_process');
            const command=`wscript.exe "${vbsPath}"`;

            exec(command,(error: any) => {
                if(error) {
                    console.error(`[Updater] Failed to execute update script:`,error);
                }
            });
        } catch(error) {
            console.error(`[Updater] Failed to spawn update script:`,error);
            throw error;
        }

        setTimeout(() => {
            console.log(`[Updater] Quitting application...`);
            app.quit();
        },1000);
    }
}
