import { Info as InfoIcon } from "@mui/icons-material";
import {
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { Observer } from "mobx-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BeatmapPack, RankedStatus, RespBeatmapPack } from "../../api/v2/types/api_resp";
import { OsuModes } from "../../defines/types";
import { getApiDownloadLink, getApiPreDelayMs } from "../../utils/api";
import {
    BuiltinItem,
    GetDLOptionByBuiltin,
    GetDLOptionByDirect,
    GetDLOptionByFDM,
    GetDLOptionByRows,
} from "../../utils/download";
import { getPackRulesetByNmExperiment, getUseLazerModeExperiment } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { createLogger } from "../../utils/logger";
import { OsuData } from "../../utils/osu";
import { sleep } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { DataViewer } from "./dataViewer";
import { PackRulesetByBnToggle } from "./packRulesetByBnToggle";
import { IPropertyWithName } from "./table";

export interface IBeatmapPackDownloadViewProps {}

const log = createLogger("BeatmapPackDownload");

const MODE_NAME_MAP: Record<string, string> = { "0": "osu", "1": "taiko", "2": "fruits", "3": "mania" };

export type DateRangeType = "7d" | "30d" | "6m" | "all";

const getTypeOptions = () => [
    { key: "all", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_ALL) },
    { key: "standard", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_STANDARD) },
    { key: "featured", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_FEATURED) },
    { key: "tournament", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_TOURNAMENT) },
    { key: "loved", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_LOVED) },
    { key: "chart", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_CHART) },
    { key: "theme", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_THEME) },
    { key: "artist", label: __(I18nStrings.MAIN_BPKS_DL_TYPE_ARTIST) },
];

type BeatmapPackStatus = `${RankedStatus}`;

const getStatusOptions = (): { key: "all" | BeatmapPackStatus; label: string }[] => [
    { key: "all", label: __(I18nStrings.MAIN_BPKS_DL_STATUS_ALL) },
    { key: RankedStatus.Ranked, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_RANKED) },
    { key: RankedStatus.Approved, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_APPROVED) },
    { key: RankedStatus.Qualified, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_QUALIFIED) },
    { key: RankedStatus.Loved, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_LOVED) },
    { key: RankedStatus.Pending, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_PENDING) },
    { key: RankedStatus.WIP, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_WIP) },
    { key: RankedStatus.Graveyard, label: __(I18nStrings.MAIN_BPKS_DL_STATUS_GRAVEYARD) },
];

const statusFilterOf = (raw: unknown): string[] => {
    if (!Array.isArray(raw) || raw.length === 0) return ["all"];
    return raw.map(String);
};

const getDateRangeOptions = () => [
    { key: "7d" as DateRangeType, label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_7D), days: 7 },
    { key: "30d" as DateRangeType, label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_30D), days: 30 },
    { key: "6m" as DateRangeType, label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_6M), days: 180 },
    { key: "all" as DateRangeType, label: __(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_ALL), days: null },
];

export type DetectionScope = "all" | "stable" | "lazer";

const PACK_MODE_OPTIONS: Array<{ value: "full" | "diff"; label: I18nStrings; tooltip: I18nStrings }> = [
    {
        value: "full",
        label: I18nStrings.MAIN_BPKS_DL_MODE_FULL,
        tooltip: I18nStrings.MAIN_BPKS_DL_FULL_TOOLTIP,
    },
    {
        value: "diff",
        label: I18nStrings.MAIN_BPKS_DL_MODE_DIFF,
        tooltip: I18nStrings.MAIN_BPKS_DL_DIFF_TOOLTIP,
    },
];

const PackDownloadModeSelector: React.FC<{
    onModeChange: (mode: "full" | "diff") => void;
    groupRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ onModeChange, groupRef }) => (
    <Observer>
        {() => {
            const downloadMode = (g.config?.[ConfigKey.BPKS_DL_MODE] ?? "full") as "full" | "diff";
            return (
                <Box>
                    <Typography variant="h6" gutterBottom>
                        {__(I18nStrings.MAIN_BPKS_DL_MODE_TITLE)}
                    </Typography>
                    <RadioGroup
                        ref={groupRef}
                        value={downloadMode}
                        onChange={(e) => onModeChange(e.target.value as "full" | "diff")}
                    >
                        <Stack direction="row" spacing={3}>
                            {PACK_MODE_OPTIONS.map((option) => (
                                <FormControlLabel
                                    key={option.value}
                                    value={option.value}
                                    control={<Radio />}
                                    label={
                                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                            <span>{__(option.label)}</span>
                                            <Tooltip arrow title={__(option.tooltip)}>
                                                <InfoIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                                            </Tooltip>
                                        </Stack>
                                    }
                                />
                            ))}
                        </Stack>
                    </RadioGroup>
                </Box>
            );
        }}
    </Observer>
);

const BeatmapPackDownloadOptions: React.FC<{
    selectedTypes: string[];
    gameModes: string[];
    selectedStatuses: string[];
    selectedDateRange: DateRangeType;
    downloadMode: "full" | "diff";
    detectionScope: DetectionScope;
    onTypeChange: (types: string | string[]) => void;
    onGameModeChange: (types: string | string[]) => void;
    onStatusChange: (statuses: string | string[]) => void;
    onDateRangeChange: (range: DateRangeType) => void;
    onScopeChange: (scope: DetectionScope) => void;
    modeSelectorRef?: React.RefObject<HTMLDivElement | null>;
}> = ({
    selectedTypes,
    gameModes,
    selectedStatuses,
    selectedDateRange,
    downloadMode,
    detectionScope,
    onTypeChange,
    onGameModeChange,
    onStatusChange,
    onDateRangeChange,
    onScopeChange,
    modeSelectorRef,
}) => {
    const typeOptions = getTypeOptions();
    const statusOptions = getStatusOptions();
    const dateRangeOptions = getDateRangeOptions();
    const modesOptions = [
        {
            key: "all",
            label: __(I18nStrings.MAIN_BPKS_DL_GMODE_ALL),
        },
        ...OsuModes.entries()
            .map(([key, value]) => ({ key, label: value }))
            .toArray(),
    ];

    const fullPaneRef = useRef<HTMLDivElement | null>(null);
    const diffPaneRef = useRef<HTMLDivElement | null>(null);
    const [paneHeights, setPaneHeights] = useState<Partial<Record<"full" | "diff", number>>>({});
    const [openSelectId, setOpenSelectId] = useState<string | null>(null);
    const previousModeRef = useRef(downloadMode);
    useLayoutEffect(() => {
        const previous = previousModeRef.current;
        previousModeRef.current = downloadMode;
        if (previous === downloadMode) return;
        const hadOpenPopup = openSelectId !== null;
        if (hadOpenPopup) setOpenSelectId(null);
        const outgoingPane = previous === "full" ? fullPaneRef.current : diffPaneRef.current;
        const focusInOutgoingPane = !!outgoingPane?.contains(document.activeElement);
        if (focusInOutgoingPane || hadOpenPopup) {
            const radio = modeSelectorRef?.current?.querySelector(`input[value="${downloadMode}"]`);
            (radio as HTMLElement | null)?.focus();
        }
    }, [downloadMode, openSelectId, modeSelectorRef]);
    const selectOpenProps = (id: string, pane: "full" | "diff") => ({
        open: downloadMode === pane && openSelectId === id,
        onOpen: () => setOpenSelectId(id),
        onClose: () => setOpenSelectId((current) => (current === id ? null : current)),
    });
    useEffect(() => {
        const panes: Array<["full" | "diff", HTMLDivElement | null]> = [
            ["full", fullPaneRef.current],
            ["diff", diffPaneRef.current],
        ];
        const measure = () => {
            setPaneHeights((prev) => {
                const next = { ...prev };
                for (const [key, el] of panes) if (el) next[key] = el.offsetHeight;
                return next;
            });
        };
        const observer = new ResizeObserver(measure);
        for (const [, el] of panes) if (el) observer.observe(el);
        const raf = requestAnimationFrame(measure);
        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
        };
    }, []);
    const activePaneHeight = downloadMode === "full" ? paneHeights.full : paneHeights.diff;

    return (
        <Stack spacing={2}>
            <Box
                sx={{
                    overflow: "hidden",
                    mt: -1.5,
                    height: activePaneHeight !== undefined ? `${activePaneHeight}px` : undefined,
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        width: "200%",
                        transform: downloadMode === "full" ? "translateX(0%)" : "translateX(-50%)",
                        transition: "transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
                        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
                    }}
                >
                    <Box
                        ref={fullPaneRef}
                        inert={downloadMode !== "full"}
                        aria-hidden={downloadMode !== "full"}
                        sx={{ width: "50%", flexShrink: 0, pt: 1.5, pr: 2 }}
                    >
                        <Stack spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel id="bpks-full-types">{__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}</InputLabel>
                                <Select
                                    labelId="bpks-full-types"
                                    {...selectOpenProps("bpks-full-types", "full")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}
                                    value={selectedTypes}
                                    onChange={(e) => onTypeChange(e.target.value)}
                                    multiple
                                >
                                    {typeOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="bpks-full-gamemodes">
                                    {__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}
                                </InputLabel>
                                <Select
                                    labelId="bpks-full-gamemodes"
                                    {...selectOpenProps("bpks-full-gamemodes", "full")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}
                                    value={gameModes}
                                    onChange={(e) => onGameModeChange(e.target.value)}
                                    multiple
                                >
                                    {modesOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="bpks-full-date-range">
                                    {__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}
                                </InputLabel>
                                <Select
                                    labelId="bpks-full-date-range"
                                    {...selectOpenProps("bpks-full-date-range", "full")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}
                                    value={selectedDateRange}
                                    onChange={(e) => onDateRangeChange(e.target.value as DateRangeType)}
                                >
                                    {dateRangeOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    </Box>

                    <Box
                        ref={diffPaneRef}
                        inert={downloadMode !== "diff"}
                        aria-hidden={downloadMode !== "diff"}
                        sx={{ width: "50%", flexShrink: 0, pt: 1.5, pl: 2 }}
                    >
                        <Stack spacing={2}>
                            <FormControl fullWidth>
                                <InputLabel id="bpks-diff-types">{__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}</InputLabel>
                                <Select
                                    labelId="bpks-diff-types"
                                    {...selectOpenProps("bpks-diff-types", "diff")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_TYPE_LABEL)}
                                    value={selectedTypes}
                                    onChange={(e) => onTypeChange(e.target.value)}
                                    multiple
                                >
                                    {typeOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="bpks-diff-gamemodes">
                                    {__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}
                                </InputLabel>
                                <Select
                                    labelId="bpks-diff-gamemodes"
                                    {...selectOpenProps("bpks-diff-gamemodes", "diff")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_GMODE_LABEL)}
                                    value={gameModes}
                                    onChange={(e) => onGameModeChange(e.target.value)}
                                    multiple
                                >
                                    {modesOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="bpks-diff-statuses">
                                    {__(I18nStrings.MAIN_BPKS_DL_STATUS_LABEL)}
                                </InputLabel>
                                <Select
                                    labelId="bpks-diff-statuses"
                                    {...selectOpenProps("bpks-diff-statuses", "diff")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_STATUS_LABEL)}
                                    value={selectedStatuses}
                                    onChange={(e) => onStatusChange(e.target.value)}
                                    multiple
                                >
                                    {statusOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="bpks-diff-date-range">
                                    {__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}
                                </InputLabel>
                                <Select
                                    labelId="bpks-diff-date-range"
                                    {...selectOpenProps("bpks-diff-date-range", "diff")}
                                    label={__(I18nStrings.MAIN_BPKS_DL_DATE_RANGE_LABEL)}
                                    value={selectedDateRange}
                                    onChange={(e) => onDateRangeChange(e.target.value as DateRangeType)}
                                >
                                    {dateRangeOptions.map((option) => (
                                        <MenuItem key={option.key} value={option.key}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    {__(I18nStrings.MAIN_BPKS_DL_SCOPE_LABEL)}
                                </Typography>
                                <RadioGroup
                                    value={detectionScope}
                                    onChange={(e) => onScopeChange(e.target.value as DetectionScope)}
                                >
                                    <FormControlLabel
                                        value="all"
                                        control={<Radio />}
                                        label={__(I18nStrings.MAIN_BPKS_DL_SCOPE_ALL)}
                                    />
                                    <FormControlLabel
                                        value="stable"
                                        control={<Radio />}
                                        label={__(I18nStrings.MAIN_BPKS_DL_SCOPE_STABLE)}
                                    />
                                    <FormControlLabel
                                        value="lazer"
                                        control={<Radio />}
                                        label={__(I18nStrings.MAIN_BPKS_DL_SCOPE_LAZER)}
                                    />
                                </RadioGroup>
                            </Box>

                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    {__(I18nStrings.MAIN_SETTINGS_OTHERS)}
                                </Typography>
                                <PackRulesetByBnToggle />
                            </Box>
                        </Stack>
                    </Box>
                </Box>
            </Box>
        </Stack>
    );
};

export const BeatmapPackDownloadView: React.FC<IBeatmapPackDownloadViewProps> = () => {
    const modeSelectorRef = useRef<HTMLDivElement | null>(null);
    const [fetchedPacks, setFetchedPacks] = useState<BeatmapPack[]>([]);
    const [fetchedPackInfos, setFetchedPackInfos] = useState<RespBeatmapPack[]>([]);
    const [excludedPackTags, setExcludedPackTags] = useState<Set<string>>(new Set());
    const [excludedPackMapIds, setExcludedPackMapIds] = useState<Set<number>>(new Set());
    const [missingSourceLabels, setMissingSourceLabels] = useState<Map<number, "stable" | "lazer" | "common">>(
        new Map(),
    );

    const handleTypeChange = async (type: string | string[]) => {
        let types = typeof type === "string" ? [type] : type;
        const savedTypes = g.config?.[ConfigKey.BPKS_DL_TYPE] ?? ["standard"];
        const oldTypes = Array.from(savedTypes);

        if (types.includes("all")) {
            if (oldTypes.includes("all")) {
                types = types.filter((v) => v !== "all");
            } else {
                types = [];
            }
        }
        if (types.length === 0) {
            types = ["all"];
        }

        await g.saveConfig(ConfigKey.BPKS_DL_TYPE, types);
    };

    const handleGameModeChange = async (mode: string | string[]) => {
        let modes = typeof mode === "string" ? [mode] : mode;
        const old = Array.from(g.config?.[ConfigKey.BPKS_DL_GMODE] ?? ["all"]);

        if (modes.includes("all")) {
            if (old.includes("all")) {
                modes = modes.filter((v) => v !== "all");
            } else {
                modes = [];
            }
        }
        if (modes.length === 0) {
            modes = ["all"];
        }

        await g.saveConfig(ConfigKey.BPKS_DL_GMODE, modes);
    };

    const handleStatusChange = async (status: string | string[]) => {
        let statuses = typeof status === "string" ? [status] : status;
        const old = statusFilterOf(g.config?.[ConfigKey.BPKS_DL_STATUS]);

        if (statuses.includes("all")) {
            if (old.includes("all")) {
                statuses = statuses.filter((v) => v !== "all");
            } else {
                statuses = [];
            }
        }
        if (statuses.length === 0) {
            statuses = ["all"];
        }

        await g.saveConfig(ConfigKey.BPKS_DL_STATUS, statuses);
    };

    const handleDateRangeChange = async (range: DateRangeType) => {
        await g.saveConfig(ConfigKey.BPKS_DL_DATE_RANGE, range);
    };

    const handleModeChange = async (mode: "full" | "diff") => {
        await g.saveConfig(ConfigKey.BPKS_DL_MODE, mode);
    };

    const handleScopeChange = async (scope: DetectionScope) => {
        await g.saveConfig(ConfigKey.BPKS_DL_DETECTION_SCOPE, scope);
    };

    const handleOpenDialog = () => {
        const render = () => {
            const savedTypes = (g.config?.[ConfigKey.BPKS_DL_TYPE] ?? ["standard"]) as string[];
            const gameModes = g.config?.[ConfigKey.BPKS_DL_GMODE] ?? (["all"] as string[]);
            const selectedStatuses = statusFilterOf(g.config?.[ConfigKey.BPKS_DL_STATUS]);
            const savedDateRange = (g.config?.[ConfigKey.BPKS_DL_DATE_RANGE] ?? "7d") as DateRangeType;
            const savedMode = (g.config?.[ConfigKey.BPKS_DL_MODE] ?? "full") as "full" | "diff";
            const savedScope = (g.config?.[ConfigKey.BPKS_DL_DETECTION_SCOPE] ?? "all") as DetectionScope;
            return (
                <BeatmapPackDownloadOptions
                    selectedTypes={savedTypes}
                    gameModes={gameModes}
                    selectedStatuses={selectedStatuses}
                    selectedDateRange={savedDateRange}
                    downloadMode={savedMode}
                    detectionScope={savedScope}
                    onTypeChange={handleTypeChange}
                    onGameModeChange={handleGameModeChange}
                    onStatusChange={handleStatusChange}
                    onDateRangeChange={handleDateRangeChange}
                    onScopeChange={handleScopeChange}
                    modeSelectorRef={modeSelectorRef}
                />
            );
        };
        g.setDialog(true, {
            title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
            headerContent: <PackDownloadModeSelector onModeChange={handleModeChange} groupRef={modeSelectorRef} />,
            content: render,
            scrollBody: true,
            actions: [
                {
                    label: __(I18nStrings.BTN_CANCEL),
                    callback: handleCloseDialog,
                },
                {
                    label: __(I18nStrings.BTN_CONFIRM),
                    callback: handleConfirmDownload,
                },
            ],
        });
    };

    const handleCloseDialog = () => {
        g.setDialog(false);
    };

    const filterPacksByDate = (packs: BeatmapPack[], range: DateRangeType) => {
        if (range === "all") return packs;

        const dateRangeOptions = getDateRangeOptions();
        const rangeOption = dateRangeOptions.find((opt) => opt.key === range);
        if (!rangeOption || rangeOption.days === null) return packs;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - rangeOption.days);

        return packs.filter((pack) => {
            const packDate = new Date(pack.date);
            return packDate >= cutoffDate;
        });
    };

    const handleConfirmDownload = async () => {
        const types = (g.config?.[ConfigKey.BPKS_DL_TYPE] ?? ["standard"]) as string[];
        const dateRange = (g.config?.[ConfigKey.BPKS_DL_DATE_RANGE] ?? "7d") as DateRangeType;
        const downloadMode = (g.config?.[ConfigKey.BPKS_DL_MODE] ?? "full") as "full" | "diff";
        const detectionScope = (g.config?.[ConfigKey.BPKS_DL_DETECTION_SCOPE] ?? "all") as DetectionScope;
        const gameModes = g.config?.[ConfigKey.BPKS_DL_GMODE] ?? (["all"] as string[]);
        const statusFilter = statusFilterOf(g.config?.[ConfigKey.BPKS_DL_STATUS]);
        const statusFilterActive = !statusFilter.includes("all");
        const osuPath = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
        const lazerPath = g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";

        if (types.length === 0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_BPKS_DL_NO_TYPE_SELECTED),
                severity: "warning",
            });
            return;
        }

        if (dateRange === "all") {
            if (!confirm(__(I18nStrings.MAIN_BPKS_DATE_RABGE_CONFIRM))) {
                return;
            }
        }

        if (downloadMode === "diff") {
            if (detectionScope !== "lazer" && osuPath.length === 0) {
                g.setNotify({
                    message: __(I18nStrings.MAIN_BPKS_DL_OSU_PATH_REQUIRED),
                    severity: "warning",
                });
                return;
            }
            if (detectionScope !== "stable") {
                if (lazerPath.length === 0) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_BPKS_DL_LAZER_PATH_REQUIRED),
                        severity: "warning",
                    });
                    return;
                }
                if (!getUseLazerModeExperiment()) {
                    g.setNotify({
                        message: __(I18nStrings.MAIN_BPKS_DL_LAZER_NOT_ENABLED),
                        severity: "warning",
                    });
                    return;
                }
            }
        }

        handleCloseDialog();

        const clientId = g.cacheVal.str_client_id ?? "";
        const clientSecret = g.cacheVal.str_client_secret ?? "";

        try {
            await window.olsCore.initAC(clientId, clientSecret);

            let selectedTypes = new Set<string>(types as string[]);
            if (types.includes("all")) {
                const typeOptions = getTypeOptions();
                selectedTypes = new Set(typeOptions.map((v) => v.key).filter((v) => v !== "all"));
            }

            let allPacks: BeatmapPack[] = [];
            const allPackInfos: RespBeatmapPack[] = [];

            let _index = 0;
            const aborter = new AbortController();
            for (const type of selectedTypes) {
                if (aborter.signal.aborted) break;

                g.setLoading(true, __(I18nStrings.MAIN_BPKS_DL_FETCHING, { type }), aborter);

                let hasNext = true;
                let cursor_string: string | undefined;
                while (hasNext) {
                    if (aborter.signal.aborted) break;

                    const response = await window.olsCore.fecthBeatmapPacks(type as any, cursor_string);

                    if ("error" in response) {
                        throw new Error(response.error);
                    }

                    if (response.beatmap_packs) {
                        let filteredPacks = filterPacksByDate(response.beatmap_packs, dateRange);
                        if (gameModes && !gameModes.includes("all")) {
                            filteredPacks = filteredPacks.filter(
                                (pack) =>
                                    pack.ruleset_id === null ||
                                    gameModes.includes(pack.ruleset_id) ||
                                    gameModes.includes(String(pack.ruleset_id)),
                            );
                        }
                        if (filteredPacks.length === 0) {
                            hasNext = false;
                            break;
                        }
                        if (downloadMode === "diff") {
                            // fetch pack info
                            for (const pack of filteredPacks) {
                                if (aborter.signal.aborted) break;

                                const info = await window.olsCore.getBeatmapPack(pack.tag);
                                if ("error" in info) {
                                    throw new Error(info.error);
                                }
                                allPackInfos.push(info);
                                if (info.cached !== true) {
                                    await sleep(getApiPreDelayMs(), aborter.signal);
                                }
                            }
                        }
                        allPacks = allPacks.concat(filteredPacks);
                    }

                    if (response.cursor_string) {
                        cursor_string = response.cursor_string;
                    } else {
                        hasNext = false;
                    }
                    await sleep(getApiPreDelayMs(), aborter.signal);
                }

                _index++;
                await sleep(getApiPreDelayMs(), aborter.signal);
            }

            if (!aborter.signal.aborted) {
                setFetchedPacks(allPacks);

                // Beatmap status only exists in the pack detail, so the filter applies to the fetched set list (diff mode).
                const filterStatus = downloadMode === "diff" && statusFilterActive;
                const filterByMode = gameModes && !gameModes.includes("all") && getPackRulesetByNmExperiment();
                let processedPackInfos = allPackInfos;
                if (filterStatus || filterByMode) {
                    const selectedModeNames = filterByMode
                        ? new Set(gameModes.map((m: any) => MODE_NAME_MAP[String(m)]).filter(Boolean))
                        : null;
                    const nullRulesetTags = filterByMode
                        ? new Set(allPacks.filter((p) => p.ruleset_id === null).map((p) => p.tag))
                        : null;
                    processedPackInfos = allPackInfos.map((info) => {
                        const applyMode = nullRulesetTags?.has(info.tag) ?? false;
                        if (!filterStatus && !applyMode) return info;
                        return {
                            ...info,
                            beatmapsets: info.beatmapsets.filter((bs) => {
                                if (filterStatus && !statusFilter.includes(bs.status)) return false;
                                if (!applyMode || !selectedModeNames) return true;
                                const rulesets = bs.nominations_summary?.eligible_main_rulesets ?? [];
                                return rulesets.length === 0 || rulesets.some((r: string) => selectedModeNames.has(r));
                            }),
                        };
                    });
                }

                setFetchedPackInfos(processedPackInfos);
                setExcludedPackTags(new Set());

                if (downloadMode === "diff") {
                    g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                    const allMapIds = [...new Set(processedPackInfos.flatMap((v) => v.beatmapsets.map((m) => m.id)))];
                    const checkStable = detectionScope !== "lazer";
                    const checkLazer = detectionScope !== "stable";
                    const stableSetIds = checkStable
                        ? new Set((await OsuData.getBeatmapIndex()).map((v) => v.beatmapSetId))
                        : new Set<number>();
                    const lazerSetIds = checkLazer
                        ? await OsuData.queryLazerBeatmapSetIds(allMapIds)
                        : new Set<number>();
                    const presentIds = new Set<number>();
                    const labels = new Map<number, "stable" | "lazer" | "common">();
                    for (const id of allMapIds) {
                        const inStable = stableSetIds.has(id);
                        const inLazer = lazerSetIds.has(id);
                        const present =
                            detectionScope === "all"
                                ? inStable && inLazer
                                : detectionScope === "stable"
                                  ? inStable
                                  : inLazer;
                        if (present) {
                            presentIds.add(id);
                            continue;
                        }
                        if (detectionScope === "all") {
                            labels.set(id, !inStable && !inLazer ? "common" : !inStable ? "stable" : "lazer");
                        } else if (detectionScope === "stable") {
                            labels.set(id, "stable");
                        } else {
                            labels.set(id, "lazer");
                        }
                    }
                    setExcludedPackMapIds(presentIds);
                    setMissingSourceLabels(labels);
                    g.setLoading(false);
                }
            }
        } catch (error: any) {
            log.error("Error fetching beatmap packs:", error);
        } finally {
            g.setLoading(false);
        }
    };

    const handlePackSelection = (tag: string, selected: boolean) => {
        setExcludedPackTags((prev) => {
            const newSet = new Set(prev);
            if (!selected) {
                newSet.add(tag);
            } else {
                newSet.delete(tag);
            }
            return newSet;
        });
    };

    const handleToggleAllPacks = (selected: boolean) => {
        if (!selected) {
            setExcludedPackTags(new Set(fetchedPacks.map((pack) => pack.tag)));
        } else {
            setExcludedPackTags(new Set());
        }
    };

    const handlePackMapSelection = (mapId: number, selected: boolean) => {
        setExcludedPackMapIds((prev) => {
            const newSet = new Set(prev);
            if (!selected) {
                newSet.add(mapId);
            } else {
                newSet.delete(mapId);
            }
            return newSet;
        });
    };

    const handleToggleAllPackMaps = (selected: boolean) => {
        if (!selected) {
            setExcludedPackMapIds(new Set(fetchedPackInfos.flatMap((pack) => pack.beatmapsets.map((m) => m.id))));
        } else {
            setExcludedPackMapIds(new Set());
        }
    };

    const handleStartDownload = () => {
        const savedMode = (g.config?.[ConfigKey.BPKS_DL_MODE] ?? "full") as "full" | "diff";
        const savedScope = (g.config?.[ConfigKey.BPKS_DL_DETECTION_SCOPE] ?? "all") as DetectionScope;

        if (savedMode === "diff") {
            const maps = fetchedPackInfos.flatMap((pack) => pack.beatmapsets);
            const mapIds = new Set(maps.map((v) => v.id));
            const flitedMapId = [...mapIds].filter((id) => !excludedPackMapIds.has(id));
            if (flitedMapId.length === 0) {
                g.setNotify({
                    message: __(I18nStrings.MAIN_BPKS_SELECT_AT_LEAST_ONE),
                    severity: "warning",
                });
                return;
            }
            const dlFetcherDiff = async () =>
                flitedMapId.map((map_id) => getApiDownloadLink().replace(":id", map_id.toString()));
            const builtinItems: BuiltinItem[] = flitedMapId.map((id) => ({
                source: "osu-official" as const,
                beatmapsetId: id,
                missingSource: missingSourceLabels.get(id),
            }));
            const downloadOptions = [
                GetDLOptionByRows(dlFetcherDiff),
                GetDLOptionByFDM(dlFetcherDiff),
                GetDLOptionByBuiltin(builtinItems),
            ];
            if (savedScope !== "lazer") {
                downloadOptions.push(GetDLOptionByDirect(flitedMapId));
            }
            g.setDialog(true, {
                title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
                content: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_DESC),
                actions: downloadOptions,
            });
            return;
        }

        const selectedPacks = fetchedPacks.filter((pack) => !excludedPackTags.has(pack.tag));
        if (selectedPacks.length === 0) {
            g.setNotify({
                message: __(I18nStrings.MAIN_BPKS_SELECT_AT_LEAST_ONE),
                severity: "warning",
            });
            return;
        }
        const dlFetcher = async () => selectedPacks.map((pack) => pack.url);
        const packUrls: BuiltinItem[] = selectedPacks.map((p) => ({
            source: "pack" as const,
            url: p.url,
            filename: `${p.tag}.zip`,
        }));
        const downloadOptions = [
            GetDLOptionByRows(dlFetcher),
            GetDLOptionByFDM(dlFetcher),
            GetDLOptionByBuiltin(packUrls),
        ];
        g.setDialog(true, {
            title: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_TITLE),
            content: __(I18nStrings.MAIN_BPKS_DL_OPTIONS_DESC),
            actions: downloadOptions,
        });
    };

    const handleResetSelection = () => {
        setFetchedPacks([]);
        setFetchedPackInfos([]);
        setExcludedPackTags(new Set());
        setExcludedPackMapIds(new Set());
        setMissingSourceLabels(new Map());
    };

    return (
        <Observer>
            {() => {
                const clientId = g.cacheVal.str_client_id ?? "";
                const clientSecret = g.cacheVal.str_client_secret ?? "";
                const savedMode = (g.config?.[ConfigKey.BPKS_DL_MODE] ?? "full") as "full" | "diff";

                let packRows = fetchedPacks.map((pack) => ({
                    tag: pack.tag,
                    name: pack.name,
                    author: pack.author,
                    ruleset_id: pack.ruleset_id,
                    date: new Date(pack.date).toLocaleDateString(),
                    is_selected: {
                        value: !excludedPackTags.has(pack.tag),
                        callback: () => handlePackSelection(pack.tag, excludedPackTags.has(pack.tag)),
                    },
                }));

                let allSelected = fetchedPacks.length > 0 && excludedPackTags.size === 0;
                let resSize = fetchedPacks.length;
                let tarSize = resSize - excludedPackTags.size;
                let extNameHead = {};
                const missingLabelMap = {
                    stable: I18nStrings.MAIN_DL_MISSING_STABLE,
                    lazer: I18nStrings.MAIN_DL_MISSING_LAZER,
                    common: I18nStrings.MAIN_DL_MISSING_COMMON,
                };

                if (savedMode === "diff") {
                    const maps = fetchedPackInfos.flatMap((pack) => pack.beatmapsets);
                    const mapIds = new Set(maps.map((v) => v.id));
                    resSize = mapIds.size;
                    tarSize = resSize - excludedPackMapIds.size;
                    allSelected = resSize > 0 && excludedPackMapIds.size === 0;

                    packRows = fetchedPackInfos.flatMap((pack) => {
                        return pack.beatmapsets.map((beatmapset) => {
                            const missingSource = missingSourceLabels.get(beatmapset.id);
                            return {
                                tag: pack.tag,
                                name: beatmapset.title,
                                author: pack.author,
                                ruleset_id: pack.ruleset_id,
                                date: new Date(beatmapset.last_updated).toLocaleDateString(),
                                is_selected: {
                                    value: !excludedPackMapIds.has(beatmapset.id),
                                    callback: () =>
                                        handlePackMapSelection(beatmapset.id, excludedPackMapIds.has(beatmapset.id)),
                                },
                                missing_source_label: missingSource ? __(missingLabelMap[missingSource]) : "",
                                "#link": `https://osu.ppy.sh/s/${beatmapset.id}`,
                                "#shell_link": `osu://s/${beatmapset.id}`,
                            };
                        });
                    });
                    extNameHead = {
                        link: "link",
                        shell_link: "shell_link",
                    };
                }

                const heads: IPropertyWithName[] = [
                    {
                        name: null,
                        type: "checkbox",
                        key: "is_selected",
                        checkbox_toggler: {
                            checked: allSelected,
                            callback: savedMode === "full" ? handleToggleAllPacks : handleToggleAllPackMaps,
                        },
                        append_keys: ["tag"],
                    },
                    { name: __(I18nStrings.MAIN_NAME), type: "string", key: "name", ...extNameHead },
                    { name: __(I18nStrings.MAIN_RULESET), type: "string", key: "ruleset_id" },
                    { name: __(I18nStrings.MAIN_AUTHOR), type: "string", key: "author" },
                    { name: __(I18nStrings.MAIN_DATE), type: "string", key: "date" },
                ];
                if (savedMode === "diff") {
                    heads.push({
                        name: __(I18nStrings.MAIN_BPKS_DL_MISSING_LABEL),
                        type: "string",
                        key: "missing_source_label",
                    });
                }

                return (
                    <Stack spacing={2}>
                        {fetchedPacks.length === 0 ? (
                            <Tooltip
                                title={
                                    clientId.length === 0 || clientSecret.length === 0
                                        ? __(I18nStrings.MAIN_BPKS_API_REQUIRED)
                                        : ""
                                }
                                arrow
                                placement="top"
                            >
                                <span>
                                    <Button
                                        variant="contained"
                                        onClick={handleOpenDialog}
                                        disabled={clientId.length === 0 || clientSecret.length === 0 || g.isLoading()}
                                        fullWidth
                                    >
                                        {__(I18nStrings.BTN_BPKS_READ)}
                                    </Button>
                                </span>
                            </Tooltip>
                        ) : (
                            <>
                                <Box sx={{ height: "60vh", width: "100%" }}>
                                    <DataViewer
                                        heads={heads}
                                        rows={packRows}
                                        rows_total={packRows.length}
                                        min_height="55vh"
                                    />
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Button onClick={handleResetSelection} variant="outlined" fullWidth>
                                        {__(I18nStrings.BTN_CANCEL)}
                                    </Button>
                                    <Button
                                        onClick={handleStartDownload}
                                        variant="contained"
                                        disabled={tarSize === 0}
                                        fullWidth
                                    >
                                        {__(I18nStrings.BTN_CONFIRM)} ({tarSize})
                                    </Button>
                                </Stack>
                            </>
                        )}
                    </Stack>
                );
            }}
        </Observer>
    );
};
