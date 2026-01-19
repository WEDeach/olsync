import React from "react";
import { Observer } from "mobx-react";
import { Button,Stack,TextField } from "@mui/material";
import g from "../state";
import { ConfigKey } from "../../utils/typed/config";

export interface IOsuPathSettingsProps {
    showStable?: boolean;
    showLazer?: boolean;
}

const onBtnStablePathClicked=async () => {
    let result=await window.olsCore.openFile("Select directory for osu!stable","openDirectory",[]);
    if(result===undefined) return;
    await g.saveConfig(ConfigKey.PATH_STABLE_DIR,result);
};

const onBtnLazerPathClicked=async () => {
    let result=await window.olsCore.openFile("Select Realm file for osu!lazer");
    if(result===undefined) return;
    await g.saveConfig(ConfigKey.PATH_LAZER_REALM,result);
};

const onOsuPathChanged=async (osu_path?: string,lazer_path?: string) => {
    if(osu_path!==undefined) {
        await g.saveConfig(ConfigKey.PATH_STABLE_DIR,osu_path);
    }
    if(lazer_path!==undefined) {
        await g.saveConfig(ConfigKey.PATH_LAZER_REALM,lazer_path);
    }
};

export const OsuPathSettings: React.FC<IOsuPathSettingsProps>=({
    showStable=true,
    showLazer=true,
}) => {
    return (
        <Observer>
            {() => {
                const lazerPath=g.config?.[ConfigKey.PATH_LAZER_REALM]??"";
                const stablePath=g.config?.[ConfigKey.PATH_STABLE_DIR]??"";

                return (
                    <Stack direction={"column"} spacing={2} flexGrow={1}>
                        {showLazer&&(
                            <Stack direction={"row"} spacing={1}>
                                <TextField
                                    label="LazerPath"
                                    variant="outlined"
                                    value={lazerPath}
                                    sx={{ flexGrow: 1 }}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                        onOsuPathChanged(undefined,event.target.value);
                                    }}
                                />
                                <Button variant="contained" onClick={onBtnLazerPathClicked}>
                                    選擇檔案
                                </Button>
                            </Stack>
                        )}
                        {showStable&&(
                            <Stack direction={"row"} spacing={1}>
                                <TextField
                                    label="OsuPath"
                                    variant="outlined"
                                    value={stablePath}
                                    sx={{ flexGrow: 1 }}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                        onOsuPathChanged(event.target.value,undefined);
                                    }}
                                />
                                <Button variant="contained" onClick={onBtnStablePathClicked}>
                                    選擇檔案
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                );
            }}
        </Observer>
    );
};
