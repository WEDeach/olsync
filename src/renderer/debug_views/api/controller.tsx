import { action,makeAutoObservable } from "mobx";
import { ConfigKey } from "../../../utils/typed/config";
import g from "../../state";

interface State {
}

export default class Controller {
    state: State;

    constructor() {
        this.state={}

        g.initConfig();

        makeAutoObservable(this);
    }

    get ClientId() {
        return g.cacheVal.str_client_id??""
    }

    get ClientSecret() {
        return g.cacheVal.str_client_secret??""
    }

    initClient=async () => {
        const init_result=await window.olsCore.initAC(this.ClientId,this.ClientSecret);
        if(init_result.error) {
            console.log(init_result.error);

            g.setError({
                message: init_result.error.message
            })
        } else {
            const client=await window.olsCore.getAC();
            console.log(client);

            await g.saveConfig(ConfigKey.API_CLIENT_ID,this.ClientId);
            await g.saveConfig(ConfigKey.API_CLIENT_SECRET,this.ClientSecret);
            g.setNotify({
                message: "API client has been initialized.",
                severity: "success"
            })
        }

    };

    @action
    onApiClientConfigChanged=async (client_id?: string,client_secret?: string) => {
        if(client_id) {
            g.cacheVal.str_client_id=client_id;
        }
        if(client_secret) {
            g.cacheVal.str_client_secret=client_secret;
        }
    };
}