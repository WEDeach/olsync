
import { spawn,ChildProcess } from "child_process";
import SingletonBase from "./base";
import { HostType } from "../../defines/types";
import { pathExistsSync } from "../../utils/file";

export default class NativeHost extends SingletonBase {
    private processGroup: { [key in HostType]?: ChildProcess }={};
    private messageQueues: { [key in HostType]?: Array<{
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> }={};
    private buffers: { [key in HostType]?: Buffer }={};

    async start(hostType: HostType,hostPath: string): Promise<boolean> {
        if(this.processGroup[hostType]) {
            console.log(`Native Host '${hostType}' is already running`);
            return true;
        }

        if(!pathExistsSync(hostPath)) {
            throw new Error(`Native Host not found at: ${hostPath}`);
        }

        try {
            this.processGroup[hostType]=spawn(hostPath,[],{
                stdio: ['pipe','pipe','pipe'], // stdin, stdout, stderr
            });
            this.messageQueues[hostType]=[];
            this.buffers[hostType]=Buffer.alloc(0);

            this.processGroup[hostType].stdout?.on('data',(data: Buffer) => {
                this.handleResponse(hostType,data);
            });

            this.processGroup[hostType].stderr?.on('data',(data: Buffer) => {
                console.error(`Native Host '${hostType}' stderr:`,data.toString());
            });

            this.processGroup[hostType].on('close',(code) => {
                console.log(`Native Host '${hostType}' exited with code ${code}`);
                delete this.processGroup[hostType];
                delete this.messageQueues[hostType];
                delete this.buffers[hostType];
            });

            this.processGroup[hostType].on('error',(error) => {
                console.error(`Native Host '${hostType}' error:`,error);

                const queue=this.messageQueues[hostType];
                if(queue) {
                    queue.forEach(handler => handler.reject(error));
                    queue.length=0;
                }

                delete this.processGroup[hostType];
                delete this.messageQueues[hostType];
                delete this.buffers[hostType];
            });

            console.log(`Native Host '${hostType}' started`);
            return true;
        } catch(error) {
            console.error(`Failed to start Native Host '${hostType}':`,error);
            return false;
        }
    }

    async sendMessage(hostType: HostType,message: any): Promise<any> {
        const process=this.processGroup[hostType];

        if(!process||!process.stdin) {
            throw new Error(`Native Host '${hostType}' not running`);
        }

        return new Promise((resolve,reject) => {
            try {
                const encodedMessage=JSON.stringify(message);
                const messageBuffer=Buffer.from(encodedMessage,'utf-8');
                const length=messageBuffer.length;

                const lengthBuffer=Buffer.allocUnsafe(4);
                lengthBuffer.writeUInt32LE(length,0);

                process.stdin!.write(lengthBuffer);
                process.stdin!.write(messageBuffer);

                const queue=this.messageQueues[hostType];
                if(queue) {
                    queue.push({ resolve,reject });
                } else {
                    reject(new Error(`Message queue for '${hostType}' not initialized`));
                }

                console.log('Sent message to FDM:',message);
            } catch(error) {
                reject(error);
            }
        });
    }

    private handleResponse(hostType: HostType,data: Buffer): void {
        const buffer=this.buffers[hostType];
        const queue=this.messageQueues[hostType];
        if(!buffer||!queue) {
            console.error(`Buffer or queue not found for '${hostType}'`);
            return;
        }
        this.buffers[hostType]=Buffer.concat([buffer,data]);
        while(this.buffers[hostType]!.length>=4) {
            const length=this.buffers[hostType]!.readUInt32LE(0);

            if(this.buffers[hostType]!.length<4+length) {
                break;
            }

            const messageBuffer=this.buffers[hostType]!.slice(4,4+length);
            this.buffers[hostType]=this.buffers[hostType]!.slice(4+length);

            try {
                const messageStr=messageBuffer.toString('utf-8');
                const response=JSON.parse(messageStr);

                console.log(`Received response from '${hostType}':`,response);

                const handler=queue.shift();
                if(handler) {
                    if(response.success!==false) {
                        handler.resolve(response);
                    } else {
                        handler.reject(new Error(response.error||'Unknown error'));
                    }
                } else {
                    console.warn(`No handler found for response from '${hostType}'`);
                }
            } catch(error) {
                console.error(`Failed to parse response from '${hostType}':`,error);
                const handler=queue.shift();
                if(handler) {
                    handler.reject(error);
                }
            }
        }
    }

    stop(): void {
        if(this.processGroup) {
            console.log('Stopping Native Host...');
            Object.values(this.processGroup).forEach((proc) => {
                if(proc) {
                    try {
                        proc.kill();
                    } catch(e) {
                        console.error('Failed to kill process:',e);
                    }
                }
            });
            this.processGroup={};
            console.log('Native Host stopped');
        }
    }
}
