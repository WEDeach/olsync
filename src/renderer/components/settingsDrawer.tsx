import { Settings } from "@mui/icons-material";
import {
    Divider,
    Drawer,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { Observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { getApiDownloadLink, getApiPreDelayMs } from "../../utils/api";
import { getDelayMs } from "../../utils/download";
import {
    getDbMd5CheckExperiment,
    getPackRulesetByNmExperiment,
    getYinMoChanceExperiment,
} from "../../utils/experiments";
import __ from "../../utils/i18n";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { ApiSettings } from "./apiSettings";
import { OsuPathSettings } from "./osuPathSettings";

const DRAWER_WIDTH = "90vw";

export const SettingsDrawer: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [langs, setLangs] = useState<Record<string, string>>({});

    useEffect(() => {
        window.olsCore.fetchLangs().then(setLangs);
    }, []);

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
                                <Stack direction="row" spacing={2}>
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
                                <Stack direction="column" spacing={1}>
                                    <FormControlLabel
                                        control={<Switch defaultChecked={getYinMoChanceExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_USE_YINMO_CHANCE)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_YINMO_CHANCE, Boolean(checked))
                                        }
                                    />
                                    <FormControlLabel
                                        control={<Switch defaultChecked={getDbMd5CheckExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_CHECK_FILE_BY_MD5)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_DB_MD5_CHECK, Boolean(checked))
                                        }
                                    />
                                    <FormControlLabel
                                        control={<Switch defaultChecked={getPackRulesetByNmExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_NM)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_PACK_RULESET_BY_NM, Boolean(checked))
                                        }
                                    />
                                </Stack>

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">語系</Typography>
                                </Divider>
                                <FormControl size="small">
                                    <InputLabel>語系</InputLabel>
                                    <Select
                                        label="語系"
                                        value={g.config?.[ConfigKey.I18N_LANG] ?? "zh-TW"}
                                        onChange={(e) => {
                                            const val = e.target.value as string;
                                            g.saveConfig(ConfigKey.I18N_LANG, val);
                                            window.olsCore.send("set-i18n-lang", val);
                                        }}
                                    >
                                        {Object.keys(langs).length === 0 ? (
                                            <MenuItem disabled value="">
                                                {"No any i18n files (′゜ω。‵)"}
                                            </MenuItem>
                                        ) : (
                                            Object.entries(langs).map(([code, name]) => (
                                                <MenuItem key={code} value={code}>
                                                    {name}
                                                </MenuItem>
                                            ))
                                        )}
                                    </Select>
                                </FormControl>
                            </Stack>
                        );
                    }}
                </Observer>
            </Drawer>
        </>
    );
};
