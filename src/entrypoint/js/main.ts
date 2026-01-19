import { app,BrowserWindow,ipcMain,Menu } from "electron";
import * as url from "url";
import { register as ipcFsCmdRegister } from "./ipc/fs";
import { register as ipcRdCmdRegister } from "./ipc/rd";
import { register as ipcCnCmdRegister } from "./ipc/cn";
import { register as ipcAcCmdRegister } from "./ipc/ac";
import { register as ipcLaCmdRegister } from "./ipc/la";
import { register as ipcDlCmdRegister } from "./ipc/dl";
import { register as ipcUpCmdRegister } from "./ipc/up";
import { setI18n } from "../../utils/i18n";
import { getAllFiles,pathJoin,pI18n,readJson } from "../../utils/file";

let mainWindow: Electron.BrowserWindow|null;

function createWindow() {
    mainWindow=new BrowserWindow({
        width: 1100,
        height: 700,
        backgroundColor: "#f2f2f2",
        webPreferences: {
            preload: pathJoin(__dirname,"js/preload.b.js"),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: process.env.NODE_ENV!=="production",
        },
    });

    if(process.env.NODE_ENV==="development") {
        mainWindow.loadURL("http://localhost:3519");
    } else {
        mainWindow.loadURL(
            url.format({
                pathname: pathJoin(__dirname,"renderer/index.html"),
                protocol: "file:",
                slashes: true,
            })
        );
    }

    mainWindow.on("closed",() => {
        mainWindow=null;
    });

    createMenu();
}
function createMenu() {
    const isDev=process.env.NODE_ENV==='development';
    if(!isDev) {
        Menu.setApplicationMenu(null);
    }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // cmd register
    ipcFsCmdRegister();
    ipcRdCmdRegister();
    ipcCnCmdRegister();
    ipcAcCmdRegister();
    ipcLaCmdRegister();
    ipcDlCmdRegister();
    ipcUpCmdRegister();

    // render
    createWindow();
});

// Quit when all windows are closed.
app.on("window-all-closed",() => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if(process.platform!=="darwin") {
        app.quit();
    }
});

app.on("activate",() => {
    // On OS X it"s common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if(mainWindow===null) {
        createWindow();
    }
});


const reloadI18n=() => {
    getAllFiles(pI18n).forEach((filename: string) => {
        const lang=filename.split(".")[0];
        readJson(pathJoin(pI18n,filename)).then((json: any) => {
            setI18n(lang,json);
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('i18n-updated',lang);
            });
        });

    });
}
ipcMain.on('fetch-i18n',() => {
    reloadI18n();
})
reloadI18n();
