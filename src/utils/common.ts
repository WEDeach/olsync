import { app } from "electron";

export const fDevMode=!app.isPackaged

export function compareVersion(v1: string,v2: string) {
    const parts1=v1.split('.').map(Number);
    const parts2=v2.split('.').map(Number);
    const maxLen=Math.max(parts1.length,parts2.length);

    for(let i=0; i<maxLen; i++) {
        const num1=parts1[i]||0;
        const num2=parts2[i]||0;
        if(num1>num2) return 1;
        if(num1<num2) return -1;
    }
    return 0;
}