import { HostType } from "../defines/types";
import g from "../renderer/state";
import __ from "./i18n"
import { LogError } from "./log";
import { sleep } from "./time";
import { ConfigKey } from "./typed/config";
import { I18nStrings } from "./typed/i18n"

type TCallback=() => Promise<any[]>

export const GetDLOptionByRows=(data_fetcher: TCallback) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_ROWS),
        callback: async () => {
            try {
                g.setLoading(true,`${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                const rows=await data_fetcher();
                g.setLoading(false);

                if(!rows) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_DL_NODATA),
                        severity: 'warning'
                    });
                    return;
                }

                await navigator.clipboard.writeText(rows.join("\n"));
                g.setNotify({
                    message: __(I18nStrings.MAIN_DL_TO_CLIPBOARD,{ count: rows.length }),
                    severity: 'success'
                });
            } catch(error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        }
    }
}

export const GetDLOptionByFDM=(data_fetcher: TCallback) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_FDM),
        callback: async () => {
            try {
                g.setLoading(true,`${__(I18nStrings.MAIN_DL_FETCHING)}...`);
                const rows=await data_fetcher();
                g.setLoading(false);

                if(!rows) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_DL_NODATA),
                        severity: 'warning'
                    });
                    return;
                }
                const result=await window.olsCore.initDL(HostType.FDM);
                if(result) {
                    g.setNotify({
                        message: "Free Download Manager has been initialized",
                        severity: "success"
                    });
                    await window.olsCore.sendMessage4DL(0,{
                        id: "1",
                        type: "create_downloads",
                        create_downloads: {
                            downloads: rows.map((v) => ({ url: v }))
                        }
                    })
                } else {
                    g.setNotify({
                        message: "Failed to initialize Free Download Manager",
                        severity: "error"
                    });
                }
            } catch(error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        }
    }
}

export const GetDLOptionByDirect=(mapIds: number[]) => {
    return {
        label: __(I18nStrings.BTN_DL_BY_DIRECT),
        callback: async () => {
            try {
                if(confirm(__(I18nStrings.BTN_DL_BY_DIRECT_CONFIRM))) {
                    const delay_ms=Number(g.config?.[ConfigKey.DL_DELAY_MS])||10000;
                    const aborter=new AbortController();
                    g.setLoading(
                        true,
                        __(I18nStrings.MAIN_DL_PROGRESS,{ current: 0,total: mapIds.length }),
                        aborter
                    );

                    let successCount=0;
                    let failCount=0;
                    const failedIds: number[]=[];
                    for(let i=0; i<mapIds.length; i++) {
                        if(aborter.signal.aborted) {
                            g.setNotify({
                                message: __(I18nStrings.MAIN_DL_ABORTED,{
                                    success: successCount,
                                    failed: failCount,
                                    total: mapIds.length
                                }),
                                severity: 'warning'
                            });
                            break;
                        }
                        const map_id=mapIds[i];
                        const link=`osu://s/${map_id}`;
                        // TODO: link by set id and map id
                        g.setLoading(
                            true,
                            __(I18nStrings.MAIN_DL_PROGRESS,{
                                current: i+1,
                                total: mapIds.length
                            }),
                            aborter
                        );

                        try {
                            await window.olsCore.openExternal(link);
                            successCount++;
                        } catch(error) {
                            console.error(`Failed to open link (sid: ${map_id}):`,error);
                            failCount++;
                            failedIds.push(map_id);
                        }

                        if(i<mapIds.length-1) {
                            await sleep(delay_ms,aborter.signal);
                        }
                    }
                    g.setLoading(false);
                    if(!aborter.signal.aborted) {
                        g.setNotify({
                            message: __(I18nStrings.MAIN_DL_SUCCESS,{ count: successCount }),
                            severity: 'success'
                        });
                    }
                }
            } catch(error) {
                LogError(error);
            } finally {
                g.setLoading(false);
            }
        }
    }
}