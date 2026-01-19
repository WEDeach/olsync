import g from "../renderer/state";
import { LogError } from "./log";
import __ from "./i18n";
import { ConfigKey } from "./typed/config";
import { I18nStrings } from "./typed/i18n";

export const IApiPreDelayMs=Number(g.config?.[ConfigKey.API_DELAY_MS])||500;

export const InitApi=async (callback?: () => void) => {
    const ccid=g.cacheVal.str_client_id??"";
    const ccsc=g.cacheVal.str_client_secret??"";
    const init_result=await window.olsCore.initAC(ccid,ccsc);
    if(init_result) {
        LogError(init_result.error);
    } else {
        if(g.config?.[ConfigKey.API_CLIENT_ID]!=ccid) {
            await g.saveConfig(ConfigKey.API_CLIENT_ID,ccid);
        }
        if(g.config?.[ConfigKey.API_CLIENT_SECRET]!=ccsc) {
            await g.saveConfig(ConfigKey.API_CLIENT_SECRET,ccsc);
        }
        g.setNotify({
            message: __(I18nStrings.MAIN_API_CLIENT_INIT_SUCCESS),
            severity: "success"
        });
        callback?.();
    }
}