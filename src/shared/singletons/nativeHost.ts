import { ChildProcess, spawn } from "child_process";
import { HostType } from "../../defines/types";
import { pathExistsSync } from "../../utils/file";
import { createLogger } from "../../utils/logger";
import SingletonBase from "./base";

const log = createLogger("NativeHost");

const NATIVE_HOST_MESSAGE_TIMEOUT_MS = 30_000;
const NATIVE_HOST_MAX_QUEUE = 100;

export default class NativeHost extends SingletonBase {
    private processGroup: { [key in HostType]?: ChildProcess } = {};
    private messageQueues: {
        [key in HostType]?: Array<{
            resolve: (value: any) => void;
            reject: (error: any) => void;
            timer: NodeJS.Timeout;
        }>;
    } = {};
    private buffers: { [key in HostType]?: Buffer } = {};

    private reject_pending(hostType: HostType, error: Error): void {
        const queue = this.messageQueues[hostType];
        if (!queue) return;
        for (const handler of queue) {
            clearTimeout(handler.timer);
            handler.reject(error);
        }
        queue.length = 0;
    }

    async start(hostType: HostType, hostPath: string): Promise<boolean> {
        if (this.processGroup[hostType]) {
            log.info(`Native Host '${hostType}' is already running`);
            return true;
        }

        if (!pathExistsSync(hostPath)) {
            throw new Error(`Native Host not found at: ${hostPath}`);
        }

        try {
            this.processGroup[hostType] = spawn(hostPath, [], {
                stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
            });
            this.messageQueues[hostType] = [];
            this.buffers[hostType] = Buffer.alloc(0);

            this.processGroup[hostType].stdout?.on("data", (data: Buffer) => {
                this.handle_response(hostType, data);
            });

            this.processGroup[hostType].stderr?.on("data", (data: Buffer) => {
                log.error(`Native Host '${hostType}' stderr:`, data.toString());
            });

            this.processGroup[hostType].on("close", (code) => {
                log.info(`Native Host '${hostType}' exited with code ${code}`);
                this.reject_pending(hostType, new Error(`Native Host '${hostType}' exited with code ${code}`));
                delete this.processGroup[hostType];
                delete this.messageQueues[hostType];
                delete this.buffers[hostType];
            });

            this.processGroup[hostType].on("error", (error) => {
                log.error(`Native Host '${hostType}' error:`, error);
                this.reject_pending(hostType, error);
                delete this.processGroup[hostType];
                delete this.messageQueues[hostType];
                delete this.buffers[hostType];
            });

            log.info(`Native Host '${hostType}' started`);
            return true;
        } catch (error) {
            log.error(`Failed to start Native Host '${hostType}':`, error);
            return false;
        }
    }

    async send_message(hostType: HostType, message: any): Promise<any> {
        const process = this.processGroup[hostType];

        if (!process?.stdin) {
            throw new Error(`Native Host '${hostType}' not running`);
        }

        return new Promise((resolve, reject) => {
            try {
                const encodedMessage = JSON.stringify(message);
                const messageBuffer = Buffer.from(encodedMessage, "utf-8");
                const length = messageBuffer.length;
                const queue = this.messageQueues[hostType];
                if (!queue) {
                    reject(new Error(`Message queue for '${hostType}' not initialized`));
                    return;
                }
                if (queue.length >= NATIVE_HOST_MAX_QUEUE) {
                    reject(new Error(`Native Host '${hostType}' message queue is full`));
                    return;
                }
                const stdin = process.stdin;
                if (!stdin) {
                    reject(new Error(`Native Host '${hostType}' stdin is unavailable`));
                    return;
                }

                const timer = setTimeout(() => {
                    this.reject_pending(hostType, new Error(`Native Host '${hostType}' response timeout`));
                    this.processGroup[hostType]?.kill();
                }, NATIVE_HOST_MESSAGE_TIMEOUT_MS);
                queue.push({ resolve, reject, timer });

                const lengthBuffer = Buffer.allocUnsafe(4);
                lengthBuffer.writeUInt32LE(length, 0);
                stdin.write(lengthBuffer);
                stdin.write(messageBuffer);
                log.info("Sent message to FDM:", message);
            } catch (error) {
                reject(error);
            }
        });
    }

    private handle_response(hostType: HostType, data: Buffer): void {
        const buffer = this.buffers[hostType];
        const queue = this.messageQueues[hostType];
        if (!buffer || !queue) {
            log.error(`Buffer or queue not found for '${hostType}'`);
            return;
        }
        this.buffers[hostType] = Buffer.concat([buffer, data]);
        while (this.buffers[hostType]?.length >= 4) {
            const length = this.buffers[hostType]?.readUInt32LE(0);

            if (this.buffers[hostType]?.length < 4 + length) {
                break;
            }

            const messageBuffer = this.buffers[hostType]?.slice(4, 4 + length);
            this.buffers[hostType] = this.buffers[hostType]?.slice(4 + length);

            try {
                const messageStr = messageBuffer.toString("utf-8");
                const response = JSON.parse(messageStr);

                log.info(`Received response from '${hostType}':`, response);

                const handler = queue.shift();
                if (handler) {
                    clearTimeout(handler.timer);
                    if (response.success !== false) {
                        handler.resolve(response);
                    } else {
                        handler.reject(new Error(response.error || "Unknown error"));
                    }
                } else {
                    log.warn(`No handler found for response from '${hostType}'`);
                }
            } catch (error) {
                log.error(`Failed to parse response from '${hostType}':`, error);
                const handler = queue.shift();
                if (handler) {
                    clearTimeout(handler.timer);
                    handler.reject(error);
                }
            }
        }
    }

    stop(): void {
        if (this.processGroup) {
            log.info("Stopping Native Host...");
            for (const hostType of Object.keys(this.messageQueues).map(Number) as HostType[]) {
                this.reject_pending(hostType, new Error(`Native Host '${hostType}' stopped`));
            }
            Object.values(this.processGroup).forEach((proc) => {
                if (proc) {
                    try {
                        proc.kill();
                    } catch (e) {
                        log.error("Failed to kill process:", e);
                    }
                }
            });
            this.processGroup = {};
            log.info("Native Host stopped");
        }
    }
}
