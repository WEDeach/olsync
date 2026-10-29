import { CloudDownload, FolderOpen, HelpOutlined, Settings } from "@mui/icons-material";
import {
    Box,
    Button,
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
    Tooltip,
    Typography,
    useColorScheme,
} from "@mui/material";
import { Observer } from "mobx-react";
import React, { useCallback, useEffect, useState } from "react";
import { getApiDownloadLink, getApiPreDelayMs } from "../../utils/api";
import { GetDelayMs } from "../../utils/download";
import {
    getClassicScoreExperiment,
    getDbMd5CheckExperiment,
    getUseLazerModeExperiment,
    getYinMoChanceExperiment,
} from "../../utils/experiments";
import __ from "../../utils/i18n";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { ApiSettings } from "./apiSettings";
import { PausableCircularProgress } from "./common/PausableCircularProgress";
import { InfoLinkTooltip } from "./infoLinkTooltip";
import { OsuPathSettings } from "./osuPathSettings";
import { PackRulesetByBnToggle } from "./packRulesetByBnToggle";

const DRAWER_WIDTH = "90vw";

export const SettingsDrawer: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [spin, setSpin] = useState<"cw" | "ccw" | null>(null);
    const [spinKey, setSpinKey] = useState(0);
    const [langs, setLangs] = useState<Record<string, string>>({});
    const [odStatus, setOdStatus] = useState<{ loaded: boolean; tagCount: number; lastUpdate: number } | null>(null);
    const [odDownloading, setOdDownloading] = useState(false);
    const [odMsg, setOdMsg] = useState<string>("");
    const { mode, setMode } = useColorScheme();

    const refreshOdStatus = useCallback(async () => {
        const s = await window.olsCore.getOnlineDbStatus();
        if (s && !(s as any).error) setOdStatus(s as any);
    }, []);

    useEffect(() => {
        window.olsCore.fetchLangs().then(setLangs);
        refreshOdStatus();
    }, []);

    const handleUpdateOnlineDb = useCallback(async () => {
        const check = await window.olsCore.checkOnlineDbUpdate();
        if (!check || (check as any).error) return;
        if (!(check as any).needsUpdate) {
            const confirmed = window.confirm(
                `${__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_CONFIRM_TITLE)}\n${__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_CONFIRM_BODY)}`,
            );
            if (!confirmed) return;
        }
        setOdDownloading(true);
        setOdMsg(__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_DOWNLOADING));
        const result = await window.olsCore.downloadOnlineDb();
        setOdDownloading(false);
        if ((result as any).success) {
            setOdMsg(
                __(I18nStrings.MAIN_SETTINGS_ONLINE_DB_SUCCESS).replace(
                    ":count",
                    String((result as any).tagCount ?? 0),
                ),
            );
        } else {
            setOdMsg(
                __(I18nStrings.MAIN_SETTINGS_ONLINE_DB_FAILED).replace(":error", String((result as any).error ?? "")),
            );
        }
        await refreshOdStatus();
    }, [refreshOdStatus]);

    return (
        <>
            <IconButton
                onClick={() => {
                    setSpinKey((k) => k + 1);
                    setSpin("cw");
                    setOpen(true);
                }}
                sx={{
                    position: "relative",
                    width: 56,
                    height: 40,
                    borderRadius: 0,
                    overflow: "visible",
                    color: "text.secondary",
                    bgcolor: "transparent",
                    "&:hover": {
                        bgcolor: "action.hover",
                        "& .rail-icon": { transform: "scale(1.1)" },
                    },
                    "&:active": { transform: "scale(0.94)" },
                    transition:
                        "background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 100ms cubic-bezier(0.4, 0, 0.2, 1)",
                    animation: "rail-item-in 260ms cubic-bezier(0.2, 0, 0, 1) 210ms backwards",
                    "@keyframes rail-item-in": {
                        from: { opacity: 0, transform: "translateX(-10px)" },
                        to: { opacity: 1, transform: "translateX(0)" },
                    },
                }}
            >
                <Box
                    key={spinKey}
                    className="rail-icon"
                    sx={{
                        display: "flex",
                        transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                        ...(spin !== null && {
                            animation:
                                spin === "cw"
                                    ? "gear-spin-cw 0.55s cubic-bezier(0.4, 0, 0.2, 1)"
                                    : "gear-spin-ccw 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
                        }),
                        "@keyframes gear-spin-cw": {
                            from: { transform: "rotate(0deg)" },
                            to: { transform: "rotate(360deg)" },
                        },
                        "@keyframes gear-spin-ccw": {
                            from: { transform: "rotate(0deg)" },
                            to: { transform: "rotate(-360deg)" },
                        },
                    }}
                >
                    <Settings />
                </Box>
            </IconButton>
            <Drawer
                anchor="right"
                open={open}
                onClose={() => {
                    setSpinKey((k) => k + 1);
                    setSpin("ccw");
                    setOpen(false);
                }}
                slotProps={{
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
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_APPEARANCE)}
                                    </Typography>
                                </Divider>
                                <TextField
                                    select
                                    fullWidth
                                    label={__(I18nStrings.MAIN_SETTINGS_THEME_MODE)}
                                    variant="outlined"
                                    size="small"
                                    value={mode ?? "system"}
                                    onChange={(e) => setMode(e.target.value as "light" | "dark" | "system")}
                                >
                                    <MenuItem value="system">{__(I18nStrings.MAIN_SETTINGS_THEME_SYSTEM)}</MenuItem>
                                    <MenuItem value="light">{__(I18nStrings.MAIN_SETTINGS_THEME_LIGHT)}</MenuItem>
                                    <MenuItem value="dark">{__(I18nStrings.MAIN_SETTINGS_THEME_DARK)}</MenuItem>
                                </TextField>
                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">{__(I18nStrings.MAIN_SETTINGS_PATH)}</Typography>
                                </Divider>
                                <OsuPathSettings showStable={true} showLazer={true} />
                                <Divider textAlign="left">
                                    <Box
                                        component="span"
                                        sx={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 1,
                                        }}
                                    >
                                        <Typography component="span" variant="subtitle2">
                                            {__(I18nStrings.MAIN_SETTINGS_API)}
                                        </Typography>
                                        <Tooltip title={__(I18nStrings.MAIN_SETTINGS_API_HELP)}>
                                            <IconButton size="small" onClick={() => g.setOnboarding(true, "oauth2")}>
                                                <HelpOutlined fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Divider>
                                <ApiSettings />
                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_DOWNLOAD)}
                                    </Typography>
                                </Divider>
                                <TextField
                                    fullWidth
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
                                    fullWidth
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
                                    fullWidth
                                    label={__(I18nStrings.MAIN_SETTINGS_DL_MIRROR_URL)}
                                    variant="outlined"
                                    size="small"
                                    defaultValue={g.config?.[ConfigKey.DL_MIRROR_URL] ?? ""}
                                    placeholder={__(I18nStrings.MAIN_SETTINGS_DL_MIRROR_PLACEHOLDER)}
                                    onChange={(e) => g.saveConfig(ConfigKey.DL_MIRROR_URL, e.target.value)}
                                />
                                <TextField
                                    fullWidth
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
                                        <Stack
                                            direction="row"
                                            spacing={1}
                                            useFlexGap
                                            sx={{
                                                alignItems: "center",
                                            }}
                                        >
                                            {__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS)}
                                            <InfoLinkTooltip
                                                title={__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS_DESC)}
                                                linkText={__(I18nStrings.MAIN_SETTINGS_DL_SPEEDTEST_DNS_LINK)}
                                                href="https://yinmo.deachsword.com/blog/2023-08-osu-speed-up-beatmap-downloads"
                                            />
                                        </Stack>
                                    }
                                    onChange={(_, checked) =>
                                        g.saveConfig(ConfigKey.EXPERIMENT_SPEEDTEST_DNS_PROXY, Boolean(checked))
                                    }
                                />
                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_SECTION)}
                                    </Typography>
                                </Divider>
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={
                                            odDownloading ? (
                                                <PausableCircularProgress size={14} />
                                            ) : (
                                                <CloudDownload fontSize="small" />
                                            )
                                        }
                                        disabled={odDownloading}
                                        onClick={handleUpdateOnlineDb}
                                    >
                                        {__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_UPDATE)}
                                    </Button>
                                    <Stack direction="column" spacing={0}>
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: "text.secondary",
                                            }}
                                        >
                                            {__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_LAST_UPDATE)}:{" "}
                                            {odStatus?.lastUpdate
                                                ? new Date(odStatus.lastUpdate).toLocaleDateString()
                                                : __(I18nStrings.MAIN_SETTINGS_ONLINE_DB_NEVER)}
                                        </Typography>
                                        {odStatus?.loaded && (
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    color: "text.secondary",
                                                }}
                                            >
                                                {__(I18nStrings.MAIN_SETTINGS_ONLINE_DB_TAGS).replace(
                                                    ":count",
                                                    String(odStatus.tagCount),
                                                )}
                                            </Typography>
                                        )}
                                        {odMsg && (
                                            <Typography
                                                variant="caption"
                                                color={
                                                    odMsg.startsWith(
                                                        __(I18nStrings.MAIN_SETTINGS_ONLINE_DB_FAILED).split(":")[0],
                                                    )
                                                        ? "error"
                                                        : "success.main"
                                                }
                                            >
                                                {odMsg}
                                            </Typography>
                                        )}
                                    </Stack>
                                </Stack>
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
                                    <PackRulesetByBnToggle />
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                        <FormControlLabel
                                            control={<Switch checked={getUseLazerModeExperiment()} />}
                                            label={__(I18nStrings.MAIN_SETTINGS_USE_LAZER_MODE)}
                                            onChange={(_, checked) =>
                                                g.saveConfig(ConfigKey.EXPERIMENT_USE_LAZER_MODE, Boolean(checked))
                                            }
                                        />
                                        <InfoLinkTooltip title={__(I18nStrings.MAIN_SETTINGS_USE_LAZER_MODE_DESC)} />
                                    </Stack>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={getClassicScoreExperiment()}
                                                disabled={!getUseLazerModeExperiment()}
                                            />
                                        }
                                        label={__(I18nStrings.MAIN_SETTINGS_CLASSIC_SCORE)}
                                        onChange={(_, checked) =>
                                            g.saveConfig(ConfigKey.EXPERIMENT_CLASSIC_SCORE, Boolean(checked))
                                        }
                                    />
                                </Stack>
                                <Divider textAlign="left">
                                    <Typography variant="subtitle2">
                                        {__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}
                                    </Typography>
                                </Divider>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>{__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}</InputLabel>
                                    <Select
                                        label={__(I18nStrings.MAIN_SETTINGS_LANGUAGE)}
                                        value={g.config?.[ConfigKey.I18N_LANG] ?? "zh-TW"}
                                        onChange={(e) => {
                                            const val = e.target.value as string;
                                            g.saveConfig(ConfigKey.I18N_LANG, val);
                                            void window.olsCore.setI18nLang(val);
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
