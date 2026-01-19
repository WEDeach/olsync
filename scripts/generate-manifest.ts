import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface FileInfo {
    hash: string;
    size: number;
}

interface Manifest {
    version: string;
    electronVersion: string;
    files: {
        [relativePath: string]: FileInfo;
    };
}

function calculateFileHash(filePath: string): string {
    const buffer=fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getAllFiles(dirPath: string,arrayOfFiles: string[]=[],baseDir: string=""): string[] {
    const files=fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath=path.join(dirPath,file);
        const stat=fs.statSync(fullPath);

        if(stat.isDirectory()) {
            arrayOfFiles=getAllFiles(fullPath,arrayOfFiles,baseDir||dirPath);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

function shouldExcludeFile(relativePath: string): boolean {
    const excludePatterns=[
        /^manifest\.json$/,
        /^\.git/,
        /^node_modules/,
        /\.map$/,
        /^LICENSES\.chromium\.html$/,
        /^LICENSE\.electron\.txt$/,
    ];

    return excludePatterns.some(pattern => pattern.test(relativePath));
}

async function generateManifest(buildDir: string,version: string,outputPath: string) {
    if(!fs.existsSync(buildDir)) {
        console.error(`Build directory not found: ${buildDir}`);
        process.exit(1);
    }

    const packageJsonPath=path.join(__dirname,'..','package.json');
    const packageJson=JSON.parse(fs.readFileSync(packageJsonPath,'utf-8'));
    const electronVersion=packageJson.devDependencies?.electron?.replace(/[\^~]/,'') || 'unknown';

    const allFiles=getAllFiles(buildDir);
    const manifest: Manifest={
        version,
        electronVersion,
        files: {}
    };

    let processedCount=0;
    let skippedCount=0;

    for(const filePath of allFiles) {
        const relativePath=path.relative(buildDir,filePath).replace(/\\/g,'/');

        if(shouldExcludeFile(relativePath)) {
            skippedCount++;
            continue;
        }

        const hash=calculateFileHash(filePath);
        const stats=fs.statSync(filePath);

        manifest.files[relativePath]={
            hash,
            size: stats.size
        };

        processedCount++;
    }

    const manifestPath=path.join(outputPath,"manifest.json");
    const json=JSON.stringify(manifest,null,4);
    fs.mkdirSync(path.dirname(manifestPath),{ recursive: true });
    fs.writeFileSync(manifestPath,json);
}

const args=process.argv.slice(2);
if(args.length<2) {
    console.error("Usage: node generate-manifest.js <build-dir> <version> [output-dir]");
    console.error("Example: node generate-manifest.js ./release/win-unpacked 1.0.4 ./release/win-unpacked");
    process.exit(1);
}

const buildDir=path.resolve(args[0]);
const version=args[1];
const outputPath=args[2]? path.resolve(args[2]):buildDir;

generateManifest(buildDir,version,outputPath).catch((error) => {
    console.error("Failed to generate manifest:",error);
    process.exit(1);
});
