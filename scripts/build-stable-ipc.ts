import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csc = path.join(
    process.env.windir ?? "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
);

const srcDir = path.resolve(__dirname, "..", "third_party", "stable-ipc");
const outDir = path.resolve(__dirname, "..", "bin", "win");

if (!fs.existsSync(csc)) {
    throw new Error(`csc.exe not found: ${csc}`);
}

fs.mkdirSync(outDir, { recursive: true });

const ipcDll = path.join(outDir, "StableIpcBridge.dll");
const tcpBridge = path.join(outDir, "SIGW.exe");

execSync(
    `"${csc}" /nologo /target:library /out:"${ipcDll}" "${path.join(srcDir, "StableIpcBridge.cs")}"`,
    { stdio: "inherit" },
);

execSync(
    `"${csc}" /nologo /target:exe /out:"${tcpBridge}" /r:"${ipcDll}" "${path.join(srcDir, "SIGW.cs")}"`,
    { stdio: "inherit" },
);
