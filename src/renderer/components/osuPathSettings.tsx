import { HelpOutlined } from "@mui/icons-material";
import { Button, IconButton, InputAdornment, Stack, TextField, Tooltip } from "@mui/material";
import { Observer } from "mobx-react";
import React from "react";
import __ from "../../utils/i18n";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";

export interface IOsuPathSettingsProps {
    showStable?: boolean;
    showLazer?: boolean;
}

const onBtnStablePathClicked = async () => {
    const result = await window.olsCore.openFile("Select directory for osu!stable", "openDirectory", []);
    if (result === undefined) return;
    await g.saveConfig(ConfigKey.PATH_STABLE_DIR, result);
};

const onBtnLazerPathClicked = async () => {
    const result = await window.olsCore.openFile("Select Realm file for osu!lazer");
    if (result === undefined) return;
    await g.saveConfig(ConfigKey.PATH_LAZER_REALM, result);
};

const onOsuPathChanged = async (osu_path?: string, lazer_path?: string) => {
    if (osu_path !== undefined) {
        await g.saveConfig(ConfigKey.PATH_STABLE_DIR, osu_path);
    }
    if (lazer_path !== undefined) {
        await g.saveConfig(ConfigKey.PATH_LAZER_REALM, lazer_path);
    }
};

export const OsuPathSettings: React.FC<IOsuPathSettingsProps> = ({ showStable = true, showLazer = true }) => {
    return (
        <Observer>
            {() => {
                const lazerPath = g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";
                const stablePath = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";

                return (
                    <Stack
                        direction={"column"}
                        spacing={2}
                        sx={{
                            flexGrow: 1,
                        }}
                    >
                        {showLazer && (
                            <Stack direction={"row"} spacing={1}>
                                <TextField
                                    label="LazerPath"
                                    variant="outlined"
                                    size="small"
                                    value={lazerPath}
                                    sx={{ flexGrow: 1 }}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                        onOsuPathChanged(undefined, event.target.value);
                                    }}
                                    slotProps={{
                                        input: {
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <Tooltip title={__(I18nStrings.MAIN_SETTINGS_PATH_LAZER_HELP)}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => g.setOnboarding(true, "path_lazer")}
                                                        >
                                                            <HelpOutlined fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </InputAdornment>
                                            ),
                                        },
                                    }}
                                />
                                <Button variant="contained" onClick={onBtnLazerPathClicked}>
                                    {__(I18nStrings.MAIN_SETTINGS_SELECT_FILE)}
                                </Button>
                            </Stack>
                        )}
                        {showStable && (
                            <Stack direction={"row"} spacing={1}>
                                <TextField
                                    label="OsuPath"
                                    variant="outlined"
                                    size="small"
                                    value={stablePath}
                                    sx={{ flexGrow: 1 }}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                        onOsuPathChanged(event.target.value, undefined);
                                    }}
                                />
                                <Button variant="contained" onClick={onBtnStablePathClicked}>
                                    {__(I18nStrings.MAIN_SETTINGS_SELECT_FILE)}
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                );
            }}
        </Observer>
    );
};
