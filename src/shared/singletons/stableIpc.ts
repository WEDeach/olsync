import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as readline from "readline";
import { StableIpcClientData } from "../../defines/stable_structs";
import { pRoot } from "../../utils/file";
import { createLogger } from "../../utils/logger";
import SingletonBase from "./base";

const log = createLogger("StableIpc");

type QueueItem = { cmd: string; resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * Spawns and talks to SIGW.exe, which translates our JSON-over-TCP commands
 * into osu!stable's .NET Remoting IPC (osu.Helpers.InterProcessOsu).
 */
class StableIpcClient extends SingletonBase {
    private _proc?: ChildProcess;
    private _socket?: net.Socket;
    private _rl?: readline.Interface;
    private _queue: QueueItem[] = [];
    private _busy = false;
    private _pending?: { resolve: (v: unknown) => void; reject: (e: Error) => void };
    private _cleaning = false;

    private _bridge_path() {
        return path.join(pRoot, "bin", "win", "SIGW.exe");
    }

    async get_client_data(): Promise<StableIpcClientData> {
        if (process.platform !== "win32") return { Connected: false };
        try {
            return (await this._send("GET")) as StableIpcClientData;
        } catch (e: any) {
            if (e?.message === "SIGW exited: 0") return { Connected: false };
            log.warn("stable get_client_data failed:", e);
            return { Connected: false };
        }
    }

    async handle_arguments(args: string): Promise<boolean> {
        if (process.platform !== "win32") return false;
        try {
            await this._send(`HANDLE ${args}`);
            return true;
        } catch (e: any) {
            log.warn("stable handle_arguments failed:", e);
            return false;
        }
    }

    close() {
        this._cleanup();
    }

    private async _send(cmd: string): Promise<unknown> {
        await this._ensure_started();
        return new Promise((resolve, reject) => {
            this._queue.push({ cmd, resolve, reject });
            this._flush();
        });
    }

    private _flush() {
        if (this._busy || this._queue.length === 0 || !this._socket) return;
        const item = this._queue.shift();
        if (!item) return;
        this._busy = true;
        this._pending = { resolve: item.resolve, reject: item.reject };
        this._socket.write(`${item.cmd}\n`, (err) => {
            if (err) {
                this._pending = undefined;
                this._busy = false;
                item.reject(err);
                this._flush();
            }
        });
    }

    private _on_line(line: string) {
        const p = this._pending;
        if (!p) return;
        this._pending = undefined;
        this._busy = false;
        try {
            const data = JSON.parse(line);
            if (data && typeof data === "object" && "error" in data) {
                p.reject(new Error(String(data.error)));
            } else {
                p.resolve(data);
            }
        } catch {
            p.reject(new Error(`Invalid JSON from SIGW: ${line}`));
        }
        this._flush();
    }

    private async _ensure_started(): Promise<void> {
        if (this._socket && !this._socket.destroyed) return;
        this._cleanup();
        const exe = this._bridge_path();
        if (!fs.existsSync(exe)) throw new Error(`SIGW not found: ${exe}`);

        const proc = spawn(exe, [], { stdio: ["ignore", "pipe", "pipe"] });
        this._proc = proc;
        proc.on("exit", () => this._cleanup());
        proc.stderr?.on("data", (chunk) => {
            const text = chunk.toString("utf8").trim();
            if (!text || text.includes("Cannot connect to osu! IPC")) return;
            log.error(text);
        });

        const port = await this._read_port(proc);
        const socket = await this._connect_port(port);
        this._socket = socket;
        this._rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
        this._rl.on("line", (line) => this._on_line(line));
        this._rl.on("close", () => this._cleanup());
    }

    private _read_port(proc: ChildProcess): Promise<number> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("SIGW port timeout")), 10000);
            const handler = (data: Buffer) => {
                const m = data.toString("utf8").match(/PORT (\d+)/);
                if (m) {
                    clearTimeout(timer);
                    proc.stdout?.off("data", handler);
                    resolve(Number(m[1]));
                }
            };
            proc.stdout?.on("data", handler);
            proc.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
            });
            proc.on("exit", (code) => {
                clearTimeout(timer);
                reject(new Error(`SIGW exited: ${code}`));
            });
        });
    }

    private _connect_port(port: number): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            const socket = net.connect({ port, host: "127.0.0.1" });
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error("SIGW socket timeout"));
            }, 5000);
            socket.on("connect", () => {
                clearTimeout(timer);
                resolve(socket);
            });
            socket.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    private _cleanup() {
        if (this._cleaning) return;
        this._cleaning = true;
        this._rl = undefined;
        this._socket?.destroy();
        this._socket = undefined;
        try {
            this._proc?.kill();
        } catch {}
        this._proc = undefined;
        if (this._pending) {
            this._pending.reject(new Error("Stable IPC closed"));
            this._pending = undefined;
            this._busy = false;
        }
        for (const item of this._queue) item.reject(new Error("Stable IPC closed"));
        this._queue = [];
        this._cleaning = false;
    }
}

export default StableIpcClient;
