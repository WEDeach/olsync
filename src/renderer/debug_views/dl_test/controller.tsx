import { makeAutoObservable } from "mobx";
import g from "../../state";
import { HostType } from "../../../defines/types";

interface State {
}

export default class Controller {
    state: State;

    constructor() {
        this.state={}

        g.initConfig();

        makeAutoObservable(this);
    }

    initFDM=async () => {
        const result=await window.olsCore.initDL(HostType.FDM);
        if(result) {
            g.setNotify({
                message: "Free Download Manager has been initialized",
                severity: "success"
            });
            await window.olsCore.sendMessage4DL(0,{
                id: "1",
                type: "fdm_json_task",
                json: JSON.stringify({
                    type: "optionsClick"
                })
            })
        } else {
            g.setNotify({
                message: "Failed to initialize Free Download Manager",
                severity: "error"
            });
        }
    };
}