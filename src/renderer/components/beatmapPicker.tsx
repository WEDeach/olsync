import { keyframes } from "@emotion/react";
import {
    AccountBox,
    Balance,
    CloudDownload,
    ContentCopy,
    DeleteSweep,
    DriveFileRenameOutline,
    FilterList,
    FolderSpecial,
    History,
    KeyboardArrowDown,
    KeyboardArrowUp,
    Language,
    MusicNote,
    Star,
    SwapHoriz,
} from "@mui/icons-material";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Divider,
    Drawer,
    GlobalStyles,
    IconButton,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import ReactECharts from "echarts-for-react";
import { Observer, observer } from "mobx-react";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { LazerPreviewRow, LazerRollRequest } from "../../defines/lazer_picker";
import type { LazerBeatmapDetailRequest, LazerBeatmapQuerySpec } from "../../defines/lazer_structs";
import { LazerMod } from "../../defines/lazer_structs";
import { StableBeatmapDetail } from "../../defines/stable_structs";
import { IOsuCollection } from "../../defines/types";
import { apply_beatmap_filter, create_osu_beatmap_accessor } from "../../shared/utils/beatmapFilterUtils";
import { lazerBeatmapToOsuBeatmap, lazerLightweightToOsuBeatmap } from "../../shared/utils/osuConvert";
import {
    buildWeightedPool,
    checkWishlist,
    get_effective_sr,
    normalizeAdvancedSettings,
    pickRandomWeighted,
} from "../../shared/utils/pickerLogic";
import { type PickerSource, shouldRestorePickerSession } from "../../shared/utils/pickerSession";
import {
    getClassicScoreExperiment,
    getUseLazerModeExperiment,
    getYinMoChanceExperiment,
} from "../../utils/experiments";
import __ from "../../utils/i18n";
import { createLogger } from "../../utils/logger";
import {
    calcGrade,
    calculateAccuracy,
    convertStandardisedToClassic,
    GRADE_COLORS,
    OsuBeatmap,
    OsuData,
    OsuScore,
} from "../../utils/osu";
import { sanitizeProfileId } from "../../utils/profileId";
import { readAllWithOffset, yieldToMain } from "../../utils/reader";
import { formatDateTime, formatTimeAgo, useNowAdaptive } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { AudioPlayer } from "./audioPlayer";
import { FilterType, SubFilterType, TFilterSetting, TSubFilterSetting } from "./beatmapFilter";
import { BeatmapPickerAdvancedPanel } from "./beatmapPickerAdvancedPanel";
import { BeatmapPickerFilterPanel } from "./beatmapPickerFilterPanel";
import type {
    IPickerAdvancedSettings,
    IPickerHistory,
    IPickerProfile,
    IWeightBeatmapCondition,
} from "./beatmapPickerTypes";
import { BeatmapDataField, PickerTargetType } from "./beatmapPickerTypes";
import { BaseDialog } from "./common/BaseDialog";
import { guessMimeTypeFromPath, loadBeatmapBackground } from "./common/beatmapMedia";
import { CurrentlyPlayingBeatmap } from "./currentlyPlayingBeatmap";
import { DataViewer } from "./dataViewer";
import { InfoDialog } from "./infoDialog";
import { IPropertyWithName } from "./table";

type IBeatmapData = OsuBeatmap;

const log = createLogger("BeatmapPicker");

const rollBreathe = keyframes`
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
`;

const rollPop = keyframes`
    0% { transform: scale(1); }
    20% { transform: scale(0.88); }
    50% { transform: scale(1.14); }
    70% { transform: scale(0.95); }
    100% { transform: scale(1); }
`;

const shineSweep = keyframes`
    0% { left: -60%; }
    100% { left: 160%; }
`;

const catProwl = keyframes`
    0% { transform: translateX(-60%) scaleX(1); }
    20% { transform: translateX(-60%) scaleX(1) translateY(-8%); }
    25% { transform: translateX(-60%) scaleX(1) translateY(0); }
    45% { transform: translateX(60%) scaleX(1) translateY(-8%); }
    50% { transform: translateX(60%) scaleX(1) translateY(0); }
    50.01% { transform: translateX(60%) scaleX(-1); }
    70% { transform: translateX(60%) scaleX(-1) translateY(-8%); }
    75% { transform: translateX(60%) scaleX(-1) translateY(0); }
    95% { transform: translateX(-60%) scaleX(-1) translateY(-8%); }
    100% { transform: translateX(-60%) scaleX(-1) translateY(0); }
`;

interface IBeatmapPickerViewProps {}

const HISTORY_MAX = 200;

const DEFAULT_MIN_VH = 72;
const DEFAULT_MAX_VH = 100;
const SETTLE_MS = 450;

const useScrollAdjustHeight = (minVh = DEFAULT_MIN_VH, maxVh = DEFAULT_MAX_VH) => {
    const [heightVh, setHeightVh] = useState(minVh);
    const contentRef = useRef<HTMLDivElement>(null);
    const settlingRef = useRef(false);

    const setHeight = useCallback((h: number) => {
        setHeightVh((prev) => (prev === h ? prev : h));
    }, []);

    const toggleHeight = useCallback(() => {
        setHeightVh((prev) => (prev === minVh ? maxVh : minVh));
    }, [minVh, maxVh]);

    const reset = useCallback(() => {
        setHeightVh(minVh);
        settlingRef.current = false;
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [minVh]);

    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            if (settlingRef.current) return;
            if (e.deltaY > 0 && heightVh !== maxVh) {
                settlingRef.current = true;
                setHeightVh(maxVh);
                setTimeout(() => {
                    settlingRef.current = false;
                }, SETTLE_MS);
            } else if (e.deltaY < 0 && heightVh !== minVh) {
                const el = contentRef.current;
                if (el && el.scrollTop > 0) return;
                settlingRef.current = true;
                setHeightVh(minVh);
                setTimeout(() => {
                    settlingRef.current = false;
                }, SETTLE_MS);
            }
        },
        [heightVh, minVh, maxVh],
    );

    return { heightVh, contentRef, setHeight, toggleHeight, reset, handleWheel };
};

interface IScrollAdjustDrawerProps {
    open: boolean;
    onClose: () => void;
    minVh?: number;
    maxVh?: number;
    keepMounted?: boolean;
    children: (ctx: ReturnType<typeof useScrollAdjustHeight>) => React.ReactNode;
}

const ScrollAdjustDrawer: React.FC<IScrollAdjustDrawerProps> = ({
    open,
    onClose,
    minVh = DEFAULT_MIN_VH,
    maxVh = DEFAULT_MAX_VH,
    keepMounted,
    children,
}) => {
    const ctx = useScrollAdjustHeight(minVh, maxVh);
    const resetRef = useRef(ctx.reset);
    resetRef.current = ctx.reset;

    useEffect(() => {
        if (open) resetRef.current();
    }, [open]);

    return (
        <Drawer
            anchor="bottom"
            open={open}
            onClose={onClose}
            keepMounted={keepMounted}
            sx={{
                "& .MuiDrawer-paper": {
                    display: "flex",
                    flexDirection: "column",
                },
            }}
        >
            {(open || keepMounted) && (
                <Box
                    onWheel={ctx.handleWheel}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        height: `${ctx.heightVh}vh`,
                        overflow: "hidden",
                        transition: "height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                >
                    {children(ctx)}
                </Box>
            )}
        </Drawer>
    );
};

const RANKED_STATUS_LABELS: Record<number, string> = {
    0: "Unknown",
    1: "Not Submitted",
    2: "Pending / WIP / Graveyard",
    3: "Unused",
    4: "Ranked",
    5: "Approved",
    6: "Qualified",
    7: "Loved",
};

const MODE_LABELS: Record<number, string> = {
    0: "osu!",
    1: "osu!taiko",
    2: "osu!catch",
    3: "osu!mania",
};

const formatDrain = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
};

// Stable stores "never played" as epoch 0 (and occasionally an invalid date), which
// would otherwise render as a ~55 year old relative timestamp.
const toPlayedDate = (value: Date | null | undefined): Date | null => {
    if (!value) return null;
    const time = value.getTime();
    return Number.isFinite(time) && time > 0 ? value : null;
};

const extractHashes = (maps: any[]): Set<string> =>
    new Set(maps.map((m: any) => (typeof m === "string" ? m : m.checksum)));

const MOD_BITS: [number, string][] = [
    [1, "NF"],
    [2, "EZ"],
    [4, "TD"],
    [8, "HD"],
    [16, "HR"],
    [64, "DT"],
    [512, "NC"],
    [256, "HT"],
    [128, "RX"],
    [32, "SD"],
    [16384, "PF"],
    [1024, "FL"],
    [4096, "SO"],
    [8192, "AP"],
    [2048, "AT"],
    [8388608, "TP"],
    [4194304, "CN"],
    [2097152, "RD"],
    [1048576, "FI"],
    [536870912, "SV2"],
    [1073741824, "MR"],
    [32768, "4K"],
    [65536, "5K"],
    [131072, "6K"],
    [262144, "7K"],
    [524288, "8K"],
    [16777216, "9K"],
    [33554432, "DS"],
    [67108864, "1K"],
    [134217728, "3K"],
    [268435456, "2K"],
];
export interface ScoreRecordRow {
    md5Hash: string;
    date: Date;
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    totalScore: number;
    maxCombo: number;
    mods: number;
    ruleset: number;
    beatmapLabel?: string;
    _accuracy?: number;
    _pp?: number;
    _lazer?: boolean;
    _lazerMods?: LazerMod[];
    _grade?: string;
    _legacyTotalScore?: number;
    _maxObjectCount?: number;
}

export function makeScorePPKey(s: {
    md5Hash: string;
    totalScore: number;
    date: Date;
    maxCombo: number;
    _accuracy?: number;
}): string {
    return `${s.md5Hash}-${s.totalScore}-${s.date.getTime()}-${s.maxCombo}-${s._accuracy ?? ""}`;
}

function getDisplayedTotalScore(row: ScoreRecordRow, classicScore: boolean): number {
    if (classicScore && row._lazer) {
        return (
            row._legacyTotalScore ??
            convertStandardisedToClassic(
                row.ruleset,
                row.totalScore,
                row._maxObjectCount ?? row.count300 + row.count100 + row.count50 + row.countMiss,
            )
        );
    }
    return row.totalScore;
}

interface ScoreRecordTableProps {
    scores: ScoreRecordRow[];
    ppMap: Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>;
    sortBy?: "score" | "date";
    showBeatmapLabel?: boolean;
    onRowClick?: (s: ScoreRecordRow) => void;
    onRowHover?: (key: string | null) => void;
    onVisibleKeysChange?: (keys: string[]) => void;
    highlightKey?: string | null;
    nowEnabled?: boolean;
}

export const ScoreRecordTable = observer(
    ({
        scores,
        ppMap,
        sortBy = "score",
        showBeatmapLabel = false,
        onRowClick,
        onRowHover,
        onVisibleKeysChange,
        highlightKey,
        nowEnabled = true,
    }: ScoreRecordTableProps) => {
        const latestScoreTime = scores.length > 0 ? Math.max(...scores.map((s) => s.date.getTime())) : null;
        useNowAdaptive(nowEnabled ? latestScoreTime : null);
        const classicScore = getClassicScoreExperiment();
        const lazerMode = getUseLazerModeExperiment();

        const sorted = React.useMemo(
            () =>
                [...scores].sort((a, b) =>
                    sortBy === "date"
                        ? b.date.getTime() - a.date.getTime()
                        : getDisplayedTotalScore(b, classicScore) - getDisplayedTotalScore(a, classicScore),
                ),
            [scores, sortBy, classicScore],
        );

        const rows = React.useMemo(
            () =>
                sorted.map((s) => {
                    const acc = calculateAccuracy(s, "percent");
                    return {
                        ...s,
                        grade: calcGrade(s),
                        accuracy: acc,
                        ppKey: makeScorePPKey(s),
                        displayScore: getDisplayedTotalScore(s, classicScore),
                    };
                }),
            [sorted, classicScore],
        );

        const heads = React.useMemo<IPropertyWithName[]>(
            () => [
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_GRADE),
                    type: "string",
                    key: "grade",
                    render: (row: any) => (
                        <Box sx={{ color: GRADE_COLORS[row.grade] ?? "inherit", fontWeight: "bold" }}>{row.grade}</Box>
                    ),
                },
                ...(showBeatmapLabel
                    ? [
                          {
                              name: __(I18nStrings.MAIN_PICKER_TABLE_MAP),
                              type: "string" as const,
                              key: "beatmapLabel",
                              render: (row: any) => (
                                  <Box
                                      sx={{
                                          maxWidth: 280,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                      }}
                                  >
                                      {row.beatmapLabel ?? row.md5Hash}
                                  </Box>
                              ),
                          },
                      ]
                    : []),
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_SCORE),
                    type: "string",
                    key: "displayScore",
                    render: (row: any) => row.displayScore.toLocaleString(),
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_300),
                    type: "string",
                    key: "count300",
                    render: (row: any) => <Box sx={{ color: "#3498db" }}>{row.count300}</Box>,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_100),
                    type: "string",
                    key: "count100",
                    render: (row: any) => <Box sx={{ color: "#2ecc71" }}>{row.count100}</Box>,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_50),
                    type: "string",
                    key: "count50",
                    render: (row: any) => <Box sx={{ color: "#f39c12" }}>{row.count50}</Box>,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_MISS),
                    type: "string",
                    key: "countMiss",
                    render: (row: any) => <Box sx={{ color: "#e74c3c" }}>{row.countMiss}</Box>,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_MAX_COMBO),
                    type: "string",
                    key: "maxCombo",
                    render: (row: any) => `${row.maxCombo}x`,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_ACCURACY),
                    type: "string",
                    key: "accuracy",
                    render: (row: any) => `${row.accuracy.toFixed(2)}%`,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_MODE),
                    type: "string",
                    key: "ruleset",
                    render: (row: any) => RULESET_LABELS[row.ruleset] ?? `M${row.ruleset}`,
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_MODS),
                    type: "string",
                    key: "mods",
                    render: (row: any) => (
                        <ModChips
                            mods={row.mods}
                            lazerMods={row._lazerMods}
                            lazerMode={lazerMode}
                            isLazer={row._lazer}
                        />
                    ),
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_PP),
                    type: "string",
                    key: "pp",
                    render: (row: any) => {
                        const ppResult = ppMap.get(row.ppKey);
                        if (ppResult === undefined) return "...";
                        if (ppResult.pp == null) return "-";
                        if (ppResult.aim !== undefined) {
                            return (
                                <Tooltip
                                    title={`Aim: ${ppResult.aim.toFixed(0)}  Speed: ${ppResult.speed?.toFixed(0)}  Acc: ${ppResult.acc?.toFixed(0)}`}
                                    arrow
                                >
                                    <span>{ppResult.pp.toFixed(0)}pp</span>
                                </Tooltip>
                            );
                        }
                        return `${ppResult.pp.toFixed(0)}pp`;
                    },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_TIME),
                    type: "string",
                    key: "date",
                    render: (row: any) => (
                        <Box sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                            <Tooltip title={row.date ? formatDateTime(row.date.getTime()) : null} arrow>
                                <span>{row.date ? formatTimeAgo(row.date.getTime()) : "-"}</span>
                            </Tooltip>
                        </Box>
                    ),
                },
            ],
            [ppMap, showBeatmapLabel, classicScore, lazerMode],
        );

        return (
            <React.Fragment>
                <GlobalStyles
                    styles={{
                        ".ols-lazer-row td": {
                            color: "info.main",
                        },
                        ".ols-stable-row td": {
                            color: "text.primary",
                        },
                    }}
                />
                <DataViewer
                    heads={heads}
                    rows={rows}
                    rows_total={rows.length}
                    maxHeight={500}
                    rowHeight={36}
                    size="small"
                    getRowKey={(row) => row.ppKey}
                    getRowClassName={(row) =>
                        lazerMode ? (row._lazer ? "ols-lazer-row" : "ols-stable-row") : undefined
                    }
                    onRowHover={onRowHover}
                    highlightKey={highlightKey}
                    onVisibleKeysChange={onVisibleKeysChange}
                    onRowClick={(row) => onRowClick?.(row)}
                />
            </React.Fragment>
        );
    },
);

interface ScoreOverviewChartProps {
    scores: ScoreRecordRow[];
    onHoverIndex?: (index: number | null) => void;
    highlightIndex?: number | null;
}

const ScoreOverviewChart: React.FC<ScoreOverviewChartProps> = ({ scores, onHoverIndex, highlightIndex }) => {
    const sorted = React.useMemo(() => [...scores].sort((a, b) => a.date.getTime() - b.date.getTime()), [scores]);

    const option = React.useMemo(() => {
        const labels = sorted.map((s) => formatTimeAgo(s.date.getTime()));
        const data300 = sorted.map((s) => s.count300);
        const data100 = sorted.map((s) => s.count100);
        const data50 = sorted.map((s) => s.count50);
        const dataMiss = sorted.map((s) => s.countMiss);
        const accData = sorted.map((s) => +calculateAccuracy(s, "percent").toFixed(2));
        const comboData = sorted.map((s) => s.maxCombo);
        const maxComboVal = Math.max(...comboData, 1);

        const accMin = Math.min(...accData);
        const accMax = Math.max(...accData);
        const accPad = Math.max((accMax - accMin) * 0.3, 0.5);
        const accYMin = Math.max(0, Math.floor((accMin - accPad) * 10) / 10);
        const accYMax = Math.min(100, Math.ceil((accMax + accPad) * 10) / 10);

        const ACC_COLOR = "#ff6b6b";

        return {
            tooltip: {
                trigger: "axis",
                axisPointer: { type: "cross" },
                formatter: (params: any[]) => {
                    const idx = params[0]?.dataIndex ?? 0;
                    const s = sorted[idx];
                    const acc = calculateAccuracy(s, "percent").toFixed(2);
                    const lines = [
                        `<b>${labels[idx]}</b>`,
                        `<span style="color:#3498db">▪ 300: ${s.count300}</span>`,
                        `<span style="color:#2ecc71">▪ 100: ${s.count100}</span>`,
                        `<span style="color:#f39c12">▪ 50:  ${s.count50}</span>`,
                        `<span style="color:#e74c3c">▪ Miss: ${s.countMiss}</span>`,
                        `<span style="color:#9b59b6">▪ ${__(I18nStrings.MAIN_PICKER_TOOLTIP_MAX_COMBO)}: ${s.maxCombo}x</span>`,
                        `<span style="color:${ACC_COLOR}">▪ ${__(I18nStrings.MAIN_PICKER_TOOLTIP_ACCURACY)}: ${acc}%</span>`,
                    ];
                    return lines.join("<br/>");
                },
            },
            legend: {
                data: [
                    "300",
                    "100",
                    "50",
                    "Miss",
                    __(I18nStrings.MAIN_PICKER_CHART_MAX_COMBO),
                    __(I18nStrings.MAIN_PICKER_CHART_ACCURACY),
                ],
                bottom: 0,
                textStyle: { fontSize: 11 },
            },
            grid: { top: 16, left: 52, right: 52, bottom: 40 },
            xAxis: {
                type: "category",
                data: labels,
                axisLabel: { fontSize: 10, rotate: sorted.length > 6 ? 30 : 0 },
            },
            yAxis: [
                {
                    type: "value",
                    name: __(I18nStrings.MAIN_PICKER_CHART_HIT_COUNT),
                    nameTextStyle: { fontSize: 10 },
                    axisLabel: { fontSize: 10 },
                    splitLine: { lineStyle: { opacity: 0.3 } },
                    axisPointer: { label: { formatter: (v: any) => Math.round(v.value).toString() } },
                },
                {
                    type: "value",
                    name: "%",
                    nameTextStyle: { fontSize: 10, color: ACC_COLOR },
                    axisLabel: { fontSize: 10, color: ACC_COLOR, formatter: (v: number) => `${v}%` },
                    min: accYMin,
                    max: accYMax,
                    splitLine: { show: false },
                    axisPointer: { label: { formatter: (v: any) => `${v.value.toFixed(2)}%` } },
                },
                {
                    type: "value",
                    show: false,
                    min: 0,
                    max: maxComboVal * 1.1,
                    axisPointer: { show: false, label: { show: false } },
                },
            ],
            series: [
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_300),
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data300,
                    itemStyle: { color: "#3498db" },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_100),
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data100,
                    itemStyle: { color: "#2ecc71" },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_50),
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data50,
                    itemStyle: { color: "#f39c12" },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_TABLE_MISS),
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: dataMiss,
                    itemStyle: { color: "#e74c3c" },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_CHART_MAX_COMBO),
                    type: "line",
                    yAxisIndex: 2,
                    data: comboData,
                    symbol: "circle",
                    symbolSize: 5,
                    lineStyle: { color: "#9b59b6", type: "dashed" },
                    itemStyle: { color: "#9b59b6" },
                },
                {
                    name: __(I18nStrings.MAIN_PICKER_CHART_ACCURACY),
                    type: "line",
                    yAxisIndex: 1,
                    data: accData,
                    symbol: "circle",
                    symbolSize: 5,
                    lineStyle: { color: ACC_COLOR },
                    itemStyle: { color: ACC_COLOR },
                },
            ],
        };
    }, [sorted]);

    const onHoverIndexRef = React.useRef(onHoverIndex);
    React.useEffect(() => {
        onHoverIndexRef.current = onHoverIndex;
    }, [onHoverIndex]);

    const sortedRef = React.useRef(sorted);
    React.useEffect(() => {
        sortedRef.current = sorted;
    }, [sorted]);

    const chartRef = React.useRef<ReactECharts | null>(null);
    const echartsInstRef = React.useRef<any>(null);
    const isExternalHighlight = React.useRef(false);

    const lastEmittedIndex = React.useRef<number | null>(null);

    const onChartReady = React.useCallback((inst: any) => {
        echartsInstRef.current = inst;
        const zr = inst.getZr();
        const onMove = (e: any) => {
            if (isExternalHighlight.current) return;
            const pt = [e.offsetX, e.offsetY];
            const raw = inst.convertFromPixel({ seriesIndex: 0 }, pt);
            const dataIndex = Array.isArray(raw) ? Math.round(raw[0] as number) : Math.round(raw as number);
            if (Number.isFinite(dataIndex) && dataIndex >= 0 && dataIndex < sortedRef.current.length) {
                if (lastEmittedIndex.current === dataIndex) return;
                lastEmittedIndex.current = dataIndex;
                onHoverIndexRef.current?.(dataIndex);
            } else {
                if (lastEmittedIndex.current === null) return;
                lastEmittedIndex.current = null;
                onHoverIndexRef.current?.(null);
            }
        };
        const onOut = () => {
            if (isExternalHighlight.current) return;
            if (lastEmittedIndex.current === null) return;
            lastEmittedIndex.current = null;
            onHoverIndexRef.current?.(null);
        };
        zr.on("mousemove", onMove);
        zr.on("mouseout", onOut);
    }, []);

    React.useEffect(() => {
        const inst = echartsInstRef.current;
        if (!inst) return;
        if (highlightIndex !== null && highlightIndex !== undefined) {
            isExternalHighlight.current = true;
            inst.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: highlightIndex });
            setTimeout(() => {
                isExternalHighlight.current = false;
            }, 50);
        } else {
            isExternalHighlight.current = false;
            inst.dispatchAction({ type: "hideTip" });
        }
    }, [highlightIndex]);

    return <ReactECharts ref={chartRef} option={option} style={{ height: 220 }} onChartReady={onChartReady} />;
};
interface ScoreSectionProps {
    scores: ScoreRecordRow[];
    ppMap: Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>;
    nowEnabled?: boolean;
}
const ScoreSection: React.FC<ScoreSectionProps> = ({ scores, ppMap, nowEnabled = true }) => {
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);
    const byDate = React.useMemo(() => [...scores].sort((a, b) => a.date.getTime() - b.date.getTime()), [scores]);
    const chartHighlightIndex = React.useMemo(() => {
        if (hoveredKey === null) return null;
        const idx = byDate.findIndex((s) => makeScorePPKey(s) === hoveredKey);
        return idx === -1 ? null : idx;
    }, [hoveredKey, byDate]);
    return (
        <>
            <ScoreOverviewChart
                scores={scores}
                highlightIndex={chartHighlightIndex}
                onHoverIndex={(idx) => {
                    if (idx === null) {
                        setHoveredKey(null);
                        return;
                    }
                    const s = byDate[idx];
                    if (s) setHoveredKey(makeScorePPKey(s));
                }}
            />
            <ScoreRecordTable
                scores={scores}
                ppMap={ppMap}
                sortBy="score"
                highlightKey={hoveredKey}
                onRowHover={setHoveredKey}
                nowEnabled={nowEnabled}
            />
        </>
    );
};

const RULESET_LABELS: Record<number, string> = { 0: "STD", 1: "Taiko", 2: "Catch", 3: "Mania" };

interface ModEntry {
    acronym: string;
    settings?: Record<string, unknown>;
}

function getModEntries(mods: number, lazerMods?: LazerMod[]): ModEntry[] {
    if (lazerMods && lazerMods.length > 0) {
        return lazerMods.map((m) => ({ acronym: m.acronym, settings: m.settings }));
    }
    if (mods === 0) return [];
    return MOD_BITS.filter(([bit]) => (mods & bit) !== 0).map(([, name]) => ({ acronym: name }));
}

function formatModSettings(settings?: Record<string, unknown>): string {
    if (!settings || Object.keys(settings).length === 0) return "";
    return Object.entries(settings)
        .map(([key, value]) => `${key}: ${typeof value === "number" ? value : JSON.stringify(value)}`)
        .join("\n");
}

const VISIBLE_MOD_COUNT = 3;

const ModChip: React.FC<{ acronym: string; settings?: Record<string, unknown> }> = ({ acronym, settings }) => {
    const settingsText = formatModSettings(settings);
    const chip = <Chip label={acronym} size="small" color={settingsText ? "primary" : "default"} />;
    if (!settingsText) return chip;
    return (
        <Tooltip title={<Box sx={{ whiteSpace: "pre-line" }}>{settingsText}</Box>} arrow>
            {chip}
        </Tooltip>
    );
};

const ExtraModsChip: React.FC<{ entries: ModEntry[] }> = ({ entries }) => {
    const names = entries.map((entry) => entry.acronym).join("\n");
    const chip = <Chip label={`+${entries.length}`} size="small" color="default" />;
    return (
        <Tooltip title={<Box sx={{ whiteSpace: "pre-line" }}>{names}</Box>} arrow>
            {chip}
        </Tooltip>
    );
};

const ModChips: React.FC<{ mods: number; lazerMods?: LazerMod[]; lazerMode: boolean; isLazer?: boolean }> = ({
    mods,
    lazerMods,
    lazerMode,
    isLazer,
}) => {
    const entries = getModEntries(mods, lazerMods);
    if (lazerMode && !isLazer) entries.push({ acronym: "CL" });
    if (entries.length === 0) return "-";
    if (!lazerMode) return entries.map((entry) => entry.acronym).join(",");
    const visible = entries.slice(0, VISIBLE_MOD_COUNT);
    const extra = entries.slice(VISIBLE_MOD_COUNT);
    return (
        <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            sx={{
                flexWrap: "nowrap",
                alignItems: "center",
            }}
        >
            {visible.map((entry) => (
                <ModChip key={entry.acronym} acronym={entry.acronym} settings={entry.settings} />
            ))}
            {extra.length > 0 && <ExtraModsChip entries={extra} />}
        </Stack>
    );
};

export interface IBeatmapResultDrawerProps {
    map: IBeatmapData | null;
    displaySR: number;
    osuPath: string;
    collections: IOsuCollection[];
    scoresByHash: Map<string, OsuScore[]>;
    onScoresNeeded?: (map: IBeatmapData) => void | Promise<void>;
    onClose: () => void;
}

export const BeatmapResultDrawer: React.FC<IBeatmapResultDrawerProps> = ({
    map,
    displaySR,
    osuPath,
    collections,
    scoresByHash,
    onScoresNeeded,
    onClose,
}) => {
    const [bgUrl, setBgUrl] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioVolume, setAudioVolume] = useState<number>(() => {
        const raw = Number(g.config?.[ConfigKey.UI_AUDIO_VOLUME] ?? 1);
        return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    });
    const [audioMuted, setAudioMuted] = useState<boolean>(() => Boolean(g.config?.[ConfigKey.UI_AUDIO_MUTED] ?? false));
    const [copyDone, setCopyDone] = useState(false);
    const [showScores, setShowScores] = useState(false);
    const [ppInfo, setPpInfo] = useState<
        { maxPP: number; stars: number; maxAim?: number; maxSpeed?: number; maxAcc?: number } | null | undefined
    >(undefined);
    const [scorePPs, setScorePPs] = useState<Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>>(
        new Map(),
    );
    const [onlineTags, setOnlineTags] = useState<string[]>([]);

    const mapScores: OsuScore[] = React.useMemo(
        () => (map ? (scoresByHash.get(map.md5Hash) ?? []) : []),
        [map?.md5Hash, scoresByHash],
    );
    const mapScoresKey = React.useMemo(
        () =>
            mapScores
                .map((s) =>
                    makeScorePPKey({
                        md5Hash: map?.md5Hash ?? "",
                        totalScore: s.totalScore,
                        date: s.date,
                        maxCombo: s.maxCombo,
                        _accuracy: s._accuracy,
                    }),
                )
                .join("|"),
        [mapScores, map?.md5Hash],
    );
    const scoreRows: ScoreRecordRow[] = React.useMemo(
        () => mapScores.map((s) => ({ ...s, md5Hash: map?.md5Hash ?? s.md5Hash })),
        [mapScores, map?.md5Hash],
    );
    const latestScoreDate =
        mapScores.length > 0 ? mapScores.reduce((best, s) => (s.date > best ? s.date : best), mapScores[0].date) : null;
    const effectiveUnplayed = map ? (mapScores.length > 0 ? false : map.unplayed) : false;
    const playedScoreDate = toPlayedDate(latestScoreDate);
    const mapLastPlayedTime = toPlayedDate(map?.lastPlayedTime);
    const effectiveLastPlayedTime = map
        ? playedScoreDate && (!mapLastPlayedTime || playedScoreDate > mapLastPlayedTime)
            ? playedScoreDate
            : mapLastPlayedTime
        : null;
    const inCollections = map
        ? collections.filter((c) => extractHashes(c.maps).has(map.md5Hash)).map((c) => c.name)
        : [];

    useEffect(() => {
        if (map) void onScoresNeeded?.(map);
    }, [map?.md5Hash, map?._contentHash, onScoresNeeded]);

    useEffect(() => {
        let cancelled = false;
        setBgUrl(map?._coverUrl ?? null);
        setAudioUrl(null);
        setShowScores(false);
        setPpInfo(undefined);
        setScorePPs(new Map());
        setOnlineTags([]);

        if (!map) {
            return;
        }

        const loadAssets = async () => {
            if (!osuPath) return;

            const detail: StableBeatmapDetail | null = await window.olsCore.getStableBeatmapDetail(map.md5Hash);
            if (!detail || cancelled) return;

            const backgroundUrl = await loadBeatmapBackground(map, osuPath, detail);
            if (!cancelled) setBgUrl(backgroundUrl);

            const ppResult = await window.olsCore.calcPP({
                md5Hash: map.md5Hash,
                mods: 0,
                beatmapId: map.beatmapId,
                ar: map.ar,
                od: map.od,
                nCircles: map.numCircles,
                nSliders: map.numSliders,
                ruleset: map.mode,
            });
            if (!cancelled) {
                setPpInfo(
                    ppResult && !("error" in ppResult)
                        ? {
                              maxPP: ppResult.maxPP,
                              stars: ppResult.stars,
                              maxAim: ppResult.maxAim,
                              maxSpeed: ppResult.maxSpeed,
                              maxAcc: ppResult.maxAcc,
                          }
                        : null,
                );
            }

            const songsPath = `${osuPath}/Songs`;
            const audioBase64 = await window.olsCore.readBeatmapAsset(
                songsPath,
                detail.path,
                detail.audioFileName,
                "base64",
            );
            if (!cancelled && typeof audioBase64 === "string") {
                setAudioUrl(`data:${guessMimeTypeFromPath(detail.audioFileName)};base64,${audioBase64}`);
            }
        };

        const loadOnlineTags = async () => {
            const result = await window.olsCore.getBeatmapOnlineTags(map.beatmapId);
            if (cancelled || !result || (result as any).error) return;
            setOnlineTags(result as string[]);
        };

        loadAssets().catch(() => {
            if (!cancelled) {
                setBgUrl(null);
                setAudioUrl(null);
            }
        });
        loadOnlineTags().catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [map, osuPath]);

    useEffect(() => {
        if (!showScores || !map || mapScores.length === 0) return;
        const activeMap = map;
        let cancelled = false;
        (async () => {
            const results = new Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>();
            for (const s of mapScores) {
                if (cancelled) break;
                const key = makeScorePPKey({
                    md5Hash: activeMap.md5Hash,
                    totalScore: s.totalScore,
                    date: s.date,
                    maxCombo: s.maxCombo,
                    _accuracy: s._accuracy,
                });
                const result = await window.olsCore.calcPP({
                    md5Hash: activeMap.md5Hash,
                    mods: s.mods,
                    modsData: s._lazerMods,
                    combo: s.maxCombo,
                    n300: s.count300,
                    n100: s.count100,
                    n50: s.count50,
                    misses: s.countMiss,
                    totalScore: s.totalScore,
                    beatmapId: activeMap.beatmapId,
                    ar: activeMap.ar,
                    od: activeMap.od,
                    nCircles: activeMap.numCircles,
                    nSliders: activeMap.numSliders,
                    ruleset: activeMap.mode,
                    lazer: s._lazer,
                });
                if (result && !("error" in result)) {
                    results.set(key, { pp: result.pp, aim: result.aim, speed: result.speed, acc: result.acc });
                }
            }
            if (!cancelled) setScorePPs(new Map(results));
        })();
        return () => {
            cancelled = true;
        };
    }, [showScores, map?.md5Hash, mapScoresKey]);

    const handleCopyId = () => {
        if (!map) return;
        navigator.clipboard.writeText(String(map.beatmapId));
        setCopyDone(true);
        setTimeout(() => setCopyDone(false), 2000);
    };

    const InfoRow: React.FC<{ label: string; value: React.ReactNode; wide?: boolean }> = ({ label, value, wide }) => (
        <Box
            sx={{
                gridColumn: wide ? "1 / -1" : undefined,
                display: "flex",
                gap: 0.5,
                alignItems: "baseline",
                minWidth: 0,
            }}
        >
            <Typography
                variant="caption"
                sx={{
                    color: "text.secondary",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                }}
            >
                {label}
            </Typography>
            <Typography
                variant="caption"
                sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
                {value}
            </Typography>
        </Box>
    );

    return (
        <ScrollAdjustDrawer open={map !== null} onClose={onClose}>
            {(ctx) =>
                map && (
                    <>
                        <Box
                            onClick={ctx.toggleHeight}
                            sx={{
                                cursor: "pointer",
                                position: "relative",
                                height: "18vh",
                                flexShrink: 0,
                                overflow: "hidden",
                                bgcolor: "action.selected",
                            }}
                        >
                            {bgUrl && (
                                <Box
                                    component="img"
                                    src={bgUrl}
                                    sx={{
                                        position: "absolute",
                                        inset: 0,
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        filter: "brightness(0.55)",
                                    }}
                                />
                            )}
                            <Box
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-end",
                                    p: 1.5,
                                    gap: 0.25,
                                    background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
                                }}
                            >
                                <Typography
                                    variant="h6"
                                    noWrap
                                    sx={{
                                        lineHeight: 1.2,
                                        color: "common.white",
                                        textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                                    }}
                                >
                                    <Box component="span">{map.artist}</Box>
                                    {map.artistUnicode && map.artistUnicode !== map.artist && (
                                        <Box
                                            component="span"
                                            sx={{ ml: 0.5, fontSize: "0.8em", color: "rgba(255,255,255,0.7)" }}
                                        >
                                            {map.artistUnicode}
                                        </Box>
                                    )}
                                    <Box component="span"> - </Box>
                                    <Box component="span">{map.songTitle}</Box>
                                    {map.songTitleUnicode && map.songTitleUnicode !== map.songTitle && (
                                        <Box
                                            component="span"
                                            sx={{ ml: 0.5, fontSize: "0.8em", color: "rgba(255,255,255,0.7)" }}
                                        >
                                            {map.songTitleUnicode}
                                        </Box>
                                    )}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    noWrap
                                    sx={{ color: "rgba(255,255,255,0.85)", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                                >
                                    [{map.difficultyName}] &nbsp;&nbsp; {map.creatorName} &nbsp;&nbsp;{" "}
                                    <Star sx={{ fontSize: "inherit", verticalAlign: "middle" }} />{" "}
                                    {displaySR.toFixed(2)}
                                </Typography>
                            </Box>
                        </Box>
                        <Box
                            onClick={ctx.toggleHeight}
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                py: 0.5,
                                cursor: "pointer",
                                flexShrink: 0,
                                borderBottom: 1,
                                borderColor: "divider",
                                "&:hover": { bgcolor: "action.hover" },
                            }}
                        >
                            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: "action.disabled" }} />
                        </Box>
                        <Box ref={ctx.contentRef} sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "4px 16px",
                                    mb: 1.5,
                                }}
                            >
                                <InfoRow label="AR" value={map.ar.toFixed(1)} />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_CIRCLES)} value={map.numCircles} />
                                <InfoRow label="CS" value={map.cs.toFixed(1)} />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_SLIDERS)} value={map.numSliders} />
                                <InfoRow label="HP" value={map.hp.toFixed(1)} />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_SPINNERS)} value={map.numSpinners} />
                                <InfoRow label="OD" value={map.od.toFixed(1)} />
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_RESULT_SV)}
                                    value={map.sliderMultiplier.toFixed(2)}
                                />
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_RESULT_STACK)}
                                    value={map.stackLeniency.toFixed(2)}
                                />
                                <InfoRow label="Drain" value={formatDrain(map.drainSeconds)} />
                                <InfoRow
                                    label="PP"
                                    value={
                                        ppInfo === undefined ? (
                                            "..."
                                        ) : ppInfo === null ? (
                                            "-"
                                        ) : ppInfo.maxAim !== undefined ? (
                                            <Tooltip
                                                title={`Aim: ${ppInfo.maxAim.toFixed(0)}  Speed: ${ppInfo.maxSpeed?.toFixed(0)}  Acc: ${ppInfo.maxAcc?.toFixed(0)}`}
                                                arrow
                                            >
                                                <span>{ppInfo.maxPP.toFixed(0)}pp</span>
                                            </Tooltip>
                                        ) : (
                                            `${ppInfo.maxPP.toFixed(0)}pp`
                                        )
                                    }
                                />
                            </Box>

                            <Divider sx={{ mb: 1.5 }} />

                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "4px 16px",
                                    mb: 1.5,
                                }}
                            >
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_RESULT_MODE)}
                                    value={MODE_LABELS[map.mode] ?? map.mode}
                                />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_BEATMAP_ID)} value={map.beatmapId} />
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_RESULT_STATUS)}
                                    value={RANKED_STATUS_LABELS[map.rankedStatus] ?? map.rankedStatus}
                                />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_SET_ID)} value={map.beatmapSetId} />
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_RESULT_UNPLAYED)}
                                    value={
                                        effectiveUnplayed
                                            ? __(I18nStrings.MAIN_PICKER_RESULT_YES)
                                            : __(I18nStrings.MAIN_PICKER_RESULT_NO)
                                    }
                                />
                                <Tooltip
                                    title={
                                        effectiveLastPlayedTime
                                            ? formatDateTime(effectiveLastPlayedTime.getTime())
                                            : null
                                    }
                                    arrow
                                >
                                    <InfoRow
                                        label={__(I18nStrings.MAIN_PICKER_WEIGHT_BM_LAST_PLAYED)}
                                        value={
                                            effectiveLastPlayedTime
                                                ? formatTimeAgo(effectiveLastPlayedTime.getTime())
                                                : "-"
                                        }
                                    />
                                </Tooltip>
                            </Box>

                            {map.source && (
                                <>
                                    <Divider sx={{ mb: 1 }} />
                                    <InfoRow
                                        label={__(I18nStrings.MAIN_PICKER_RESULT_SOURCE)}
                                        value={map.source}
                                        wide
                                    />
                                </>
                            )}

                            <Divider sx={{ my: 1 }} />
                            <Box
                                onClick={() => setShowScores((p) => !p)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    mb: showScores ? 0.5 : 0,
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: "text.secondary",
                                        flex: 1,
                                    }}
                                >
                                    {__(I18nStrings.MAIN_PICKER_RESULT_SCORES, { count: mapScores.length })}
                                </Typography>
                                {showScores ? (
                                    <KeyboardArrowUp fontSize="small" />
                                ) : (
                                    <KeyboardArrowDown fontSize="small" />
                                )}
                            </Box>
                            <Collapse in={showScores}>
                                <Box sx={{ mb: 1 }}>
                                    {mapScores.length === 0 ? (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: "text.disabled",
                                            }}
                                        >
                                            -
                                        </Typography>
                                    ) : (
                                        <ScoreSection scores={scoreRows} ppMap={scorePPs} nowEnabled={showScores} />
                                    )}
                                </Box>
                            </Collapse>

                            {inCollections.length > 0 && (
                                <>
                                    <Divider sx={{ mb: 1 }} />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: "text.secondary",
                                            display: "block",
                                            mb: 0.5,
                                        }}
                                    >
                                        {__(I18nStrings.MAIN_PICKER_RESULT_COLLECTIONS)}
                                    </Typography>
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                                        {inCollections.map((name) => (
                                            <Chip
                                                key={name}
                                                icon={<FolderSpecial sx={{ fontSize: "0.9rem !important" }} />}
                                                label={name}
                                                size="small"
                                                variant="outlined"
                                                color="primary"
                                                sx={{ fontSize: "0.7rem", height: 20 }}
                                            />
                                        ))}
                                    </Box>
                                </>
                            )}

                            {map.tags && (
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                        {map.tags
                                            .split(" ")
                                            .filter(Boolean)
                                            .map((tag) => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ fontSize: "0.7rem", height: 20 }}
                                                />
                                            ))}
                                    </Box>
                                </>
                            )}

                            {onlineTags.length > 0 && (
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: "text.secondary",
                                            display: "block",
                                            mb: 0.5,
                                        }}
                                    >
                                        {__(I18nStrings.MAIN_PICKER_RESULT_ONLINE_TAGS)}
                                    </Typography>
                                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                        {onlineTags.map((tag) => (
                                            <Chip
                                                key={tag}
                                                label={tag}
                                                size="small"
                                                color="primary"
                                                sx={{ fontSize: "0.7rem", height: 20 }}
                                            />
                                        ))}
                                    </Box>
                                </>
                            )}
                        </Box>
                        {audioUrl && (
                            <Box
                                sx={{
                                    flexShrink: 0,
                                }}
                            >
                                <AudioPlayer
                                    url={audioUrl}
                                    volume={audioVolume}
                                    muted={audioMuted}
                                    onVolumeChange={(v) => {
                                        setAudioVolume(v);
                                        g.saveConfig(ConfigKey.UI_AUDIO_VOLUME, v);
                                    }}
                                    onMutedChange={(m) => {
                                        setAudioMuted(m);
                                        g.saveConfig(ConfigKey.UI_AUDIO_MUTED, m);
                                    }}
                                />
                            </Box>
                        )}
                        <Box
                            sx={{
                                flexShrink: 0,
                                p: 1,
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: 1,
                            }}
                        >
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={<CloudDownload />}
                                onClick={async () => {
                                    const mirrorUrl = g.config?.[ConfigKey.DL_MIRROR_URL] as string | undefined;
                                    const setId = map.beatmapSetId;
                                    let source: "osu-official" | "mirror" = "osu-official";
                                    let url = `https://osu.ppy.sh/beatmapsets/${setId}/download`;
                                    if (mirrorUrl) {
                                        source = "mirror";
                                        url = mirrorUrl.replace("{id}", String(setId));
                                    }
                                    const result = await window.olsCore.dlEnqueue({
                                        source,
                                        url,
                                        filename: `${setId}.osz`,
                                        beatmapsetId: setId,
                                    });
                                    if (result.type === "duplicate") {
                                        g.setNotify({
                                            message: __(I18nStrings.MAIN_PICKER_DL_IN_QUEUE, { setId }),
                                            severity: "info",
                                        });
                                    } else if (result.type === "exists") {
                                        g.setNotify({
                                            message: __(I18nStrings.MAIN_PICKER_DL_EXISTS, { setId }),
                                            severity: "info",
                                        });
                                    } else if (result.type === "enqueued") {
                                        if (result.task?.status === "held") {
                                            g.setNotify({
                                                message: __(I18nStrings.MAIN_PICKER_DL_AUTH_REQUIRED, { setId }),
                                                severity: "warning",
                                            });
                                        } else {
                                            g.setNotify({
                                                message: __(I18nStrings.MAIN_PICKER_DL_ENQUEUED, { setId }),
                                                severity: "success",
                                            });
                                        }
                                    }
                                }}
                            >
                                {__(I18nStrings.BTN_PICKER_DOWNLOAD)}
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<Language />}
                                onClick={() => window.olsCore.openBeatmapPage(map.beatmapId)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    window.olsCore.openExternal(`https://osu.ppy.sh/beatmaps/${map.beatmapId}`);
                                }}
                            >
                                {__(I18nStrings.MAIN_PICKER_RESULT_WEB)}
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<MusicNote />}
                                onClick={() => window.olsCore.openExternal(`osu://b/${map.beatmapId}`)}
                            >
                                {__(I18nStrings.MAIN_PICKER_RESULT_DIRECT)}
                            </Button>
                            <Tooltip
                                title={
                                    copyDone
                                        ? __(I18nStrings.MAIN_PICKER_RESULT_COPY_ID_DONE)
                                        : __(I18nStrings.MAIN_PICKER_RESULT_COPY_ID)
                                }
                                arrow
                            >
                                <Button
                                    variant="outlined"
                                    startIcon={<ContentCopy />}
                                    color={copyDone ? "success" : "primary"}
                                    onClick={handleCopyId}
                                >
                                    {copyDone
                                        ? __(I18nStrings.MAIN_PICKER_RESULT_COPY_ID_DONE)
                                        : __(I18nStrings.MAIN_PICKER_RESULT_COPY_ID)}
                                </Button>
                            </Tooltip>
                        </Box>
                    </>
                )
            }
        </ScrollAdjustDrawer>
    );
};

enum IBPState {
    None,
    Loading,
    Loaded,
}

const filterMaps = (
    maps: IBeatmapData[],
    generalFilter: TFilterSetting,
    generalSubFilter: TSubFilterSetting,
    includedCollections: string[],
    excludedCollections: string[],
    collections: IOsuCollection[],
    playerTagBeatmapIds: Set<number> | null,
): IBeatmapData[] => {
    const includedHashes =
        includedCollections.length > 0
            ? (() => {
                  const s = new Set<string>();
                  for (const colName of includedCollections) {
                      const col = collections.find((c) => c.name === colName);
                      if (col) for (const h of extractHashes(col.maps)) s.add(h);
                  }
                  return s;
              })()
            : null;

    const excludedHashes =
        excludedCollections.length > 0
            ? (() => {
                  const s = new Set<string>();
                  for (const colName of excludedCollections) {
                      const col = collections.find((c) => c.name === colName);
                      if (col) for (const h of extractHashes(col.maps)) s.add(h);
                  }
                  return s;
              })()
            : null;

    const hasActiveFilter =
        includedHashes ||
        excludedHashes ||
        generalFilter[FilterType.Title] ||
        generalFilter[FilterType.RankStateLocal] ||
        generalFilter[FilterType.RankState] ||
        generalFilter[FilterType.StarRating] ||
        generalFilter[FilterType.Mode] ||
        generalFilter[FilterType.PlayCount] != null ||
        generalFilter[FilterType.Language] != null ||
        playerTagBeatmapIds;

    if (!hasActiveFilter) return maps.filter((m) => m.beatmapId !== 0);

    return maps.filter((m) =>
        apply_beatmap_filter(create_osu_beatmap_accessor(m), generalFilter, {
            playerTagBeatmapIds,
            includedHashes,
            excludedHashes,
            subFilter: generalSubFilter,
        }),
    );
};

const YINMO_SORT_LIMIT = 10_000;

const pickRandom = (pool: { map: IBeatmapData; weight: number }[]): IBeatmapData | undefined => {
    if (getYinMoChanceExperiment() && pool.length <= YINMO_SORT_LIMIT) {
        return yinmoRandom(pool);
    }
    return pickRandomWeighted(pool);
};

const yinmoRandom = (pool: { map: IBeatmapData; weight: number }[]): IBeatmapData | undefined => {
    if (pool.length === 0) return undefined;

    const sortPool = pool.filter((t) => t.weight > 0).sort((a, b) => b.weight - a.weight);

    const totalWeight = sortPool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return undefined;

    const timestamp = Date.now();
    const rawMod = totalWeight >= timestamp ? totalWeight : timestamp % totalWeight;
    const percent = Math.ceil(rawMod % 10000);
    if (percent <= 0 || !Number.isFinite(percent)) {
        const total = sortPool.reduce((s, p) => s + p.weight, 0);
        let r = Math.random() * total;
        for (const p of sortPool) {
            r -= p.weight;
            if (r <= 0) return p.map;
        }
        return sortPool[sortPool.length - 1]?.map;
    }
    const probabilities = sortPool.map((item) => (item.weight / totalWeight) * 100);
    const index = Math.ceil(timestamp % percent);
    if (!Number.isFinite(index)) return sortPool[0]?.map;
    let result: IBeatmapData | undefined;
    let candidates = 0;
    let safetyLimit = percent * sortPool.length * 200;

    while (result === undefined && safetyLimit-- > 0) {
        for (let i = 0; i < sortPool.length && candidates < percent; i++) {
            const threshold = probabilities[i];
            const r = Math.random() * 100;
            if (threshold >= r) {
                if (index === candidates) {
                    result = sortPool[i].map;
                }
                candidates++;
                break;
            }
        }
    }
    return result ?? sortPool[0]?.map;
};

let _onlineBeatmapsCache: IBeatmapData[] | null = null;

// Memory-only picker session: remembers the last loaded source so switching
// views and coming back restores the picker without re-reading the database.
// Lives only for this renderer session (cleared on app restart).
let _lastLoadedSource: PickerSource | null = null;

// Session cache for the stable beatmap array. getStableBeatmapsOnly()
// deliberately bypasses OsuData's shared cache and re-queries the whole DB,
// so the picker keeps its own copy to make view-switch restores instant.
let _stableMapsCache: OsuBeatmap[] | null = null;
const EMPTY_PICKER_HISTORY: IPickerHistory[] = [];

const pickerAccentSx = {
    backgroundColor: "#7C6BAA",
    color: "#FFFFFF",
    border: "1px solid #62538D",
    "&:hover": { backgroundColor: "#62538D", borderColor: "#56477F" },
    "&:active": { backgroundColor: "#56477F", borderColor: "#4A3F72" },
    ".dark &": {
        backgroundColor: "#6F5F96",
        color: "#F0ECF8",
        borderColor: "#5F5085",
        "&:hover": { backgroundColor: "#765F9D", borderColor: "#6A5C85" },
        "&:active": { backgroundColor: "#5F5085", borderColor: "#57497A" },
    },
};
const pickerNeutralSx = {
    backgroundColor: "#D4C9E7",
    color: "#3B3150",
    border: "1px solid #B0A1C7",
    "&:hover": { backgroundColor: "#C5B7DE", borderColor: "#9B89B8" },
    "&:active": { backgroundColor: "#B6A5D4", borderColor: "#8B78AB" },
    ".dark &": {
        backgroundColor: "#393349",
        color: "#E6E2EF",
        borderColor: "#574B6E",
        "&:hover": { backgroundColor: "#473E59", borderColor: "#6A5C85" },
        "&:active": { backgroundColor: "#52466A", borderColor: "#756691" },
    },
};
const pickerDangerSx = {
    backgroundColor: "#C64E5B",
    color: "#FFFFFF",
    border: "1px solid #A43745",
    "&:hover": { backgroundColor: "#B4414F", borderColor: "#8F303D" },
    "&:active": { backgroundColor: "#A43745", borderColor: "#832B37" },
    ".dark &": {
        backgroundColor: "#9A4B5B",
        color: "#FFF4F5",
        borderColor: "#833D4C",
        "&:hover": { backgroundColor: "#AA5264", borderColor: "#8F4554" },
        "&:active": { backgroundColor: "#833D4C", borderColor: "#6F3542" },
    },
};
const pickerLazerSx = {
    backgroundColor: "#B4547C",
    color: "#FFFFFF",
    border: "1px solid #9E4A6D",
    "&:hover": { backgroundColor: "#9E4A6D", borderColor: "#8A4060" },
    "&:active": { backgroundColor: "#8A4060", borderColor: "#7A3554" },
    ".dark &": {
        backgroundColor: "#96577A",
        color: "#FFEFF5",
        borderColor: "#7E4968",
        "&:hover": { backgroundColor: "#A26185", borderColor: "#8C5474" },
        "&:active": { backgroundColor: "#824964", borderColor: "#6F3F5C" },
    },
};
const pickerDisabledSx = {
    "&.Mui-disabled": {
        opacity: 1,
        backgroundColor: "#F0EDF5",
        color: "#A19AAE",
        borderColor: "transparent",
        pointerEvents: "auto",
        cursor: "not-allowed",
        transform: "none",
        boxShadow: "none",
        "&:hover": {
            backgroundColor: "#F0EDF5",
            borderColor: "transparent",
            transform: "none",
            boxShadow: "none",
        },
        "&:active": {
            backgroundColor: "#F0EDF5",
            borderColor: "transparent",
            transform: "none",
            boxShadow: "none",
        },
    },
    ".dark &.Mui-disabled": {
        backgroundColor: "#2E2939",
        color: "#777085",
        borderColor: "transparent",
        "&:hover": {
            backgroundColor: "#2E2939",
            borderColor: "transparent",
            transform: "none",
            boxShadow: "none",
        },
        "&:active": {
            backgroundColor: "#2E2939",
            borderColor: "transparent",
            transform: "none",
            boxShadow: "none",
        },
    },
};

export const BeatmapPickerView: React.FC<IBeatmapPickerViewProps> = () => {
    const [state, setState] = useState<IBPState>(IBPState.None);
    const lazerEnabled = getUseLazerModeExperiment();
    const [source, setSource] = useState<PickerSource>(_lastLoadedSource ?? "stable");
    const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
    const sourceRef = useRef<PickerSource>(_lastLoadedSource ?? "stable");
    sourceRef.current = source;
    const [lazerRollState, setLazerRollState] = useState({ total: 0, poolCount: 0, count: 0, loading: false });
    const [lazerPreviewRows, setLazerPreviewRows] = useState<LazerPreviewRow[] | null>(null);
    const [maps, setMaps] = useState<IBeatmapData[]>([]);
    const [collections, setCollections] = useState<IOsuCollection[]>([]);
    const [scoresByHash, setScoresByHash] = useState<Map<string, OsuScore[]>>(new Map());
    const scoresByHashRef = useRef(scoresByHash);
    const loadedLazerScoreHashesRef = useRef<Set<string>>(new Set());

    const [generalFilter, setGeneralFilter] = useState<TFilterSetting>({});
    const [generalSubFilter, setGeneralSubFilter] = useState<TSubFilterSetting>({});
    const [includedCollections, setIncludedCollections] = useState<string[]>([]);
    const [excludedCollections, setExcludedCollections] = useState<string[]>([]);
    const [advancedSettings, setAdvancedSettings] = useState<IPickerAdvancedSettings>({ weights: [], wishlist: [] });
    const [history, setHistory] = useState<IPickerHistory[]>([]);
    const historyRef = useRef<IPickerHistory[]>([]);
    const isLoadingRef = useRef(false);
    const requestGenerationRef = useRef(0);
    const rollAreaRef = useRef<HTMLDivElement>(null);
    const [rollAreaWidth, setRollAreaWidth] = useState(0);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [newProfileName, setNewProfileName] = useState("");
    const [nameDialog, setNameDialog] = useState<{
        open: boolean;
        mode: "clone" | "rename";
        sourceId: string;
        newName: string;
    }>({ open: false, mode: "clone", sourceId: "", newName: "" });
    const [overwriteDialog, setOverwriteDialog] = useState<{ open: boolean; name: string }>({
        open: false,
        name: "",
    });
    const pendingSaveRef = useRef<{ name: string; profile: IPickerProfile } | null>(null);
    const [activeProfileId, setActiveProfileId] = useState<string>(
        g.config?.[ConfigKey.PICKER_ACTIVE_PROFILE] ?? "default",
    );
    const [activePanel, setActivePanel] = useState<
        "filter" | "collection" | "weight" | "wishlist" | "history" | "profiles" | null
    >(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [migrationDialog, setMigrationDialog] = useState<{
        open: boolean;
        profileId: string;
        outdatedKeys: number[];
        pendingProfile: IPickerProfile | null;
    }>({ open: false, profileId: "", outdatedKeys: [], pendingProfile: null });
    const initialSaveGuard = useRef(true);
    const loadedProfileRef = useRef<{
        generalFilter: TFilterSetting;
        generalSubFilter: TSubFilterSetting;
        includedCollections: string[];
        excludedCollections: string[];
        advancedSettings: IPickerAdvancedSettings;
        profileId: string;
    } | null>(null);
    const loadedHistoryRef = useRef<IPickerHistory[] | null>(null);
    const [playerTagBeatmapIds, setPlayerTagBeatmapIds] = useState<Set<number> | null>(null);
    const [onlineTagsCache, setOnlineTagsCache] = useState<Map<number, string[]>>(new Map());
    const [onlineBeatmaps, setOnlineBeatmaps] = useState<IBeatmapData[]>([]);
    const includeOnlineDb = false;
    const filterStateRef = useRef({
        generalFilter,
        generalSubFilter,
        includedCollections,
        excludedCollections,
        advancedSettings,
        activeProfileId,
    });
    const dirtyRef = useRef(false);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        scoresByHashRef.current = scoresByHash;
    }, [scoresByHash]);

    useEffect(() => {
        filterStateRef.current = {
            generalFilter,
            generalSubFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
            activeProfileId,
        };
    }, [generalFilter, generalSubFilter, includedCollections, excludedCollections, advancedSettings, activeProfileId]);

    useEffect(() => {
        return () => {
            requestGenerationRef.current++;
        };
    }, []);

    useEffect(() => {
        const el = rollAreaRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setRollAreaWidth(el.offsetWidth));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const isSameProfile = () => {
        if (!loadedProfileRef.current) return false;
        if (loadedProfileRef.current.profileId !== activeProfileId) return false;
        return (
            JSON.stringify(loadedProfileRef.current.generalFilter) === JSON.stringify(generalFilter) &&
            JSON.stringify(loadedProfileRef.current.generalSubFilter) === JSON.stringify(generalSubFilter) &&
            JSON.stringify(loadedProfileRef.current.includedCollections) === JSON.stringify(includedCollections) &&
            JSON.stringify(loadedProfileRef.current.excludedCollections) === JSON.stringify(excludedCollections) &&
            JSON.stringify(loadedProfileRef.current.advancedSettings) === JSON.stringify(advancedSettings)
        );
    };

    const isSameHistory = () => {
        if (!loadedHistoryRef.current) return false;
        if (loadedProfileRef.current?.profileId !== activeProfileId) return false;
        return JSON.stringify(loadedHistoryRef.current) === JSON.stringify(history);
    };

    useEffect(() => {
        if (!profileLoaded || initialSaveGuard.current) return;
        if (isSameProfile()) return;
        if (activePanel !== null) {
            dirtyRef.current = true;
            return;
        }
        dirtyRef.current = false;
        window.olsCore.savePickerProfile(activeProfileId, {
            name: activeProfileId,
            generalFilter,
            subFilter: generalSubFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
        });
        g.setNotify({ message: __(I18nStrings.MAIN_PICKER_PROFILE_SAVED), severity: "success" });
    }, [generalFilter, generalSubFilter, includedCollections, excludedCollections, advancedSettings, activeProfileId]);

    useEffect(() => {
        const hasPlayerTags = (cond?: IWeightBeatmapCondition) => cond?.field === BeatmapDataField.PlayerTags;
        const usesPlayerTags =
            advancedSettings.weights.some(
                (w) => w.type === PickerTargetType.BeatmapData && hasPlayerTags(w.beatmapCondition),
            ) ||
            advancedSettings.wishlist.some((entry) =>
                entry.conditions.some(
                    (c) => c.type === PickerTargetType.BeatmapData && hasPlayerTags(c.beatmapCondition),
                ),
            );
        if (!usesPlayerTags) {
            setOnlineTagsCache(new Map());
            return;
        }
        let cancelled = false;
        window.olsCore.getAllBeatmapOnlineTags().then((result) => {
            if (cancelled || !result || (result as any).error) return;
            setOnlineTagsCache(new Map(result as Array<[number, string[]]>));
        });
        return () => {
            cancelled = true;
        };
    }, [advancedSettings.weights, advancedSettings.wishlist]);

    useEffect(() => {
        if (activePanel !== null) return;
        if (!profileLoaded || !dirtyRef.current) return;
        dirtyRef.current = false;
        const {
            generalFilter: gf,
            generalSubFilter: gsf,
            includedCollections: inc,
            excludedCollections: exc,
            advancedSettings: adv,
            activeProfileId: pid,
        } = filterStateRef.current;
        window.olsCore.savePickerProfile(pid, {
            name: pid,
            generalFilter: gf,
            subFilter: gsf,
            includedCollections: inc,
            excludedCollections: exc,
            advancedSettings: adv,
        });
        g.setNotify({ message: __(I18nStrings.MAIN_PICKER_PROFILE_SAVED), severity: "success" });
    }, [activePanel]);

    useEffect(() => {
        if (!profileLoaded || initialSaveGuard.current) return;
        if (isSameHistory()) return;
        window.olsCore.savePickerLog(activeProfileId, history);
    }, [history, activeProfileId]);

    const applyProfile = (id: string, profile: IPickerProfile) => {
        setGeneralFilter(profile.generalFilter ?? {});
        setGeneralSubFilter(profile.subFilter ?? {});
        setIncludedCollections(profile.includedCollections ?? []);
        setExcludedCollections(profile.excludedCollections ?? []);
        setAdvancedSettings(normalizeAdvancedSettings(profile.advancedSettings ?? { weights: [], wishlist: [] }));
        loadedProfileRef.current = {
            profileId: id,
            generalFilter: profile.generalFilter ?? {},
            generalSubFilter: profile.subFilter ?? {},
            includedCollections: profile.includedCollections ?? [],
            excludedCollections: profile.excludedCollections ?? [],
            advancedSettings: normalizeAdvancedSettings(profile.advancedSettings ?? { weights: [], wishlist: [] }),
        };
    };

    const getOutdatedFilterKeys = (profile: IPickerProfile): number[] => {
        const outdated: number[] = [];
        if (profile.generalFilter?.[FilterType.RankState] !== undefined) outdated.push(FilterType.RankState);
        return outdated;
    };

    useEffect(() => {
        const load = async () => {
            const id = g.config?.[ConfigKey.PICKER_ACTIVE_PROFILE] ?? "default";
            const [profile, log, list] = await Promise.all([
                window.olsCore.getPickerProfile(id),
                window.olsCore.getPickerLog(id),
                window.olsCore.listPickerProfiles(),
            ]);
            if (profile) {
                const outdated = getOutdatedFilterKeys(profile);
                if (outdated.length > 0) {
                    setMigrationDialog({ open: true, profileId: id, outdatedKeys: outdated, pendingProfile: profile });
                } else {
                    applyProfile(id, profile);
                    initialSaveGuard.current = false;
                    setProfileLoaded(true);
                }
            } else {
                loadedProfileRef.current = {
                    profileId: id,
                    generalFilter: {},
                    generalSubFilter: {},
                    includedCollections: [],
                    excludedCollections: [],
                    advancedSettings: { weights: [], wishlist: [] },
                };
                initialSaveGuard.current = false;
                setProfileLoaded(true);
            }
            loadedHistoryRef.current = log ?? [];
            if (log?.length) setHistory(log);
            setProfiles(list ?? []);
        };
        load();
    }, []);

    const ensureAllScoresForMap = useCallback(async (map: IBeatmapData) => {
        const hashes = [map.md5Hash, map._contentHash].filter(
            (hash): hash is string => !!hash && !loadedLazerScoreHashesRef.current.has(hash),
        );
        if (hashes.length === 0) return;
        const mapScores = await OsuData.getScoresForMap(undefined, hashes);
        setScoresByHash((prev) => {
            const merged = new Map(prev);
            mapScores.forEach((scores, hash) => {
                merged.set(hash, scores);
                loadedLazerScoreHashesRef.current.add(hash);
            });
            for (const hash of hashes) loadedLazerScoreHashesRef.current.add(hash);
            scoresByHashRef.current = merged;
            return merged;
        });
    }, []);

    const buildLazerSpec = useCallback((): LazerBeatmapQuerySpec => {
        // lazer BeatmapOnlineStatus: Graveyard=-2, WIP=-1, Pending=0, Ranked=1,
        // Approved=2, Qualified=3, Loved=4.
        const rankToStatus: Record<string, number> = {
            graveyard: -2,
            wip: -1,
            pending: 0,
            ranked: 1,
            approved: 2,
            qualified: 3,
            loved: 4,
        };
        const spec: LazerBeatmapQuerySpec = {};
        const title = generalFilter[FilterType.Title];
        if (typeof title === "string" && title.trim()) spec.title = title.trim();
        const artist = generalFilter[FilterType.Artist];
        if (typeof artist === "string" && artist.trim()) spec.artist = artist.trim();
        const rankRaw = generalFilter[FilterType.RankState] ?? generalFilter[FilterType.RankStateLocal];
        if (Array.isArray(rankRaw)) {
            const statuses = rankRaw
                .filter((v) => v !== "all")
                .map((v) => {
                    const s = rankToStatus[String(v)];
                    if (s !== undefined) return s;
                    const n = Number(v);
                    // StableLocalBeatmapStatus (0-7) ladder → lazer status approximation.
                    return Number.isFinite(n) ? Math.max(-4, Math.min(4, n - 3)) : undefined;
                })
                .filter((v): v is number => v !== undefined);
            if (statuses.length > 0) spec.rankStatuses = statuses;
        }
        const modeRaw = generalFilter[FilterType.Mode];
        if (Array.isArray(modeRaw) && !modeRaw.includes("all")) {
            const modes = modeRaw.map(Number).filter((v) => Number.isFinite(v));
            if (modes.length > 0) {
                // Match the client-side filter semantics: osu (mode 0) beatmaps
                // always pass the mode filter regardless of the selected modes.
                if (!modes.includes(0)) modes.unshift(0);
                spec.modes = modes;
            }
        }
        const srRaw = generalFilter[FilterType.StarRating];
        const srSub = generalSubFilter[FilterType.StarRating];
        if (Array.isArray(srRaw) && srSub === undefined) {
            const [min = 0, max = 15] = srRaw as [number, number];
            if (min !== 0) spec.srMin = min;
            if (max !== 15) spec.srMax = max;
        }
        if (includedCollections.length > 0) spec.includedCollectionNames = includedCollections;
        if (excludedCollections.length > 0) spec.excludedCollectionNames = excludedCollections;
        if (playerTagBeatmapIds && playerTagBeatmapIds.size > 0) spec.playerTagBeatmapIds = [...playerTagBeatmapIds];
        return spec;
    }, [generalFilter, generalSubFilter, includedCollections, excludedCollections, playerTagBeatmapIds]);

    const lazerRollRequest = useCallback(
        (mode: "count" | "preview" | "roll", previewLimit?: number): LazerRollRequest => {
            const spec = buildLazerSpec();
            const srSub = generalSubFilter[FilterType.StarRating];
            const srRaw = generalFilter[FilterType.StarRating];
            const usesPlayerTags =
                advancedSettings.weights.some(
                    (w) =>
                        w.type === PickerTargetType.BeatmapData &&
                        w.beatmapCondition?.field === BeatmapDataField.PlayerTags,
                ) ||
                advancedSettings.wishlist.some((e) =>
                    e.conditions.some(
                        (c) =>
                            c.type === PickerTargetType.BeatmapData &&
                            c.beatmapCondition?.field === BeatmapDataField.PlayerTags,
                    ),
                );
            return {
                spec,
                weights: advancedSettings.weights,
                wishlist: advancedSettings.wishlist,
                history,
                onlineTags: usesPlayerTags && onlineTagsCache.size > 0 ? [...onlineTagsCache.entries()] : undefined,
                srSubFilter:
                    srSub !== undefined && Array.isArray(srRaw)
                        ? {
                              op:
                                  srSub === SubFilterType.Equal
                                      ? "equal"
                                      : srSub === SubFilterType.Less
                                        ? "less"
                                        : "greater",
                              target: (srRaw as [number, number])[0],
                          }
                        : undefined,
                mode,
                previewLimit,
            };
        },
        [buildLazerSpec, generalSubFilter, generalFilter, advancedSettings, history, onlineTagsCache],
    );

    const lazerCountSeqRef = useRef(0);
    const performLazerCount = useCallback(
        async (generation = requestGenerationRef.current) => {
            const isCurrent = () => generation === requestGenerationRef.current;
            const seq = ++lazerCountSeqRef.current;
            if (!isCurrent()) return;
            setLazerRollState((p) => ({ ...p, loading: true }));
            try {
                const res = await window.olsCore.lazerRoll(lazerRollRequest("count"));
                if (seq !== lazerCountSeqRef.current || !isCurrent()) return; // superseded by a newer request
                setLazerRollState((p) => ({ ...p, poolCount: res.poolCount, count: res.count, loading: false }));
            } catch {
                if (seq === lazerCountSeqRef.current && isCurrent()) {
                    setLazerRollState((p) => ({ ...p, loading: false }));
                }
            }
        },
        [lazerRollRequest],
    );

    const applyFromCache = useCallback(
        async (
            src: PickerSource,
            cachedStableMaps?: OsuBeatmap[] | null,
            generation = requestGenerationRef.current,
        ) => {
            const isCurrent = () => generation === requestGenerationRef.current;
            if (src === "lazer") {
                // Lazer picker source: counts + previews only — never the full beatmap list.
                const cols = await OsuData.getLazerCollections();
                if (!isCurrent()) return;
                setCollections(cols);
                setMaps([]);
                scoresByHashRef.current = new Map();
                setScoresByHash(new Map());
                try {
                    const { count } = await window.olsCore.countLazerBeatmaps({});
                    if (!isCurrent()) return;
                    setLazerRollState((p) => ({ ...p, total: count, poolCount: 0, count: 0 }));
                } catch {
                    /* keep previous counts */
                }
                return;
            }
            const cols = await OsuData.getCollections();
            if (!isCurrent()) return;
            const mapsToApply = cachedStableMaps ?? _stableMapsCache;
            if (mapsToApply) {
                setMaps(mapsToApply);
            } else {
                const allMaps = await OsuData.getStableBeatmapsOnly();
                if (!isCurrent()) return;
                _stableMapsCache = allMaps;
                setMaps(allMaps);
            }
            const scores = await OsuData.getScores();
            if (!isCurrent()) return;
            loadedLazerScoreHashesRef.current.clear();
            setCollections(cols);
            scoresByHashRef.current = scores;
            setScoresByHash(scores);
        },
        [],
    );

    const loadData = useCallback(
        async (src: PickerSource) => {
            if (isLoadingRef.current) return;
            const generation = ++requestGenerationRef.current;
            const isCurrent = () => generation === requestGenerationRef.current;
            isLoadingRef.current = true;
            try {
                setState(IBPState.Loading);
                setLazerPreviewRows(null);
                OsuData.invalidateData();
                _stableMapsCache = null;
                g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                await yieldToMain();
                // No OsuData.init(): the shared init() would merge all lazer
                // beatmaps when the lazer experiment is on. Each source loads
                // only its own data (stable-only or lazer counts/previews).
                await applyFromCache(src, undefined, generation);
                if (!isCurrent()) return;
                if (src === "lazer") {
                    // Re-assert the loading overlay (background refreshes may
                    // clear it) and keep it until the pool + scores are ready
                    // (first computation can take ~20s with score conditions).
                    g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
                    await performLazerCount(generation);
                    if (!isCurrent()) return;
                }
                _lastLoadedSource = src;
                setState(IBPState.Loaded);
                if (!isCurrent()) return;
                g.setLoading(false);
            } catch (error) {
                log.error(error);
                if (!isCurrent()) return;
                setState(IBPState.None);
                if (!isCurrent()) return;
                g.setLoading(false);
            } finally {
                isLoadingRef.current = false;
            }
        },
        [applyFromCache, performLazerCount],
    );

    const onBtnClickedByInit = () => {
        if (lazerEnabled) {
            setSourceDialogOpen(true);
        } else {
            void loadData("stable");
        }
    };

    const onPickSource = (src: PickerSource) => {
        setSourceDialogOpen(false);
        // Only skip when the same source is ALREADY loaded; the initial
        // chooser (state != Loaded) must always load the selected source.
        if (src === source && state === IBPState.Loaded) return;
        setSource(src);
        void loadData(src);
    };

    useEffect(() => {
        const onChanged = () => {
            void applyFromCache(sourceRef.current, undefined, requestGenerationRef.current);
        };
        const unsub1 = OsuData.subscribe("beatmaps", onChanged);
        const unsub2 = OsuData.subscribe("scores", onChanged);
        const unsub3 = OsuData.subscribe("collections", onChanged);
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [applyFromCache]);

    useEffect(() => {
        const restoredSource = _lastLoadedSource;
        const stableMaps = _stableMapsCache;
        if (!restoredSource || !shouldRestorePickerSession(restoredSource, stableMaps !== null)) return;

        const generation = ++requestGenerationRef.current;
        let cancelled = false;
        setState(IBPState.Loading);
        void applyFromCache(restoredSource, stableMaps, generation)
            .then(() => {
                if (cancelled || generation !== requestGenerationRef.current) return;
                setState(IBPState.Loaded);
            })
            .catch((error) => {
                log.error(error);
                if (cancelled || generation !== requestGenerationRef.current) return;
                setState(IBPState.None);
            });

        return () => {
            cancelled = true;
        };
    }, [applyFromCache]);

    const [showFilteredList, setShowFilteredList] = useState(false);
    const [pickedMap, setPickedMap] = useState<IBeatmapData | null>(null);
    const [playingMap, setPlayingMap] = useState<IBeatmapData | null>(null);
    const [selectedHistoryMap, setSelectedHistoryMap] = useState<IBeatmapData | null>(null);
    const [isRolling, setIsRolling] = useState(false);
    const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);
    const ringRef = useRef<HTMLDivElement>(null);
    const ringInnerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle = () => setIsPageVisible(!document.hidden);
        document.addEventListener("visibilitychange", handle);
        return () => document.removeEventListener("visibilitychange", handle);
    }, []);

    useEffect(() => {
        if (!includeOnlineDb) {
            setOnlineBeatmaps([]);
            return;
        }
        if (state !== IBPState.Loaded) return;
        if (_onlineBeatmapsCache) {
            setOnlineBeatmaps(_onlineBeatmapsCache);
            return;
        }
        let cancelled = false;
        (async () => {
            await yieldToMain();
            const first = await window.olsCore.getAllOnlineBeatmaps(0, 500);
            if (cancelled || !first || (first as any).error) return;
            const all = await readAllWithOffset(
                (offset, limit) => window.olsCore.getAllOnlineBeatmaps(offset, limit),
                first,
            );
            if (cancelled) return;
            const converted = all.data as IBeatmapData[];
            _onlineBeatmapsCache = converted;
            setOnlineBeatmaps(converted);
        })();
        return () => {
            cancelled = true;
        };
    }, [includeOnlineDb, state]);

    const selectedModesSet = useMemo((): Set<number> | null => {
        const mf = generalFilter[FilterType.Mode];
        if (!mf || (mf as any[]).includes("all")) return null;
        return new Set((mf as number[]).map(Number));
    }, [generalFilter]);

    useEffect(() => {
        const tags = generalFilter[FilterType.PlayerTags] as string[] | undefined;
        if (!tags || tags.length === 0) {
            setPlayerTagBeatmapIds(null);
            return;
        }
        let cancelled = false;
        Promise.all(tags.map((t) => window.olsCore.getBeatmapsByOnlineTag(t))).then((results) => {
            if (cancelled) return;
            if (results.some((r) => (r as any)?.error)) {
                setPlayerTagBeatmapIds(null);
                return;
            }
            const sets = results.map((r) => new Set(r as number[]));
            if (sets.length === 0) {
                setPlayerTagBeatmapIds(null);
                return;
            }
            const union = new Set<number>();
            for (const s of sets) for (const id of s) union.add(id);
            setPlayerTagBeatmapIds(union);
        });
        return () => {
            cancelled = true;
        };
    }, [generalFilter]);

    const deferredMaps = useDeferredValue(maps);
    const deferredOnlineBeatmaps = useDeferredValue(onlineBeatmaps);
    const localBeatmapIds = useMemo(() => new Set(deferredMaps.map((m) => m.beatmapId)), [deferredMaps]);
    const onlineOnlyMaps = useMemo(() => {
        if (!includeOnlineDb || deferredOnlineBeatmaps.length === 0) return [];
        return deferredOnlineBeatmaps.filter((m) => !localBeatmapIds.has(m.beatmapId));
    }, [deferredOnlineBeatmaps, localBeatmapIds, includeOnlineDb]);
    const filteredMaps = useMemo(() => {
        if (state !== IBPState.Loaded) return [];
        const localFiltered = filterMaps(
            deferredMaps,
            generalFilter,
            generalSubFilter,
            includedCollections,
            excludedCollections,
            collections,
            playerTagBeatmapIds,
        );
        if (onlineOnlyMaps.length === 0) return localFiltered;
        const onlineFiltered = filterMaps(
            onlineOnlyMaps,
            generalFilter,
            generalSubFilter,
            includedCollections,
            excludedCollections,
            collections,
            playerTagBeatmapIds,
        );
        return [...localFiltered, ...onlineFiltered];
    }, [
        state,
        deferredMaps,
        onlineOnlyMaps,
        generalFilter,
        generalSubFilter,
        includedCollections,
        excludedCollections,
        collections,
        playerTagBeatmapIds,
    ]);

    const collectionMaps = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const col of collections) {
            m.set(col.name, extractHashes(col.maps));
        }
        return m;
    }, [collections]);

    const historyAffectsSelection = useMemo(
        () =>
            advancedSettings.weights.some(
                (entry) => entry.enabled !== false && entry.type === PickerTargetType.History,
            ) ||
            advancedSettings.wishlist.some(
                (entry) =>
                    entry.enabled !== false &&
                    entry.conditions.some((condition) => condition.type === PickerTargetType.History),
            ),
        [advancedSettings],
    );
    const selectionHistory = historyAffectsSelection ? history : EMPTY_PICKER_HISTORY;

    const weightedPool = useMemo(() => {
        if (state !== IBPState.Loaded || advancedSettings.weights.length === 0) return null;
        return buildWeightedPool(
            filteredMaps,
            advancedSettings,
            collectionMaps,
            scoresByHash,
            selectionHistory,
            onlineTagsCache,
        );
    }, [state, filteredMaps, advancedSettings, collectionMaps, scoresByHash, selectionHistory, onlineTagsCache]);

    // Wishlist-priority candidates decide the stable selection pool, so the (90k-map)
    // evaluation is shared by the pickable count, the preview list and the roll click.
    const stableWishlistSelection = useMemo(() => {
        if (state !== IBPState.Loaded) return null;
        const candidates = checkWishlist(
            filteredMaps,
            advancedSettings,
            scoresByHash,
            collectionMaps,
            selectionHistory,
            onlineTagsCache,
        );
        if (candidates.length === 0) return { pool: null, positivePool: null };
        const pool = buildWeightedPool(
            candidates,
            advancedSettings,
            collectionMaps,
            scoresByHash,
            selectionHistory,
            onlineTagsCache,
        );
        return { pool, positivePool: pool.filter((p) => p.weight > 0) };
    }, [state, filteredMaps, advancedSettings, collectionMaps, scoresByHash, selectionHistory, onlineTagsCache]);

    // Built on first use and cached until its inputs change, so a roll click never
    // rebuilds a pool the render pass already produced.
    const resolveStableFullPool = useMemo(() => {
        let cached: { map: IBeatmapData; weight: number }[] | null = null;
        return () => {
            if (weightedPool) return weightedPool;
            cached ??= buildWeightedPool(
                filteredMaps,
                advancedSettings,
                collectionMaps,
                scoresByHash,
                selectionHistory,
                onlineTagsCache,
            );
            return cached;
        };
    }, [weightedPool, filteredMaps, advancedSettings, collectionMaps, scoresByHash, selectionHistory, onlineTagsCache]);

    const pickableCount = useMemo(() => {
        if (state !== IBPState.Loaded) return filteredMaps.length;
        const positivePool = stableWishlistSelection?.positivePool;
        if (positivePool) return positivePool.length;
        if (!weightedPool) return filteredMaps.length;
        return weightedPool.filter((p) => p.weight > 0).length;
    }, [state, filteredMaps, weightedPool, stableWishlistSelection]);

    const effectivePickableCount = source === "lazer" ? lazerRollState.count : pickableCount;
    const effectiveFilteredCount = source === "lazer" ? lazerRollState.poolCount : filteredMaps.length;
    const countLabel =
        source === "lazer" && lazerRollState.loading ? "…" : `${effectivePickableCount} / ${effectiveFilteredCount}`;

    useEffect(() => {
        const ring = ringInnerRef.current;
        if (!ring) return;
        ring.getAnimations().forEach((a) => {
            a.cancel();
        });
        if (isRolling) {
            ring.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
                duration: 600,
                iterations: 1,
                easing: "linear",
            });
        } else if (isPageVisible && state === IBPState.Loaded && pickableCount > 0) {
            ring.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
                duration: 4000,
                iterations: Infinity,
                easing: "linear",
            });
        }
    }, [isRolling, isPageVisible, state, pickableCount]);

    const filteredPool = useMemo(() => {
        if (source === "lazer") {
            if (!showFilteredList || state !== IBPState.Loaded) return [];
            return (lazerPreviewRows ?? []).map((r) => ({
                map: lazerLightweightToOsuBeatmap(r.beatmap),
                weight: r.weight,
                probability: r.probability,
            }));
        }
        if (!showFilteredList || state !== IBPState.Loaded) return [];
        const wPool = stableWishlistSelection?.pool ?? null;
        const pool: { map: IBeatmapData; weight: number }[] = wPool?.some((p) => p.weight > 0)
            ? wPool
            : resolveStableFullPool();
        const total = pool.reduce((s, p) => s + p.weight, 0);
        return pool
            .map((p) => ({ ...p, probability: total > 0 ? (p.weight / total) * 100 : 0 }))
            .sort((a, b) => b.probability - a.probability);
    }, [showFilteredList, source, lazerPreviewRows, state, stableWishlistSelection, resolveStableFullPool]);

    // Stage 2/3 counts for the lazer source (debounced).
    useEffect(() => {
        if (source !== "lazer" || state !== IBPState.Loaded) return;
        const timer = setTimeout(() => {
            void performLazerCount();
        }, 400);
        return () => clearTimeout(timer);
    }, [source, state, performLazerCount]);

    // Preview probability rows for the lazer source (backend-weighted pool).
    useEffect(() => {
        if (!showFilteredList || source !== "lazer" || state !== IBPState.Loaded) return;
        let cancelled = false;
        setLazerPreviewRows(null);
        window.olsCore
            .lazerRoll(lazerRollRequest("preview", 500))
            .then((res) => {
                if (!cancelled) {
                    setLazerPreviewRows(res.rows ?? []);
                    setLazerRollState((p) => ({ ...p, poolCount: res.poolCount, count: res.count }));
                }
            })
            .catch(() => {
                if (!cancelled) setLazerPreviewRows([]);
            });
        return () => {
            cancelled = true;
        };
    }, [showFilteredList, source, state, lazerRollRequest]);

    const onBtnRollLazer = async () => {
        if (isRolling) return;
        setIsRolling(true);
        setLazerRollState((p) => ({ ...p, loading: true }));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        try {
            const res = await window.olsCore.lazerRoll(lazerRollRequest("roll"));
            setLazerRollState((p) => ({ ...p, poolCount: res.poolCount, count: res.count, loading: false }));
            const picked = res.picked;
            if (picked) {
                const now = Date.now();
                const entry: IPickerHistory = {
                    beatmapId: picked.beatmapId,
                    md5Hash: picked.md5Hash,
                    title: `${picked.artist} - ${picked.songTitle} [${picked.difficultyName}]`,
                    artist: picked.artist,
                    songTitle: picked.songTitle,
                    difficultyName: picked.difficultyName,
                    creatorName: picked.creatorName,
                    pickedAt: now,
                };
                setHistory((prev) => {
                    const next = [...prev, entry];
                    if (next.length > HISTORY_MAX) next.splice(0, next.length - HISTORY_MAX);
                    return next;
                });
                setPickedMap(picked);
            }
        } catch {
            setLazerRollState((p) => ({ ...p, loading: false }));
        } finally {
            setTimeout(() => setIsRolling(false), 650);
        }
    };

    const onBtnRoll = async () => {
        if (isRolling) return;
        if (source === "lazer") {
            await onBtnRollLazer();
            return;
        }
        setIsRolling(true);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const now = Date.now();

        const wishlistPool = stableWishlistSelection?.positivePool ?? [];
        const pool = wishlistPool.length > 0 ? wishlistPool : resolveStableFullPool();
        const picked = pickRandom(pool);

        if (!picked) {
            setIsRolling(false);
            return;
        }

        const entry: IPickerHistory = {
            beatmapId: picked.beatmapId,
            md5Hash: picked.md5Hash,
            title: `${picked.artist} - ${picked.songTitle} [${picked.difficultyName}]`,
            artist: picked.artist,
            songTitle: picked.songTitle,
            difficultyName: picked.difficultyName,
            creatorName: picked.creatorName,
            pickedAt: now,
        };

        setHistory((prev) => {
            const next = [...prev, entry];
            if (next.length > HISTORY_MAX) next.splice(0, next.length - HISTORY_MAX);
            return next;
        });

        setPickedMap(picked._onlineOnly ? null : picked);
        if (picked._onlineOnly) {
            window.olsCore.openBeatmapPage(picked.beatmapId);
        }
        setTimeout(() => setIsRolling(false), 650);
    };

    const onClearHistory = () => {
        setHistory([]);
    };

    const lazerDetailRequestRef = useRef(0);
    const fetchLazerBeatmapDetail = useCallback(async (request: LazerBeatmapDetailRequest) => {
        const requestId = ++lazerDetailRequestRef.current;
        try {
            const result = await window.olsCore.getLazerBeatmapDetail(request);
            if (requestId !== lazerDetailRequestRef.current || !result || "error" in result) return null;
            return lazerBeatmapToOsuBeatmap(result);
        } catch {
            return null;
        }
    }, []);

    const onHistoryItemClick = async (item: IPickerHistory) => {
        if (source === "lazer") {
            const map = await fetchLazerBeatmapDetail({
                md5Hash: item.md5Hash,
                beatmapId: item.beatmapId > 0 ? item.beatmapId : undefined,
            });
            if (map) {
                setSelectedHistoryMap(map);
            } else {
                g.setNotify({ message: __(I18nStrings.MAIN_PICKER_LOCAL_NOT_FOUND), severity: "warning" });
            }
            return;
        }
        const map = maps.find((m) => m.beatmapId === item.beatmapId) ?? null;
        if (map) {
            setSelectedHistoryMap(map);
        } else {
            g.setNotify({ message: __(I18nStrings.MAIN_PICKER_LOCAL_NOT_FOUND), severity: "warning" });
        }
    };

    const onSaveProfile = async () => {
        const name = newProfileName.trim();
        if (!name) return;
        const profile: IPickerProfile = {
            name,
            generalFilter,
            subFilter: generalSubFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
        };
        if (profiles.includes(name)) {
            pendingSaveRef.current = { name, profile };
            setOverwriteDialog({ open: true, name });
            return;
        }
        await doSaveProfile(name, profile);
    };

    const doSaveProfile = async (name: string, profile: IPickerProfile) => {
        await window.olsCore.savePickerProfile(name, profile);
        setProfiles(await window.olsCore.listPickerProfiles());
        setNewProfileName("");
        g.setNotify({ message: __(I18nStrings.MAIN_PICKER_PROFILE_SAVED), severity: "success" });
    };

    const onLoadProfile = async (profileId: string) => {
        const profile = await window.olsCore.getPickerProfile(profileId);
        if (!profile) return;
        const outdated = getOutdatedFilterKeys(profile);
        if (outdated.length > 0) {
            applyProfile(profileId, profile);
            setMigrationDialog({ open: true, profileId, outdatedKeys: outdated, pendingProfile: profile });
        } else {
            applyProfile(profileId, profile);
        }
        setActiveProfileId(profileId);
        g.saveConfig(ConfigKey.PICKER_ACTIVE_PROFILE, profileId);
    };

    const onDeleteProfile = async (profileId: string) => {
        await window.olsCore.deletePickerProfile(profileId);
        setProfiles(await window.olsCore.listPickerProfiles());
        if (activeProfileId === profileId) {
            setActiveProfileId("default");
            g.saveConfig(ConfigKey.PICKER_ACTIVE_PROFILE, "default");
        }
    };

    const onConfirmNameDialog = async () => {
        const name = nameDialog.newName.trim();
        if (!name) return;
        const source = await window.olsCore.getPickerProfile(nameDialog.sourceId);
        if (!source) return;
        const profile: IPickerProfile = { ...source, name };
        if (profiles.includes(name)) {
            pendingSaveRef.current = { name, profile };
            setNameDialog((s) => ({ ...s, open: false }));
            setOverwriteDialog({ open: true, name });
            return;
        }
        await doSaveProfile(name, profile);
        if (nameDialog.mode === "rename" && nameDialog.sourceId !== name) {
            await window.olsCore.deletePickerProfile(nameDialog.sourceId);
            setProfiles(await window.olsCore.listPickerProfiles());
            if (activeProfileId === nameDialog.sourceId) {
                setActiveProfileId(name);
                g.saveConfig(ConfigKey.PICKER_ACTIVE_PROFILE, name);
            }
        }
        setNameDialog((s) => ({ ...s, open: false }));
    };

    const onExportProfiles = async () => {
        const loaded = await Promise.all(profiles.map((id) => window.olsCore.getPickerProfile(id)));
        const valid = loaded.filter(Boolean) as IPickerProfile[];
        if (valid.length === 0) return;
        const json = JSON.stringify(valid, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "olsync-picker-profiles.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    const onImportProfiles = async () => {
        try {
            const imported = await window.olsCore.importPickerProfiles();
            if (!Array.isArray(imported)) return;
            for (const p of imported) {
                if (!p?.name) continue;
                let safeName: string;
                try {
                    safeName = sanitizeProfileId(String(p.name));
                } catch {
                    continue;
                }
                const normalized: IPickerProfile = {
                    ...p,
                    name: safeName,
                    advancedSettings: normalizeAdvancedSettings(p.advancedSettings ?? { weights: [], wishlist: [] }),
                };
                await window.olsCore.savePickerProfile(safeName, normalized);
            }
            setProfiles(await window.olsCore.listPickerProfiles());
        } catch {}
    };

    const renderPanelButton = (panel: "filter" | "collection", corner?: "top" | "bottom") => (
        <Button
            variant="contained"
            disabled={state !== IBPState.Loaded}
            onClick={() => setActivePanel(activePanel === panel ? null : panel)}
            sx={{
                flex: 1,
                borderRadius: corner === "top" ? "8px 0 0 0" : corner === "bottom" ? "0 0 0 8px" : 0,
                minWidth: 68,
                py: 1.5,
                marginBottom: "-1px",
                "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(-8px)" },
                ...(activePanel === panel ? pickerAccentSx : pickerNeutralSx),
                ...pickerDisabledSx,
            }}
        >
            <Box
                className="btn-inner"
                sx={{
                    position: "absolute",
                    top: 0,
                    width: "55%",
                    bottom: 0,
                    left: 12,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    transition: "transform 0.18s ease",
                    pointerEvents: "none",
                }}
            >
                {panel === "filter" ? <FilterList /> : <FolderSpecial />}
                <Typography variant="caption" sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}>
                    {panel === "filter"
                        ? __(I18nStrings.BTN_PICKER_FILTER)
                        : __(I18nStrings.BTN_PICKER_FILTER_COLLECTION)}
                </Typography>
            </Box>
        </Button>
    );

    return (
        <>
            <InfoDialog
                open={migrationDialog.open}
                title={__(I18nStrings.MAIN_PICKER_MIGRATION_TITLE)}
                onConfirm={async () => {
                    const cleaned = await window.olsCore.migratePickerProfile(
                        migrationDialog.profileId,
                        migrationDialog.outdatedKeys.map(String),
                    );
                    if (cleaned) applyProfile(migrationDialog.profileId, cleaned);
                    if (!profileLoaded) {
                        initialSaveGuard.current = false;
                        setProfileLoaded(true);
                    }
                    setMigrationDialog((s) => ({ ...s, open: false }));
                }}
            >
                <Typography variant="body2" sx={{ mb: 1 }}>
                    {__(I18nStrings.MAIN_PICKER_MIGRATION_DESC)}
                </Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {migrationDialog.outdatedKeys.map((k) => (
                        <li key={k}>
                            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                                generalFilter &gt; {k}
                            </Typography>
                        </li>
                    ))}
                </ul>
            </InfoDialog>
            <BaseDialog
                open={nameDialog.open}
                onClose={() => setNameDialog((s) => ({ ...s, open: false }))}
                title={
                    nameDialog.mode === "clone"
                        ? __(I18nStrings.MAIN_PICKER_PROFILE_CLONE_TITLE)
                        : __(I18nStrings.MAIN_PICKER_PROFILE_RENAME_TITLE)
                }
                actions={
                    <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => setNameDialog((s) => ({ ...s, open: false }))}
                        >
                            {__(I18nStrings.BTN_CANCEL)}
                        </Button>
                        <Button
                            variant="contained"
                            fullWidth
                            disabled={!nameDialog.newName.trim()}
                            onClick={onConfirmNameDialog}
                        >
                            {nameDialog.mode === "clone"
                                ? __(I18nStrings.MAIN_PICKER_PROFILE_CLONE)
                                : __(I18nStrings.MAIN_PICKER_PROFILE_RENAME)}
                        </Button>
                    </Stack>
                }
            >
                <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    sx={{ mt: 1 }}
                    label={__(I18nStrings.MAIN_PICKER_PROFILE_NAME)}
                    value={nameDialog.newName}
                    onChange={(e) => setNameDialog((s) => ({ ...s, newName: e.target.value }))}
                />
            </BaseDialog>
            <BaseDialog
                open={sourceDialogOpen}
                onClose={() => setSourceDialogOpen(false)}
                title={__(I18nStrings.MAIN_PICKER_SOURCE_TITLE)}
            >
                <Stack direction="row" spacing={1}>
                    <Button variant="contained" fullWidth sx={pickerAccentSx} onClick={() => onPickSource("stable")}>
                        {__(I18nStrings.MAIN_PICKER_SOURCE_STABLE)}
                    </Button>
                    <Button variant="contained" fullWidth sx={pickerLazerSx} onClick={() => onPickSource("lazer")}>
                        {__(I18nStrings.MAIN_PICKER_SOURCE_LAZER)}
                    </Button>
                </Stack>
            </BaseDialog>
            <BaseDialog
                open={overwriteDialog.open}
                onClose={() => {
                    pendingSaveRef.current = null;
                    setOverwriteDialog({ open: false, name: "" });
                }}
                title={__(I18nStrings.MAIN_PICKER_PROFILE_OVERWRITE_TITLE)}
                actions={
                    <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => {
                                pendingSaveRef.current = null;
                                setOverwriteDialog({ open: false, name: "" });
                            }}
                        >
                            {__(I18nStrings.BTN_CANCEL)}
                        </Button>
                        <Button
                            variant="contained"
                            color="error"
                            fullWidth
                            onClick={async () => {
                                const pending = pendingSaveRef.current;
                                if (pending) await doSaveProfile(pending.name, pending.profile);
                                pendingSaveRef.current = null;
                                setOverwriteDialog({ open: false, name: "" });
                            }}
                        >
                            {__(I18nStrings.BTN_OK)}
                        </Button>
                    </Stack>
                }
            >
                <Typography variant="body2">
                    {__(I18nStrings.MAIN_PICKER_PROFILE_OVERWRITE_DESC).replace(":name", overwriteDialog.name)}
                </Typography>
            </BaseDialog>
            <CurrentlyPlayingBeatmap
                maps={maps}
                osuPath={g.config?.[ConfigKey.PATH_STABLE_DIR] ?? ""}
                onOpenMap={setPlayingMap}
            />
            <BeatmapResultDrawer
                map={pickedMap}
                displaySR={pickedMap ? get_effective_sr(pickedMap, selectedModesSet) : 0}
                osuPath={g.config?.[ConfigKey.PATH_STABLE_DIR] ?? ""}
                collections={collections}
                scoresByHash={scoresByHash}
                onScoresNeeded={ensureAllScoresForMap}
                onClose={() => setPickedMap(null)}
            />
            <BeatmapResultDrawer
                map={playingMap}
                displaySR={playingMap ? get_effective_sr(playingMap, selectedModesSet) : 0}
                osuPath={g.config?.[ConfigKey.PATH_STABLE_DIR] ?? ""}
                collections={collections}
                scoresByHash={scoresByHash}
                onScoresNeeded={ensureAllScoresForMap}
                onClose={() => setPlayingMap(null)}
            />
            <BeatmapResultDrawer
                map={selectedHistoryMap}
                displaySR={selectedHistoryMap ? get_effective_sr(selectedHistoryMap, selectedModesSet) : 0}
                osuPath={g.config?.[ConfigKey.PATH_STABLE_DIR] ?? ""}
                collections={collections}
                scoresByHash={scoresByHash}
                onScoresNeeded={ensureAllScoresForMap}
                onClose={() => setSelectedHistoryMap(null)}
            />
            <ScrollAdjustDrawer open={showFilteredList} onClose={() => setShowFilteredList(false)}>
                {() => (
                    <>
                        <Box sx={{ flex: 1, minHeight: 0, px: 2, pt: 0.5 }}>
                            <DataViewer
                                heads={[
                                    {
                                        name: __(I18nStrings.MAIN_PICKER_FILTER_POOL_TITLE),
                                        type: "string",
                                        key: "title",
                                        width: "40%",
                                        render: (row) => (
                                            <Box
                                                sx={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    pr: 1,
                                                }}
                                            >
                                                {row.title}
                                            </Box>
                                        ),
                                    },
                                    {
                                        name: __(I18nStrings.MAIN_PICKER_FILTER_POOL_DIFFICULTY),
                                        type: "string",
                                        key: "difficulty",
                                        width: "30%",
                                        render: (row) => (
                                            <Box
                                                sx={{
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    pr: 1,
                                                }}
                                            >
                                                {row.difficulty}
                                            </Box>
                                        ),
                                    },
                                    {
                                        name: <Star sx={{ fontSize: 16, verticalAlign: "middle" }} />,
                                        type: "string",
                                        key: "sr",
                                        width: "12%",
                                        align: "right",
                                    },
                                    {
                                        name: __(I18nStrings.MAIN_PICKER_FILTER_POOL_PROBABILITY),
                                        type: "string",
                                        key: "probability",
                                        width: "18%",
                                        align: "right",
                                        render: (row) => `${row.probability}%`,
                                    },
                                ]}
                                rows={filteredPool.map(({ map, probability }) => ({
                                    title: `${map.artist ?? ""} - ${map.songTitle ?? ""}`,
                                    difficulty: map.difficultyName,
                                    sr: get_effective_sr(map, selectedModesSet).toFixed(2),
                                    probability: probability.toFixed(3),
                                    _map: map,
                                    _onlineOnly: map._onlineOnly ?? false,
                                }))}
                                rows_total={filteredPool.length}
                                rowHeight={36}
                                size="small"
                                onRowClick={(row) => {
                                    setShowFilteredList(false);
                                    if (row._onlineOnly) {
                                        window.olsCore.openBeatmapPage(row._map.beatmapId);
                                    } else if (source === "lazer") {
                                        void fetchLazerBeatmapDetail({
                                            md5Hash: row._map.md5Hash,
                                            beatmapId: row._map.beatmapId > 0 ? row._map.beatmapId : undefined,
                                        }).then((detail) => setPickedMap(detail ?? row._map));
                                    } else {
                                        setPickedMap(row._map);
                                    }
                                }}
                            />
                        </Box>
                        <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "text.secondary",
                                }}
                            >
                                {__(I18nStrings.BTN_PICKER_ROLL)}: {countLabel}
                            </Typography>
                        </Box>
                    </>
                )}
            </ScrollAdjustDrawer>
            {state === IBPState.None && (
                <Observer>
                    {() =>
                        g.config?.[ConfigKey.PATH_STABLE_DIR] ? null : (
                            <Alert severity="warning" sx={{ mx: 2 }}>
                                {__(I18nStrings.MAIN_PICKER_PATH_REQUIRED)}
                            </Alert>
                        )
                    }
                </Observer>
            )}
            <Box
                ref={rollAreaRef}
                sx={{
                    position: "relative",
                    display: "flex",
                    height: "100%",
                    minHeight: "34rem",
                    ...(rollAreaWidth > 0 && { maxHeight: Math.floor(rollAreaWidth * (1 / 3)) }),
                    opacity: rollAreaWidth > 0 ? 1 : 0,
                    transition: "opacity 0.3s ease",
                }}
            >
                <Box
                    sx={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: "8px 0 0 8px",
                        overflow: "hidden",
                        boxShadow: 3,
                    }}
                >
                    {renderPanelButton("filter", "top")}
                    {lazerEnabled && state === IBPState.Loaded && (
                        <Button
                            variant="contained"
                            onClick={() => setSourceDialogOpen(true)}
                            sx={{
                                flexGrow: 0.3,
                                flexBasis: 0,
                                borderRadius: 0,
                                minWidth: 68,
                                py: 0.5,
                                marginBottom: "-1px",
                                "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(-8px)" },
                                ...(source === "lazer" ? pickerLazerSx : pickerAccentSx),
                            }}
                        >
                            <Box
                                className="btn-inner"
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    width: "55%",
                                    bottom: 0,
                                    left: 12,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 0.5,
                                    transition: "transform 0.18s ease",
                                    pointerEvents: "none",
                                }}
                            >
                                <SwapHoriz fontSize="small" />
                                <Typography
                                    variant="caption"
                                    sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}
                                >
                                    {source === "lazer"
                                        ? __(I18nStrings.MAIN_PICKER_SOURCE_LAZER_MODE)
                                        : __(I18nStrings.MAIN_PICKER_SOURCE_STABLE_MODE)}
                                </Typography>
                            </Box>
                        </Button>
                    )}
                    {renderPanelButton("collection", "bottom")}
                </Box>
                {(state === IBPState.Loading || isRolling) && (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            zIndex: 5,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: state === IBPState.Loading ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.62)",
                            color: "text.primary",
                            backdropFilter: "blur(6px)",
                            ".dark &": {
                                bgcolor: state === IBPState.Loading ? "rgba(23,21,29,0.88)" : "rgba(23,21,29,0.72)",
                            },
                        }}
                    >
                        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
                            <CircularProgress
                                size={state === IBPState.Loading ? 48 : 32}
                                sx={{ animationPlayState: isPageVisible ? "running" : "paused" }}
                            />
                            <Typography variant="body2" color="text.primary">
                                {state === IBPState.Loading
                                    ? __(I18nStrings.MAIN_SRS_READING_LOCAL)
                                    : __(I18nStrings.MAIN_PICKER_ROLL_ROLLING)}
                            </Typography>
                        </Stack>
                    </Box>
                )}
                {isRolling && (
                    <Stack
                        direction="row"
                        spacing={0}
                        sx={{
                            position: "absolute",
                            left: "50%",
                            top: 16,
                            transform: "translateX(-50%)",
                            zIndex: 6,
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 0.75,
                            borderRadius: 999,
                            pointerEvents: "none",
                            backgroundColor: "rgba(212, 201, 231, 0.82)",
                            color: "#3B3150",
                            border: "1px solid #B0A1C7",
                            backdropFilter: "blur(4px)",
                            ".dark &": {
                                backgroundColor: "rgba(57, 51, 73, 0.82)",
                                color: "#E6E2EF",
                                borderColor: "#756691",
                            },
                        }}
                    >
                        <CircularProgress
                            size={16}
                            thickness={5}
                            sx={{
                                color: "inherit",
                                animationPlayState: isPageVisible ? "running" : "paused",
                            }}
                        />
                        <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1 }}>
                            {__(I18nStrings.MAIN_PICKER_ROLL_ROLLING)}
                        </Typography>
                    </Stack>
                )}

                <Box
                    sx={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        aspectRatio: "1",
                        height: "100%",
                        zIndex: 2,
                        flexShrink: 0,
                    }}
                >
                    <Box
                        ref={ringRef}
                        sx={{
                            position: "absolute",
                            inset: "-0.5rem",
                            borderRadius: "50%",
                            overflow: "hidden",
                            opacity: state === IBPState.Loaded && effectivePickableCount > 0 ? 1 : 0,
                            transition: "opacity 0.3s ease",
                            filter: "blur(1px)",
                            pointerEvents: "none",
                        }}
                    >
                        <Box
                            ref={ringInnerRef}
                            sx={{
                                position: "absolute",
                                inset: 0,
                                background:
                                    "conic-gradient(from 0deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.85) 15%, rgba(255,255,255,0.15) 30%, rgba(255,255,255,0.85) 45%, rgba(255,255,255,0.05) 60%, rgba(255,255,255,0.72) 75%, rgba(255,255,255,0.15) 90%, rgba(255,255,255,0.05) 100%)",
                                willChange: "transform",
                            }}
                        />
                    </Box>
                    <Button
                        variant="contained"
                        disabled={
                            state === IBPState.Loading ||
                            (state === IBPState.Loaded && effectivePickableCount === 0) ||
                            (g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "").length === 0
                        }
                        sx={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            fontSize: "1.2rem",
                            flexDirection: "column",
                            gap: 0.5,
                            position: "relative",
                            overflow: "hidden",
                            transition: "box-shadow 0.2s ease, background-color 0.2s ease",
                            animation: isRolling ? `${rollPop} 0.65s ease-out` : "none",
                            animationPlayState: isPageVisible ? "running" : "paused",
                            ...pickerAccentSx,
                            ...pickerDisabledSx,
                            "&:not(.Mui-disabled):hover": {
                                boxShadow: (theme) =>
                                    `0 0 0 8px ${theme.palette.background.default}, 0px 12px 36px rgba(0,0,0,0.5)`,
                                animation: isRolling
                                    ? `${rollPop} 0.65s ease-out`
                                    : `${rollBreathe} 2.8s ease-in-out infinite`,
                                animationPlayState: isPageVisible ? "running" : "paused",
                                "& .roll-shine": {
                                    opacity: 1,
                                    animation: `${shineSweep} 1.2s ease-in-out forwards`,
                                    animationPlayState: isPageVisible ? "running" : "paused",
                                },
                            },
                            "&:not(.Mui-disabled):active": {
                                boxShadow: (theme) =>
                                    `0 0 0 8px ${theme.palette.background.default}, 0px 6px 18px rgba(0,0,0,0.4)`,
                            },
                        }}
                        onClick={state === IBPState.Loaded ? onBtnRoll : onBtnClickedByInit}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (state === IBPState.Loaded) setShowFilteredList(true);
                        }}
                    >
                        <span
                            style={{
                                opacity: state === IBPState.Loaded && effectivePickableCount === 0 ? 0.3 : 1,
                                transition: "opacity 0.3s ease",
                            }}
                        >
                            {state === IBPState.Loaded
                                ? __(I18nStrings.BTN_PICKER_ROLL)
                                : __(I18nStrings.BTN_PICKER_READ)}
                        </span>
                        {state === IBPState.Loaded && (
                            <Typography
                                variant="caption"
                                sx={{
                                    fontSize: "0.65rem",
                                    opacity: effectivePickableCount === 0 ? 0.3 : 0.8,
                                    lineHeight: 1,
                                    transition: "opacity 0.3s ease",
                                }}
                            >
                                {countLabel}
                            </Typography>
                        )}
                        {state === IBPState.Loaded && effectivePickableCount === 0 && (
                            <Box
                                component="span"
                                sx={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                    userSelect: "none",
                                    zIndex: 1,
                                }}
                            >
                                <Box
                                    component="span"
                                    sx={{
                                        fontSize: "180%",
                                        whiteSpace: "nowrap",
                                        display: "inline-block",
                                        animation: `${catProwl} 4s ease-in-out infinite`,
                                        animationPlayState: isPageVisible ? "running" : "paused",
                                    }}
                                >
                                    {"= ᗜ ω ᗜ.="}
                                </Box>
                            </Box>
                        )}
                        <Box
                            className="roll-shine"
                            sx={{
                                position: "absolute",
                                top: 0,
                                left: "-60%",
                                width: "50%",
                                height: "100%",
                                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                                transform: "skewX(-20deg)",
                                opacity: 0,
                                pointerEvents: "none",
                            }}
                        />
                    </Button>
                </Box>

                <Box
                    sx={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: "0 8px 8px 0",
                        overflow: "hidden",
                        boxShadow: 3,
                    }}
                >
                    {(["weight", "wishlist", "history"] as const).map((panel) => (
                        <Button
                            key={panel}
                            variant="contained"
                            disabled={state !== IBPState.Loaded}
                            onClick={() => setActivePanel(activePanel === panel ? null : panel)}
                            sx={{
                                flex: 1,
                                borderRadius: panel === "weight" ? "0 8px 0 0" : 0,
                                minWidth: 68,
                                py: 1.5,
                                marginBottom: "-1px",
                                "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(8px)" },
                                ...(activePanel === panel ? pickerAccentSx : pickerNeutralSx),
                                ...pickerDisabledSx,
                            }}
                        >
                            <Box
                                className="btn-inner"
                                sx={{
                                    position: "absolute",
                                    top: 0,
                                    width: "55%",
                                    bottom: 0,
                                    right: 12,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 0.5,
                                    transition: "transform 0.18s ease",
                                    pointerEvents: "none",
                                }}
                            >
                                {panel === "weight" ? <Balance /> : panel === "wishlist" ? <Star /> : <History />}
                                <Typography
                                    variant="caption"
                                    sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}
                                >
                                    {panel === "weight"
                                        ? __(I18nStrings.BTN_PICKER_WEIGHT)
                                        : panel === "wishlist"
                                          ? __(I18nStrings.BTN_PICKER_WISHLIST)
                                          : __(I18nStrings.BTN_PICKER_HISTORY)}
                                </Typography>
                            </Box>
                        </Button>
                    ))}
                    <Button
                        variant="contained"
                        disabled={state !== IBPState.Loaded}
                        onClick={() => setActivePanel(activePanel === "profiles" ? null : "profiles")}
                        sx={{
                            flex: 1,
                            borderRadius: 0,
                            minWidth: 68,
                            py: 1.5,
                            marginBottom: "-1px",
                            ...pickerAccentSx,
                            ...pickerDisabledSx,
                            "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(8px)" },
                        }}
                    >
                        <Box
                            className="btn-inner"
                            sx={{
                                position: "absolute",
                                top: 0,
                                width: "55%",
                                bottom: 0,
                                right: 12,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.5,
                                transition: "transform 0.18s ease",
                                pointerEvents: "none",
                            }}
                        >
                            <AccountBox />
                            <Typography
                                variant="caption"
                                sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}
                            >
                                {__(I18nStrings.BTN_PICKER_PROFILES)}: {activeProfileId}
                            </Typography>
                        </Box>
                    </Button>
                    <Button
                        variant="contained"
                        disabled={state !== IBPState.Loaded || history.length === 0}
                        onClick={() =>
                            g.setDialog(true, {
                                content: __(I18nStrings.MAIN_PICKER_HISTORY_CLEAR_CONFIRM),
                                actions: [
                                    { label: __(I18nStrings.BTN_CANCEL), callback: () => g.setDialog(false) },
                                    {
                                        label: __(I18nStrings.BTN_CONFIRM),
                                        callback: () => {
                                            onClearHistory();
                                            g.setDialog(false);
                                        },
                                    },
                                ],
                            })
                        }
                        sx={{
                            flex: 1,
                            borderRadius: "0 0 8px 0",
                            minWidth: 68,
                            py: 1.5,
                            ...pickerDangerSx,
                            ...pickerDisabledSx,
                            "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(8px)" },
                        }}
                    >
                        <Box
                            className="btn-inner"
                            sx={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                width: "55%",
                                right: 12,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.5,
                                transition: "transform 0.18s ease",
                                pointerEvents: "none",
                            }}
                        >
                            <DeleteSweep />
                            <Typography
                                variant="caption"
                                sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}
                            >
                                {__(I18nStrings.BTN_PICKER_CLEAR_HISTORY)}
                            </Typography>
                        </Box>
                    </Button>
                </Box>
            </Box>
            <ScrollAdjustDrawer open={activePanel !== null} onClose={() => setActivePanel(null)} keepMounted>
                {(ctx) => (
                    <Box ref={ctx.contentRef} sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                        <Box
                            sx={{
                                display: activePanel === "filter" || activePanel === "collection" ? "block" : "none",
                            }}
                        >
                            <BeatmapPickerFilterPanel
                                key={`${activeProfileId}-${String(profileLoaded)}`}
                                collections={collections}
                                activeSection={activePanel === "collection" ? "collection" : "filter"}
                                generalFilter={generalFilter}
                                generalSubFilter={generalSubFilter}
                                includedCollections={includedCollections}
                                excludedCollections={excludedCollections}
                                onGeneralFilterChanged={setGeneralFilter}
                                onGeneralSubFilterChanged={setGeneralSubFilter}
                                onIncludedCollectionsChanged={setIncludedCollections}
                                onExcludedCollectionsChanged={setExcludedCollections}
                            />
                        </Box>
                        <Box
                            sx={{
                                display:
                                    activePanel === "weight" || activePanel === "wishlist" || activePanel === "history"
                                        ? "block"
                                        : "none",
                                height: "100%",
                            }}
                        >
                            <BeatmapPickerAdvancedPanel
                                collections={collections}
                                history={history}
                                settings={advancedSettings}
                                section={
                                    activePanel === "weight"
                                        ? "weight"
                                        : activePanel === "wishlist"
                                          ? "wishlist"
                                          : activePanel === "history"
                                            ? "history"
                                            : undefined
                                }
                                onSettingsChanged={setAdvancedSettings}
                                onClearHistory={onClearHistory}
                                onHistoryItemClick={onHistoryItemClick}
                            />
                        </Box>
                        <Box
                            sx={{
                                display: activePanel === "profiles" ? "flex" : "none",
                                flexDirection: "column",
                                height: "100%",
                                p: 1,
                                gap: 1,
                            }}
                        >
                            <Typography
                                variant="subtitle2"
                                sx={{
                                    color: "text.secondary",
                                    textAlign: "center",
                                    flexShrink: 0,
                                }}
                            >
                                {__(I18nStrings.BTN_PICKER_PROFILES)}
                            </Typography>
                            <Divider sx={{ flexShrink: 0 }} />
                            <Stack direction="row" spacing={1}>
                                <TextField
                                    size="small"
                                    sx={{ flexGrow: 1 }}
                                    label={__(I18nStrings.MAIN_PICKER_PROFILE_NAME)}
                                    value={newProfileName}
                                    onChange={(e) => setNewProfileName(e.target.value)}
                                />
                                <Button
                                    variant="outlined"
                                    size="small"
                                    disabled={!newProfileName.trim()}
                                    onClick={onSaveProfile}
                                >
                                    {__(I18nStrings.MAIN_PICKER_PROFILE_SAVE)}
                                </Button>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    fullWidth
                                    onClick={onExportProfiles}
                                    disabled={profiles.length === 0}
                                >
                                    {__(I18nStrings.MAIN_PICKER_PROFILE_EXPORT)}
                                </Button>
                                <Button variant="outlined" size="small" fullWidth onClick={onImportProfiles}>
                                    {__(I18nStrings.MAIN_PICKER_PROFILE_IMPORT)}
                                </Button>
                            </Stack>
                            <Divider />
                            <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
                                <Stack spacing={2}>
                                    {profiles.length === 0 && (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: "text.secondary",
                                                textAlign: "center",
                                                display: "block",
                                            }}
                                        >
                                            -
                                        </Typography>
                                    )}
                                    {profiles.map((profileId) => (
                                        <Stack
                                            key={profileId}
                                            direction="row"
                                            spacing={1}
                                            sx={{
                                                alignItems: "center",
                                                px: 1,
                                                py: 0.5,
                                                border: "1px solid",
                                                borderColor: profileId === activeProfileId ? "primary.main" : "divider",
                                                borderRadius: 1,
                                            }}
                                        >
                                            <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
                                                {profileId}
                                            </Typography>
                                            {profileId === activeProfileId && (
                                                <Chip
                                                    label={__(I18nStrings.MAIN_PICKER_PROFILE_ACTIVE)}
                                                    size="small"
                                                    color="primary"
                                                    variant="outlined"
                                                />
                                            )}
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={async () => {
                                                    await onLoadProfile(profileId);
                                                    setActivePanel(null);
                                                }}
                                            >
                                                {__(I18nStrings.MAIN_PICKER_PROFILE_LOAD)}
                                            </Button>
                                            <IconButton
                                                size="small"
                                                onClick={() =>
                                                    setNameDialog({
                                                        open: true,
                                                        mode: "clone",
                                                        sourceId: profileId,
                                                        newName: `${profileId}_copy`,
                                                    })
                                                }
                                            >
                                                <ContentCopy fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() =>
                                                    setNameDialog({
                                                        open: true,
                                                        mode: "rename",
                                                        sourceId: profileId,
                                                        newName: profileId,
                                                    })
                                                }
                                            >
                                                <DriveFileRenameOutline fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => onDeleteProfile(profileId)}
                                            >
                                                <DeleteSweep fontSize="small" />
                                            </IconButton>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>
                        </Box>
                    </Box>
                )}
            </ScrollAdjustDrawer>
        </>
    );
};
