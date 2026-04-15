import { Settings } from "@mui/icons-material";
import { Divider, Drawer, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from "@mui/material";
import { Observer } from "mobx-react";
import React, { useState } from "react";
import { getApiDownloadLink, getApiPreDelayMs } from "../../utils/api";
import { getDelayMs } from "../../utils/download";
import { getYinMoChanceExperiment } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { ApiSettings } from "./apiSettings";
import { OsuPathSettings } from "./osuPathSettings";

const DRAWER_WIDTH = "90vw";

export const SettingsDrawer: React.FC = () => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <IconButton onClick={() => setOpen(true)}>
                <Settings />
            </IconButton>
            <Drawer
                anchor="right"
                open={open}
                onClose={() => setOpen(false)}
                slotProps={{
                    transition: { direction: "left" },
                    paper: {
                        sx: {
                            width: DRAWER_WIDTH,
                            p: 2,
                            backdropFilter: "blur(0.5rem)",
                            WebkitBackdropFilter: "blur(0.5rem)",
                        },
                    },
                }}
            >
                <Observer>
                    {() => {
                        const apiDelay = getApiPreDelayMs();
                        const dlDelay = getDelayMs();
                        const dlink = getApiDownloadLink();

                        return (
                            <Stack spacing={2}>
                                <Typography variant="h6">{__(I18nStrings.MAIN_SETTINGS_TITLE)}</Typography>
                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">{__(I18nStrings.MAIN_SETTINGS_PATH)}</Typography>
                                </Divider>
                                <OsuPathSettings showStable={true} showLazer={true} />

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">{__(I18nStrings.MAIN_SETTINGS_API)}</Typography>
                                </Divider>
                                <ApiSettings />

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_DOWNLOAD)}
                                    </Typography>
                                </Divider>
                                <TextField
                                    label={__(I18nStrings.MAIN_SETTINGS_DLINK)}
                                    variant="outlined"
                                    size="small"
                                    defaultValue={dlink}
                                    onChange={(e) => g.saveConfig(ConfigKey.API_DLINK, e.target.value)}
                                />
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_API_DELAY)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={apiDelay}
                                        sx={{ flexGrow: 1 }}
                                        onChange={(e) => g.saveConfig(ConfigKey.API_DELAY_MS, Number(e.target.value))}
                                    />
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_DELAY)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={dlDelay}
                                        sx={{ flexGrow: 1 }}
                                        onChange={(e) => g.saveConfig(ConfigKey.DL_DELAY_MS, Number(e.target.value))}
                                    />
                                </Stack>

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">{__(I18nStrings.MAIN_SETTINGS_OTHERS)}</Typography>
                                </Divider>
                                <Stack direction="row" spacing={1}>
                                    <FormControlLabel
                                        control={<Switch defaultChecked={getYinMoChanceExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_USE_YINMO_CHANCE)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_YINMO_CHANCE, Boolean(checked))
                                        }
                                    />
                                </Stack>
                            </Stack>
                        );
                    }}
                </Observer>
            </Drawer>
        </>
    );
};
