import { FolderOpen, Info, Settings } from "@mui/icons-material";
import {
    Divider,
    Drawer,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    Link,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { Observer } from "mobx-react";
import React, { useEffect, useState } from "react";
import { getApiDownloadLink, getApiPreDelayMs } from "../../utils/api";
import { GetDelayMs } from "../../utils/download";
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
                        const dlDelay = GetDelayMs();
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
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_DL_SECTION)}
                                    </Typography>
                                </Divider>
                                <TextField
                                    label={__(I18nStrings.MAIN_SETTINGS_DL_SAVE_DIR)}
                                    variant="outlined"
                                    size="small"
                                    defaultValue={g.config?.[ConfigKey.DL_SAVE_DIR] ?? ""}
                                    placeholder={__(I18nStrings.MAIN_SETTINGS_DL_SAVE_DIR_PLACEHOLDER)}
                                    onChange={(e) => g.saveConfig(ConfigKey.DL_SAVE_DIR, e.target.value)}
                                    slotProps={{
                                        input: {
                                            endAdornment: (
                                                <IconButton
                                                    size="small"
                                                    onClick={async () => {
                                                        const dir = await window.olsCore.openFile(
                                                            __(I18nStrings.MAIN_SETTINGS_DL_SAVE_DIR_PICKER_TITLE),
                                                            "openDirectory",
                                                            [],
                                                        );
                                                        if (dir) g.saveConfig(ConfigKey.DL_SAVE_DIR, dir);
                                                    }}
                                                >
                                                    <FolderOpen fontSize="small" />
                                                </IconButton>
                                            ),
                                        },
                                    }}
                                />
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_WORKERS)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={g.config?.[ConfigKey.DL_WORKERS] ?? 2}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 1, max: 10 } }}
                                        onChange={(e) => g.saveConfig(ConfigKey.DL_WORKERS, Number(e.target.value))}
                                    />
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_SPEED_LIMIT)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={g.config?.[ConfigKey.DL_SPEED_LIMIT_MBPS] ?? 0}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 0, step: 0.5 } }}
                                        onChange={(e) =>
                                            g.saveConfig(ConfigKey.DL_SPEED_LIMIT_MBPS, Number(e.target.value))
                                        }
                                    />
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_CONCURRENCY)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={g.config?.[ConfigKey.DL_CONCURRENCY] ?? 10}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 1, max: 32 } }}
                                        onChange={(e) => g.saveConfig(ConfigKey.DL_CONCURRENCY, Number(e.target.value))}
                                    />
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_RATE_LIMIT)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={g.config?.[ConfigKey.DL_PRE_MIN_REQUESTS_LIMIT] ?? 48}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 1, max: 120 } }}
                                        onChange={(e) =>
                                            g.saveConfig(ConfigKey.DL_PRE_MIN_REQUESTS_LIMIT, Number(e.target.value))
                                        }
                                    />
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_MIN_CHUNK)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={(g.config?.[ConfigKey.DL_MIN_CHUNK_SIZE] ?? 3145728) / 1048576}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 0.5, step: 0.5 } }}
                                        onChange={(e) =>
                                            g.saveConfig(ConfigKey.DL_MIN_CHUNK_SIZE, Number(e.target.value) * 1048576)
                                        }
                                    />
                                    <TextField
                                        label={__(I18nStrings.MAIN_SETTINGS_DL_MAX_CHUNK)}
                                        variant="outlined"
                                        size="small"
                                        type="number"
                                        defaultValue={(g.config?.[ConfigKey.DL_MAX_CHUNK_SIZE] ?? 5242880) / 1048576}
                                        sx={{ flexGrow: 1 }}
                                        slotProps={{ htmlInput: { min: 1, step: 0.5 } }}
                                        onChange={(e) =>
                                            g.saveConfig(ConfigKey.DL_MAX_CHUNK_SIZE, Number(e.target.value) * 1048576)
                                        }
                                    />
                                </Stack>
                                <TextField
                                    label={__(I18nStrings.MAIN_SETTINGS_DL_MIRROR_URL)}
                                    variant="outlined"
                                    size="small"
                                    defaultValue={g.config?.[ConfigKey.DL_MIRROR_URL] ?? ""}
                                    placeholder={__(I18nStrings.MAIN_SETTINGS_DL_MIRROR_PLACEHOLDER)}
                                    onChange={(e) => g.saveConfig(ConfigKey.DL_MIRROR_URL, e.target.value)}
                                />
                                <TextField
                                    label={__(I18nStrings.MAIN_SETTINGS_DL_MIRROR_WORKERS)}
                                    variant="outlined"
                                    size="small"
                                    type="number"
                                    defaultValue={g.config?.[ConfigKey.DL_MIRROR_WORKERS] ?? 1}
                                    slotProps={{ htmlInput: { min: 1, max: 5 } }}
                                    onChange={(e) => g.saveConfig(ConfigKey.DL_MIRROR_WORKERS, Number(e.target.value))}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={Boolean(g.config?.[ConfigKey.EXPERIMENT_SPEEDTEST_DNS_PROXY])}
                                        />
                                    }
                                    label={
                                        <Stack direction="row" alignItems="center" spacing={1} useFlexGap>
                                            {__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS)}
                                            <Tooltip
                                                title={
                                                    <React.Fragment>
                                                        {__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS_DESC)}
                                                        <Link
                                                            href="https://yinmo.deachsword.com/blog/2023-08-osu-speed-up-beatmap-downloads"
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            {__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS_LINK)}
                                                        </Link>
                                                    </React.Fragment>
                                                }
                                                describeChild
                                                arrow
                                            >
                                                <Info fontSize="small" />
                                            </Tooltip>
                                        </Stack>
                                    }
                                    onChange={(_, checked) =>
                                        g.saveConfig(ConfigKey.EXPERIMENT_SPEEDTEST_DNS_PROXY, Boolean(checked))
                                    }
                                />

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">{__(I18nStrings.MAIN_SETTINGS_OTHERS)}</Typography>
                                </Divider>
                                <Stack direction="column" spacing={2}>
                                    <FormControlLabel
                                        control={<Switch checked={getYinMoChanceExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_USE_YINMO_CHANCE)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_YINMO_CHANCE, Boolean(checked))
                                        }
                                    />
                                    <FormControlLabel
                                        control={<Switch checked={getDbMd5CheckExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_CHECK_FILE_BY_MD5)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_DB_MD5_CHECK, Boolean(checked))
                                        }
                                    />
                                    <FormControlLabel
                                        control={<Switch checked={getPackRulesetByNmExperiment()} />}
                                        label={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_NM)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_PACK_RULESET_BY_NM, Boolean(checked))
                                        }
                                    />
                                </Stack>

                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}
                                    </Typography>
                                </Divider>
                                <FormControl size="small">
                                    <InputLabel>{__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}</InputLabel>
                                    <Select
                                        label={__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}
                                        value={g.config?.[ConfigKey.I18N_LANG] ?? "zh-TW"}
                                        onChange={(e) => {
                                            const val = e.target.value as string;
                                            g.saveConfig(ConfigKey.I18N_LANG, val);
                                            window.olsCore.send("set-i18n-lang", val);
                                        }}
                                    >
                                        {Object.keys(langs).length === 0 ? (
                                            <MenuItem disabled value="">
                                                {__(I18nStrings.MAIN_SETTINGS_NO_I18N)} (′゜ω。‵)
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
