import {
    AccountBox,
    Balance,
    ContentCopy,
    DeleteSweep,
    FilterList,
    FolderSpecial,
    History,
    KeyboardArrowDown,
    KeyboardArrowUp,
    Language,
    MusicNote,
    Star,
} from "@mui/icons-material";
import {
    Box,
    Button,
    Chip,
    Collapse,
    Divider,
    Drawer,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import ReactECharts from "echarts-for-react";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AutoSizer, List } from "react-virtualized";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { StableBeatmapDetail, StableBeatmapFilter } from "../../defines/stable_structs";
import { IOsuCollection } from "../../defines/types";
import { getYinMoChanceExperiment } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { OsuBeatmap, OsuData, OsuScore } from "../../utils/osu";
import { yieldToMain } from "../../utils/reader";
import { formatDateTime, formatTimeAgo } from "../../utils/time";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { FilterType, TFilterSetting } from "./beatmapFilter";
import { BeatmapPickerAdvancedPanel } from "./beatmapPickerAdvancedPanel";
import { BeatmapPickerFilterPanel } from "./beatmapPickerFilterPanel";
import {
    BeatmapDataField,
    BoolCondition,
    DateCondition,
    HistoryCondition,
    IPickerAdvancedSettings,
    IPickerHistory,
    IPickerProfile,
    IWeightBeatmapCondition,
    IWeightHistoryCondition,
    IWeightScoreCondition,
    IWishlistConditionItem,
    IWishlistEntry,
    NumberCondition,
    PickerTargetType,
    ScoreRecordField,
    StringCondition,
} from "./beatmapPickerTypes";

type IBeatmapData = OsuBeatmap;

interface IBeatmapPickerViewProps {}

const HISTORY_MAX = 200;

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

const guessMimeTypeFromPath = (filePath: string) => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "gif":
            return "image/gif";
        case "bmp":
            return "image/bmp";
        case "mp3":
            return "audio/mpeg";
        case "ogg":
            return "audio/ogg";
        case "wav":
            return "audio/wav";
        case "flac":
            return "audio/flac";
        default:
            return "application/octet-stream";
    }
};

const formatDrain = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
};

const extractHashes = (maps: any[]): Set<string> =>
    new Set(maps.map((m: any) => (typeof m === "string" ? m : m.checksum)));

const MOD_BITS: [number, string][] = [
    [1, "NF"],
    [2, "EZ"],
    [8, "HD"],
    [16, "HR"],
    [32, "SD"],
    [64, "DT"],
    [128, "RX"],
    [256, "HT"],
    [512, "NC"],
    [1024, "FL"],
    [4096, "SO"],
    [16384, "AP"],
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
}

export function makeScorePPKey(s: { md5Hash: string; totalScore: number; date: Date; maxCombo: number }): string {
    return `${s.md5Hash}-${s.totalScore}-${s.date.getTime()}-${s.maxCombo}`;
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
}

export const ScoreRecordTable: React.FC<ScoreRecordTableProps> = ({
    scores,
    ppMap,
    sortBy = "score",
    showBeatmapLabel = false,
    onRowClick,
    onRowHover,
    onVisibleKeysChange,
    highlightKey,
}) => {
    const sorted = React.useMemo(
        () =>
            [...scores].sort((a, b) =>
                sortBy === "date" ? b.date.getTime() - a.date.getTime() : b.totalScore - a.totalScore,
            ),
        [scores, sortBy],
    );

    const rowRefs = React.useRef<Map<string, Element>>(new Map());
    const onVisibleKeysChangeRef = React.useRef(onVisibleKeysChange);
    React.useEffect(() => {
        onVisibleKeysChangeRef.current = onVisibleKeysChange;
    }, [onVisibleKeysChange]);

    React.useEffect(() => {
        if (!onVisibleKeysChangeRef.current) return;
        const visibleKeys = new Set<string>();
        const obs = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const key = (entry.target as HTMLElement).dataset.ppkey!;
                    if (entry.isIntersecting) visibleKeys.add(key);
                    else visibleKeys.delete(key);
                }
                onVisibleKeysChangeRef.current?.([...visibleKeys]);
            },
            { threshold: 0.01 },
        );
        for (const [, el] of rowRefs.current) obs.observe(el);
        return () => obs.disconnect();
    }, [sorted]);

    const setRowRef = React.useCallback((key: string, el: HTMLTableRowElement | null) => {
        if (el) rowRefs.current.set(key, el);
        else rowRefs.current.delete(key);
    }, []);

    const scrollToKey = React.useCallback((key: string) => {
        const el = rowRefs.current.get(key);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, []);

    return (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ bgcolor: "background.paper" }}>評價</TableCell>
                        {showBeatmapLabel && <TableCell sx={{ bgcolor: "background.paper" }}>曲目</TableCell>}
                        <TableCell sx={{ bgcolor: "background.paper" }}>分數</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>300</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>100</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>50</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>Miss</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>最大連擊</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>準確率</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>模式</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>Mods</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>PP</TableCell>
                        <TableCell sx={{ bgcolor: "background.paper" }}>時間</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sorted.map((s) => {
                        const total = s.count300 + s.count100 + s.count50 + s.countMiss;
                        const acc =
                            total > 0
                                ? ((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100
                                : 0;
                        const grade = calcGrade(s);
                        const modsLabel = calcModsLabel(s.mods);
                        const ppKey = makeScorePPKey(s);
                        const ppResult = ppMap.get(ppKey);
                        return (
                            <TableRow
                                key={ppKey}
                                ref={(el) => setRowRef(ppKey, el)}
                                data-ppkey={ppKey}
                                hover
                                sx={{
                                    cursor: onRowClick ? "pointer" : "default",
                                    ...(highlightKey === ppKey && {
                                        outline: "2px solid",
                                        outlineColor: "primary.light",
                                        outlineOffset: "-2px",
                                        bgcolor: "rgba(25, 118, 210, 0.15)",
                                    }),
                                }}
                                onMouseEnter={() => onRowHover?.(ppKey)}
                                onMouseLeave={() => onRowHover?.(null)}
                                onClick={() => {
                                    onRowClick?.(s);
                                    scrollToKey(ppKey);
                                }}
                            >
                                <TableCell sx={{ color: GRADE_COLORS[grade] ?? "inherit", fontWeight: "bold" }}>
                                    {grade}
                                </TableCell>
                                {showBeatmapLabel && (
                                    <TableCell
                                        sx={{
                                            maxWidth: 280,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {s.beatmapLabel ?? s.md5Hash}
                                    </TableCell>
                                )}
                                <TableCell>{s.totalScore.toLocaleString()}</TableCell>
                                <TableCell sx={{ color: "#3498db" }}>{s.count300}</TableCell>
                                <TableCell sx={{ color: "#2ecc71" }}>{s.count100}</TableCell>
                                <TableCell sx={{ color: "#f39c12" }}>{s.count50}</TableCell>
                                <TableCell sx={{ color: "#e74c3c" }}>{s.countMiss}</TableCell>
                                <TableCell>{s.maxCombo}x</TableCell>
                                <TableCell>{acc.toFixed(2)}%</TableCell>
                                <TableCell>{RULESET_LABELS[s.ruleset] ?? `M${s.ruleset}`}</TableCell>
                                <TableCell>{modsLabel}</TableCell>
                                <TableCell>
                                    {ppResult === undefined ? (
                                        "..."
                                    ) : ppResult.aim !== undefined ? (
                                        <Tooltip
                                            title={`Aim: ${ppResult.aim.toFixed(0)}  Speed: ${ppResult.speed?.toFixed(0)}  Acc: ${ppResult.acc?.toFixed(0)}`}
                                        >
                                            <span>{ppResult.pp.toFixed(0)}pp</span>
                                        </Tooltip>
                                    ) : (
                                        `${ppResult.pp.toFixed(0)}pp`
                                    )}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                                    <Tooltip title={s.date ? formatDateTime(s.date.getTime()) : null}>
                                        <span>{s.date ? formatTimeAgo(s.date.getTime()) : "-"}</span>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const GRADE_COLORS: Record<string, string> = {
    SS: "#cd1b9c",
    S: "#16b5c2",
    A: "#83d430",
    B: "#e2b03e",
    C: "#e9784e",
    D: "#dd474d",
};

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
        const accData = sorted.map((s) => {
            const total = s.count300 + s.count100 + s.count50 + s.countMiss;
            return total > 0
                ? +(((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100).toFixed(2)
                : 0;
        });
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
                axisPointer: { type: "shadow" },
                formatter: (params: any[]) => {
                    const idx = params[0]?.dataIndex ?? 0;
                    const s = sorted[idx];
                    const total = s.count300 + s.count100 + s.count50 + s.countMiss;
                    const acc =
                        total > 0
                            ? (((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100).toFixed(
                                  2,
                              )
                            : "0.00";
                    const lines = [
                        `<b>${labels[idx]}</b>`,
                        `<span style="color:#3498db">▪ 300: ${s.count300}</span>`,
                        `<span style="color:#2ecc71">▪ 100: ${s.count100}</span>`,
                        `<span style="color:#f39c12">▪ 50:  ${s.count50}</span>`,
                        `<span style="color:#e74c3c">▪ Miss: ${s.countMiss}</span>`,
                        `<span style="color:#9b59b6">▪ 最大連擊: ${s.maxCombo}x</span>`,
                        `<span style="color:${ACC_COLOR}">▪ 準確率: ${acc}%</span>`,
                    ];
                    return lines.join("<br/>");
                },
            },
            legend: {
                data: ["300", "100", "50", "Miss", "最大連擊", "準確率"],
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
                    name: "命中數",
                    nameTextStyle: { fontSize: 10 },
                    axisLabel: { fontSize: 10 },
                    splitLine: { lineStyle: { opacity: 0.3 } },
                },
                {
                    type: "value",
                    name: "%",
                    nameTextStyle: { fontSize: 10, color: ACC_COLOR },
                    axisLabel: { fontSize: 10, color: ACC_COLOR, formatter: (v: number) => `${v}%` },
                    min: accYMin,
                    max: accYMax,
                    splitLine: { show: false },
                },
                {
                    type: "value",
                    show: false,
                    min: 0,
                    max: maxComboVal * 1.1,
                },
            ],
            series: [
                {
                    name: "300",
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data300,
                    itemStyle: { color: "#3498db" },
                },
                {
                    name: "100",
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data100,
                    itemStyle: { color: "#2ecc71" },
                },
                {
                    name: "50",
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: data50,
                    itemStyle: { color: "#f39c12" },
                },
                {
                    name: "Miss",
                    type: "bar",
                    stack: "hits",
                    yAxisIndex: 0,
                    data: dataMiss,
                    itemStyle: { color: "#e74c3c" },
                },
                {
                    name: "最大連擊",
                    type: "line",
                    yAxisIndex: 2,
                    data: comboData,
                    symbol: "circle",
                    symbolSize: 5,
                    lineStyle: { color: "#9b59b6", type: "dashed" },
                    itemStyle: { color: "#9b59b6" },
                },
                {
                    name: "準確率",
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
}
const ScoreSection: React.FC<ScoreSectionProps> = ({ scores, ppMap }) => {
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
            />
        </>
    );
};

const RULESET_LABELS: Record<number, string> = { 0: "osu!", 1: "Taiko", 2: "Catch", 3: "Mania" };
const calcModsLabel = (mods: number) =>
    mods === 0
        ? "-"
        : MOD_BITS.filter(([bit]) => (mods & bit) !== 0)
              .map(([, name]) => name)
              .join(",");
const calcGrade = (s: { count300: number; count100: number; count50: number; countMiss: number }) => {
    const total = s.count300 + s.count100 + s.count50 + s.countMiss;
    if (total === 0) return "D";
    const acc = ((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100;
    const ratio300 = s.count300 / total;
    const ratio50 = s.count300 + s.count100 + s.count50 > 0 ? s.count50 / (s.count300 + s.count100 + s.count50) : 0;
    if (acc >= 100) return "SS";
    if (acc >= 90 && s.countMiss === 0 && ratio50 <= 0.01) return "S";
    if (acc >= 80 || (ratio300 >= 0.9 && s.countMiss === 0)) return "A";
    if (acc >= 70 || (ratio300 >= 0.8 && s.countMiss === 0)) return "B";
    if (acc >= 60) return "C";
    return "D";
};

export interface IBeatmapResultDrawerProps {
    map: IBeatmapData | null;
    displaySR: number;
    osuPath: string;
    collections: IOsuCollection[];
    scoresByHash: Map<string, OsuScore[]>;
    onClose: () => void;
}

export const BeatmapResultDrawer: React.FC<IBeatmapResultDrawerProps> = ({
    map,
    displaySR,
    osuPath,
    collections,
    scoresByHash,
    onClose,
}) => {
    const [bgUrl, setBgUrl] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [copyDone, setCopyDone] = useState(false);
    const [showScores, setShowScores] = useState(false);
    const [ppInfo, setPpInfo] = useState<
        { maxPP: number; stars: number; maxAim?: number; maxSpeed?: number; maxAcc?: number } | null | undefined
    >(undefined);
    const [scorePPs, setScorePPs] = useState<Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>>(
        new Map(),
    );
    const mapScores: OsuScore[] = map ? (scoresByHash.get(map.md5Hash) ?? []) : [];
    const scoreRows: ScoreRecordRow[] = mapScores.map((s) => ({ ...s, md5Hash: map?.md5Hash ?? s.md5Hash }));
    const latestScoreDate =
        mapScores.length > 0 ? mapScores.reduce((best, s) => (s.date > best ? s.date : best), mapScores[0].date) : null;
    const effectiveUnplayed = map ? (mapScores.length > 0 ? false : map.unplayed) : false;
    const effectiveLastPlayedTime = map
        ? latestScoreDate && (!map.lastPlayedTime || latestScoreDate > map.lastPlayedTime)
            ? latestScoreDate
            : map.lastPlayedTime
        : null;
    const inCollections = map
        ? collections.filter((c) => extractHashes(c.maps).has(map.md5Hash)).map((c) => c.name)
        : [];

    useEffect(() => {
        let cancelled = false;
        setBgUrl(null);
        setAudioUrl(null);
        setShowScores(false);
        setPpInfo(undefined);
        setScorePPs(new Map());

        if (!map || !osuPath) {
            return;
        }

        const loadAssets = async () => {
            const detail: StableBeatmapDetail | null = await window.olsCore.getStableBeatmapDetail(map.md5Hash);
            if (!detail || cancelled) return;

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

            const osuFilePath = `${osuPath}/Songs/${detail.path}/${detail.osuFileName}`;
            const osuFile = await window.olsCore.readFile(osuFilePath, "utf8");
            if (cancelled || typeof osuFile !== "string") return;

            const line = osuFile.split(/\r?\n/).find((l) => /^0,0,"/.test(l.trim()));
            const match = line ? /^0,0,"([^"]+)"/.exec(line.trim()) : null;
            if (match?.[1]) {
                const bgPath = `${osuPath}/Songs/${detail.path}/${match[1]}`;
                const bgBase64 = await window.olsCore.readFile(bgPath, "base64");
                if (!cancelled && typeof bgBase64 === "string") {
                    setBgUrl(`data:${guessMimeTypeFromPath(bgPath)};base64,${bgBase64}`);
                }
            }

            const audioPath = `${osuPath}/Songs/${detail.path}/${detail.audioFileName}`;
            const audioBase64 = await window.olsCore.readFile(audioPath, "base64");
            if (!cancelled && typeof audioBase64 === "string") {
                setAudioUrl(`data:${guessMimeTypeFromPath(audioPath)};base64,${audioBase64}`);
            }
        };

        loadAssets().catch(() => {
            if (!cancelled) {
                setBgUrl(null);
                setAudioUrl(null);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [map, osuPath]);

    useEffect(() => {
        if (!showScores || !map || mapScores.length === 0) return;
        let cancelled = false;
        (async () => {
            const results = new Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>();
            for (const s of mapScores) {
                if (cancelled) break;
                const key = makeScorePPKey({
                    md5Hash: map!.md5Hash,
                    totalScore: s.totalScore,
                    date: s.date,
                    maxCombo: s.maxCombo,
                });
                const result = await window.olsCore.calcPP({
                    md5Hash: map.md5Hash,
                    mods: s.mods,
                    combo: s.maxCombo,
                    n300: s.count300,
                    n100: s.count100,
                    n50: s.count50,
                    misses: s.countMiss,
                    totalScore: s.totalScore,
                    beatmapId: map.beatmapId,
                    ar: map.ar,
                    od: map.od,
                    nCircles: map.numCircles,
                    nSliders: map.numSliders,
                    ruleset: map.mode,
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
    }, [showScores, map, mapScores]);

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
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
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
        <Drawer
            anchor="bottom"
            open={map !== null}
            onClose={onClose}
            sx={{ "& .MuiDrawer-paper": { height: "72vh", display: "flex", flexDirection: "column" } }}
        >
            {map && (
                <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
                    <Box
                        sx={{
                            position: "relative",
                            height: 130,
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
                            {audioUrl && (
                                <Box
                                    component="audio"
                                    ref={(el: HTMLAudioElement | null) => {
                                        if (el) {
                                            const rawVol = Number(g.config?.[ConfigKey.UI_AUDIO_VOLUME] ?? 1);
                                            const rawMuted = Boolean(g.config?.[ConfigKey.UI_AUDIO_MUTED] ?? false);
                                            let settling = true;
                                            el.volume = Number.isFinite(rawVol) ? Math.max(0, Math.min(1, rawVol)) : 1;
                                            el.muted = rawMuted;
                                            settling = false;
                                            let lastVolume = el.volume;
                                            let lastMuted = el.muted;
                                            el.onvolumechange = () => {
                                                if (settling) return;
                                                const volChanged = el.volume !== lastVolume;
                                                const mutedChanged = el.muted !== lastMuted;
                                                if (!volChanged && !mutedChanged) return;
                                                lastVolume = el.volume;
                                                lastMuted = el.muted;
                                                if (volChanged) g.saveConfig(ConfigKey.UI_AUDIO_VOLUME, el.volume);
                                                if (mutedChanged) g.saveConfig(ConfigKey.UI_AUDIO_MUTED, el.muted);
                                            };
                                        }
                                    }}
                                    controls
                                    src={audioUrl}
                                    sx={{ width: "100%", height: 28, mb: 0.5, opacity: 0.9 }}
                                />
                            )}
                            <Typography
                                variant="h6"
                                noWrap
                                sx={{ lineHeight: 1.2, color: "common.white", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
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
                                [{map.difficultyName}] &nbsp;&nbsp; {map.creatorName} &nbsp;&nbsp; ★{" "}
                                {displaySR.toFixed(2)}
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
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
                            <InfoRow label="Beatmap ID" value={map.beatmapId} />
                            <InfoRow
                                label={__(I18nStrings.MAIN_PICKER_RESULT_STATUS)}
                                value={RANKED_STATUS_LABELS[map.rankedStatus] ?? map.rankedStatus}
                            />
                            <InfoRow label="Set ID" value={map.beatmapSetId} />
                            <InfoRow
                                label={__(I18nStrings.MAIN_PICKER_RESULT_UNPLAYED)}
                                value={effectiveUnplayed ? "Yes" : "No"}
                            />
                            <Tooltip
                                title={
                                    effectiveLastPlayedTime ? formatDateTime(effectiveLastPlayedTime.getTime()) : null
                                }
                            >
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_BM_LAST_PLAYED)}
                                    value={
                                        effectiveLastPlayedTime ? formatTimeAgo(effectiveLastPlayedTime.getTime()) : "-"
                                    }
                                />
                            </Tooltip>
                        </Box>

                        {map.source && (
                            <>
                                <Divider sx={{ mb: 1 }} />
                                <InfoRow label={__(I18nStrings.MAIN_PICKER_RESULT_SOURCE)} value={map.source} wide />
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
                            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                                {__(I18nStrings.MAIN_PICKER_RESULT_SCORES, { count: mapScores.length })}
                            </Typography>
                            {showScores ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                        </Box>
                        <Collapse in={showScores}>
                            <Box sx={{ mb: 1 }}>
                                {mapScores.length === 0 ? (
                                    <Typography variant="caption" color="text.disabled">
                                        -
                                    </Typography>
                                ) : (
                                    <ScoreSection scores={scoreRows} ppMap={scorePPs} />
                                )}
                            </Box>
                        </Collapse>

                        {inCollections.length > 0 && (
                            <>
                                <Divider sx={{ mb: 1 }} />
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
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
                    </Box>

                    <Box
                        sx={{
                            flexShrink: 0,
                            borderTop: 1,
                            borderColor: "divider",
                            p: 1,
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 1,
                        }}
                    >
                        <Button
                            variant="outlined"
                            startIcon={<Language />}
                            onClick={() => window.olsCore.openExternal(`https://osu.ppy.sh/beatmaps/${map.beatmapId}`)}
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
                </Box>
            )}
        </Drawer>
    );
};

enum IBPState {
    None,
    Loading,
    Loaded,
}

const RANK_STATUS_INT: Partial<Record<RankedStatus, number[]>> = {
    [RankedStatus.Graveyard]: [2],
    [RankedStatus.WIP]: [2],
    [RankedStatus.Pending]: [2],
    [RankedStatus.Ranked]: [4],
    [RankedStatus.Approved]: [5],
    [RankedStatus.Qualified]: [6],
    [RankedStatus.Loved]: [7],
};

const evalStringCond = (value: string, op: StringCondition, target: string): boolean => {
    const v = (value ?? "").toLowerCase();
    const t = (target ?? "").toLowerCase();
    switch (op) {
        case StringCondition.Equals:
            return v === t;
        case StringCondition.Contains:
            return v.includes(t);
        case StringCondition.NotContains:
            return !v.includes(t);
        default:
            return false;
    }
};

const evalNumberCond = (value: number, op: NumberCondition, target: number): boolean => {
    switch (op) {
        case NumberCondition.Equals:
            return value === target;
        case NumberCondition.Greater:
            return value > target;
        case NumberCondition.Less:
            return value < target;
        case NumberCondition.GreaterOrEqual:
            return value >= target;
        case NumberCondition.LessOrEqual:
            return value <= target;
        case NumberCondition.NotEquals:
            return value !== target;
        default:
            return false;
    }
};

const evalDateCond = (date: Date, op: string, value: string): boolean => {
    if (!date) return false;
    const t = date.getTime();
    if (Number.isNaN(t)) return false;
    if (op === DateCondition.Before) return t < new Date(value).getTime();
    if (op === DateCondition.After) return t > new Date(value).getTime();
    if (op === DateCondition.Between) {
        const [from, to] = value.split("~");
        return t >= new Date(from?.trim() ?? "").getTime() && t <= new Date((to?.trim() ?? "") + "T23:59:59").getTime();
    }
    if (op === DateCondition.WithinSecs) return (Date.now() - t) / 1000 <= (parseInt(value) || 0);
    return false;
};

const get_effective_sr = (m: IBeatmapData, modes: Set<number> | null): number => {
    const native = m.mode === 1 ? m.srTaiko : m.mode === 2 ? m.srCtb : m.mode === 3 ? m.srMania : m.srStd;
    if (!modes || modes.size === 0 || modes.has(m.mode)) return native;
    if (m.mode === 0) {
        if (modes.has(1)) return m.srTaiko;
        if (modes.has(2)) return m.srCtb;
        if (modes.has(3)) return m.srMania;
    }
    return native;
};

const filterMaps = (
    maps: IBeatmapData[],
    generalFilter: TFilterSetting,
    includedCollections: string[],
    excludedCollections: string[],
    collections: IOsuCollection[],
): IBeatmapData[] => {
    let result = maps.filter((m) => m.beatmapId !== 0);

    if (includedCollections.length > 0) {
        const includedHashes = new Set<string>();
        for (const colName of includedCollections) {
            const col = collections.find((c) => c.name === colName);
            if (col) for (const h of extractHashes(col.maps)) includedHashes.add(h);
        }
        result = result.filter((m) => includedHashes.has(m.md5Hash));
    }

    if (excludedCollections.length > 0) {
        const excludedHashes = new Set<string>();
        for (const colName of excludedCollections) {
            const col = collections.find((c) => c.name === colName);
            if (col) for (const h of extractHashes(col.maps)) excludedHashes.add(h);
        }
        result = result.filter((m) => !excludedHashes.has(m.md5Hash));
    }

    if (generalFilter[FilterType.Title]) {
        const q = (generalFilter[FilterType.Title] as string).toLowerCase();
        result = result.filter(
            (m) =>
                (m.songTitle ?? "").toLowerCase().includes(q) || (m.songTitleUnicode ?? "").toLowerCase().includes(q),
        );
    }

    if (generalFilter[FilterType.RankState] && !(generalFilter[FilterType.RankState] as string[]).includes("all")) {
        const ranks = generalFilter[FilterType.RankState] as RankedStatus[];
        const rankInts = new Set(ranks.flatMap((r) => RANK_STATUS_INT[r] ?? []));
        result = result.filter((m) => rankInts.has(m.rankedStatus));
    }

    if (generalFilter[FilterType.StarRating]) {
        const sr = generalFilter[FilterType.StarRating];
        const [min = 0, max = 15] = Array.isArray(sr) && sr.length === 2 ? sr : [0, 15];
        if (min !== 0 || max !== 15) {
            const selectedModes: Set<number> | null =
                generalFilter[FilterType.Mode] && !(generalFilter[FilterType.Mode] as any[]).includes("all")
                    ? new Set((generalFilter[FilterType.Mode] as number[]).map(Number))
                    : null;
            result = result.filter((m) => {
                const eSR = get_effective_sr(m, selectedModes);
                return eSR >= min && eSR <= max;
            });
        }
    }

    if (generalFilter[FilterType.Mode] && !(generalFilter[FilterType.Mode] as any[]).includes("all")) {
        const modes = new Set((generalFilter[FilterType.Mode] as number[]).map(Number));
        result = result.filter((m) => modes.has(m.mode) || m.mode === 0);
    }

    return result;
};

const matchesBeatmapCond = (m: IBeatmapData, cond: IWeightBeatmapCondition): boolean => {
    const { field, operator, value } = cond;
    switch (field) {
        case BeatmapDataField.Id:
            return evalNumberCond(m.beatmapId, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.SetId:
            return evalNumberCond(m.beatmapSetId, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Artist:
            return evalStringCond(m.artist, operator as StringCondition, value);
        case BeatmapDataField.Title:
            return evalStringCond(m.songTitle ?? "", operator as StringCondition, value);
        case BeatmapDataField.Creator:
            return evalStringCond(m.creatorName, operator as StringCondition, value);
        case BeatmapDataField.RankedStatus:
            return evalNumberCond(m.rankedStatus, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.DrainSeconds:
            return evalNumberCond(m.drainSeconds, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Tags:
            return evalStringCond(m.tags, operator as StringCondition, value);
        case BeatmapDataField.Unplayed:
            return m.unplayed === (operator === BoolCondition.IsTrue);
        case BeatmapDataField.LastPlayedTime:
            return evalDateCond(m.lastPlayedTime, operator, value);
        case BeatmapDataField.AR:
            return evalNumberCond(m.ar, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.CS:
            return evalNumberCond(m.cs, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.HP:
            return evalNumberCond(m.hp, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.OD:
            return evalNumberCond(m.od, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.Stack:
            return evalNumberCond(m.stackLeniency, operator as NumberCondition, parseFloat(value));
        case BeatmapDataField.SV:
            return evalNumberCond(m.sliderMultiplier, operator as NumberCondition, parseFloat(value));
        default:
            return false;
    }
};

const matchesScoreCond = (
    m: IBeatmapData,
    scoresByHash: Map<string, OsuScore[]>,
    cond: IWeightScoreCondition,
): boolean => {
    const sb = scoresByHash.get(m.md5Hash);
    if (!sb || sb.length === 0) return false;
    const s = sb.reduce((best, cur) => (cur.totalScore > best.totalScore ? cur : best));
    const { field, operator, value } = cond;
    switch (field) {
        case ScoreRecordField.UserName:
            return evalStringCond(s.userName ?? "", operator as StringCondition, value);
        case ScoreRecordField.Count300:
            return evalNumberCond(s.count300, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Count100:
            return evalNumberCond(s.count100, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Count50:
            return evalNumberCond(s.count50, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountGeki:
            return evalNumberCond(s.countGeki, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountKatu:
            return evalNumberCond(s.countKatu, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.CountMiss:
            return evalNumberCond(s.countMiss, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.MaxCombo:
            return evalNumberCond(s.maxCombo, operator as NumberCondition, parseFloat(value));
        case ScoreRecordField.Perfect:
            return s.perfect === (operator === BoolCondition.IsTrue);
        case ScoreRecordField.Date:
            return evalDateCond(s.date ?? "", operator, value);
        default:
            return false;
    }
};

const matchesHistoryCond = (m: IBeatmapData, history: IPickerHistory[], cond: IWeightHistoryCondition): boolean => {
    const { operator, value } = cond;
    if (operator === HistoryCondition.Appeared) return history.some((h) => h.beatmapId === m.beatmapId);
    if (operator === HistoryCondition.NotAppeared) return !history.some((h) => h.beatmapId === m.beatmapId);
    const n = Math.max(1, parseInt(value) || 1);
    const recent = history.slice(-n);
    const appeared = recent.some((h) => h.beatmapId === m.beatmapId);
    if (operator === HistoryCondition.WithinLast) return appeared;
    if (operator === HistoryCondition.NotWithinLast) return !appeared;
    return false;
};

const buildWeightedPool = (
    maps: IBeatmapData[],
    advanced: IPickerAdvancedSettings,
    collections: IOsuCollection[],
    scoresByHash: Map<string, OsuScore[]>,
    history: IPickerHistory[],
): { map: IBeatmapData; weight: number }[] => {
    const collectionMaps = new Map<string, Set<string>>();
    for (const col of collections) {
        collectionMaps.set(col.name, extractHashes(col.maps));
    }

    return maps.map((m) => {
        let weight = 1;
        for (const entry of advanced.weights) {
            let match = false;
            if (entry.type === PickerTargetType.Map && String(m.beatmapId) === entry.id) {
                match = true;
            } else if (entry.type === PickerTargetType.Set && String(m.beatmapSetId) === entry.id) {
                match = true;
            } else if (entry.type === PickerTargetType.Collection) {
                const hashes = collectionMaps.get(entry.id);
                match = !!hashes?.has(m.md5Hash);
            } else if (entry.type === PickerTargetType.BeatmapData && entry.beatmapCondition) {
                match = matchesBeatmapCond(m, entry.beatmapCondition);
            } else if (entry.type === PickerTargetType.ScoreRecord && entry.scoreCondition) {
                match = matchesScoreCond(m, scoresByHash, entry.scoreCondition);
            } else if (entry.type === PickerTargetType.History && entry.historyCondition) {
                match = matchesHistoryCond(m, history, entry.historyCondition);
            }
            if (match) weight *= entry.weight;
        }
        return { map: m, weight };
    });
};

const normalizeWishlistEntry = (entry: any): IWishlistEntry => {
    if (!entry || typeof entry !== "object") {
        return { conditions: [] };
    }
    if (Array.isArray(entry.conditions)) {
        return { ...entry, conditions: entry.conditions };
    }
    const conditions: IWishlistConditionItem[] = [];
    if (
        entry.type === PickerTargetType.Map ||
        entry.type === PickerTargetType.Set ||
        entry.type === PickerTargetType.Collection
    ) {
        conditions.push({ type: entry.type, id: String(entry.id ?? "") });
    }
    return {
        label: entry.label,
        conditions:
            conditions.length > 0
                ? conditions
                : [{ type: entry.type ?? PickerTargetType.Map, id: String(entry.id ?? "") }],
    };
};

const normalizeAdvancedSettings = (adv: IPickerAdvancedSettings): IPickerAdvancedSettings => ({
    ...adv,
    wishlist: Array.isArray(adv.wishlist) ? adv.wishlist.map(normalizeWishlistEntry) : [],
});

const checkWishlist = (
    maps: IBeatmapData[],
    advanced: IPickerAdvancedSettings,
    scoresByHash: Map<string, OsuScore[]>,
    collections: IOsuCollection[],
    history: IPickerHistory[],
): IBeatmapData[] => {
    if (advanced.wishlist.length === 0) return [];
    const collectionMaps = new Map<string, Set<string>>();
    for (const col of collections) {
        collectionMaps.set(col.name, extractHashes(col.maps));
    }

    const matchesCondItem = (m: IBeatmapData, cond: (typeof advanced.wishlist)[0]["conditions"][0]): boolean => {
        if (cond.type === PickerTargetType.Map) return String(m.beatmapId) === cond.id;
        if (cond.type === PickerTargetType.Set) return String(m.beatmapSetId) === cond.id;
        if (cond.type === PickerTargetType.Collection) {
            const hashes = collectionMaps.get(cond.id);
            return !!hashes?.has(m.md5Hash);
        }
        if (cond.type === PickerTargetType.BeatmapData && cond.beatmapCondition) {
            return matchesBeatmapCond(m, cond.beatmapCondition);
        }
        if (cond.type === PickerTargetType.ScoreRecord && cond.scoreCondition) {
            return matchesScoreCond(m, scoresByHash, cond.scoreCondition);
        }
        if (cond.type === PickerTargetType.History && cond.historyCondition) {
            return matchesHistoryCond(m, history, cond.historyCondition);
        }
        return false;
    };

    return maps.filter((m) =>
        advanced.wishlist
            .map(normalizeWishlistEntry)
            .some((entry) => entry.conditions.every((cond) => matchesCondItem(m, cond))),
    );
};

const pickRandom = (pool: { map: IBeatmapData; weight: number }[]): IBeatmapData | undefined => {
    if (getYinMoChanceExperiment()) {
        return yinmoRandom(pool);
    }

    const total = pool.reduce((s, p) => s + p.weight, 0);
    if (total <= 0) return undefined;
    let r = Math.random() * total;
    for (const p of pool) {
        r -= p.weight;
        if (r <= 0) return p.map;
    }
    return pool[pool.length - 1]?.map;
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

export const BeatmapPickerView: React.FC<IBeatmapPickerViewProps> = () => {
    const [state, setState] = useState<IBPState>(IBPState.None);
    const [maps, setMaps] = useState<IBeatmapData[]>([]);
    const [collections, setCollections] = useState<IOsuCollection[]>([]);
    const [scoresByHash, setScoresByHash] = useState<Map<string, OsuScore[]>>(new Map());

    const [generalFilter, setGeneralFilter] = useState<TFilterSetting>({});
    const [includedCollections, setIncludedCollections] = useState<string[]>([]);
    const [excludedCollections, setExcludedCollections] = useState<string[]>([]);
    const [advancedSettings, setAdvancedSettings] = useState<IPickerAdvancedSettings>({ weights: [], wishlist: [] });
    const [history, setHistory] = useState<IPickerHistory[]>([]);
    const historyRef = useRef<IPickerHistory[]>([]);
    const isLoadingRef = useRef(false);
    const rollAreaRef = useRef<HTMLDivElement>(null);
    const [rollAreaWidth, setRollAreaWidth] = useState(0);
    const [profiles, setProfiles] = useState<string[]>([]);
    const [newProfileName, setNewProfileName] = useState("");
    const [activeProfileId, setActiveProfileId] = useState<string>(
        g.config?.[ConfigKey.PICKER_ACTIVE_PROFILE] ?? "default",
    );
    const [activePanel, setActivePanel] = useState<
        "filter" | "collection" | "weight" | "wishlist" | "history" | "profiles" | null
    >(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const initialSaveGuard = useRef(true);
    const loadedProfileRef = useRef<{
        generalFilter: TFilterSetting;
        includedCollections: string[];
        excludedCollections: string[];
        advancedSettings: IPickerAdvancedSettings;
        profileId: string;
    } | null>(null);
    const loadedHistoryRef = useRef<IPickerHistory[] | null>(null);
    const [totalBeatmapCount, setTotalBeatmapCount] = useState(0);
    const filterStateRef = useRef({
        generalFilter,
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
        filterStateRef.current = {
            generalFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
            activeProfileId,
        };
    }, [generalFilter, includedCollections, excludedCollections, advancedSettings, activeProfileId]);

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
            includedCollections,
            excludedCollections,
            advancedSettings,
        });
        g.setNotify({ message: __(I18nStrings.MAIN_PICKER_PROFILE_SAVED), severity: "success" });
    }, [generalFilter, includedCollections, excludedCollections, advancedSettings, activeProfileId]);

    useEffect(() => {
        if (activePanel !== null) return;
        if (!profileLoaded || !dirtyRef.current) return;
        dirtyRef.current = false;
        const {
            generalFilter: gf,
            includedCollections: inc,
            excludedCollections: exc,
            advancedSettings: adv,
            activeProfileId: pid,
        } = filterStateRef.current;
        window.olsCore.savePickerProfile(pid, {
            name: pid,
            generalFilter: gf,
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

    useEffect(() => {
        if (state !== IBPState.Loading) {
            g.setLoading(false);
        }
    }, [state]);

    useEffect(() => {
        const load = async () => {
            const id = g.config?.[ConfigKey.PICKER_ACTIVE_PROFILE] ?? "default";
            const [profile, log, list] = await Promise.all([
                window.olsCore.getPickerProfile(id),
                window.olsCore.getPickerLog(id),
                window.olsCore.listPickerProfiles(),
            ]);
            if (profile) {
                setGeneralFilter(profile.generalFilter ?? {});
                setIncludedCollections(profile.includedCollections ?? []);
                setExcludedCollections(profile.excludedCollections ?? []);
                setAdvancedSettings(
                    normalizeAdvancedSettings(profile.advancedSettings ?? { weights: [], wishlist: [] }),
                );
                loadedProfileRef.current = {
                    profileId: id,
                    generalFilter: profile.generalFilter ?? {},
                    includedCollections: profile.includedCollections ?? [],
                    excludedCollections: profile.excludedCollections ?? [],
                    advancedSettings: normalizeAdvancedSettings(
                        profile.advancedSettings ?? { weights: [], wishlist: [] },
                    ),
                };
            } else {
                loadedProfileRef.current = {
                    profileId: id,
                    generalFilter: {},
                    includedCollections: [],
                    excludedCollections: [],
                    advancedSettings: { weights: [], wishlist: [] },
                };
            }
            loadedHistoryRef.current = log ?? [];
            if (log?.length) setHistory(log);
            setProfiles(list ?? []);
            initialSaveGuard.current = false;
            setProfileLoaded(true);
        };
        load();
    }, []);

    const applyFromCache = useCallback(async () => {
        const cols = await OsuData.getCollections();
        const { includedCollections: curIncluded, excludedCollections: curExcluded } = filterStateRef.current;
        const backendFilter: StableBeatmapFilter = {};
        const includedHashes: string[] = [];
        const excludedHashes: string[] = [];
        for (const colName of curIncluded) {
            const col = cols.find((c) => c.name === colName);
            if (col) for (const h of col.maps) includedHashes.push(h);
        }
        for (const colName of curExcluded) {
            const col = cols.find((c) => c.name === colName);
            if (col) for (const h of col.maps) excludedHashes.push(h);
        }
        if (curIncluded.length > 0) backendFilter.includedHashes = includedHashes;
        if (curExcluded.length > 0) backendFilter.excludedHashes = excludedHashes;
        const allMaps = await OsuData.getBeatmaps();
        setTotalBeatmapCount(allMaps.length);
        const local = Object.keys(backendFilter).length > 0 ? await OsuData.getBeatmaps(backendFilter) : allMaps;
        const scores = await OsuData.getScores();
        setMaps(local);
        setCollections(cols);
        setScoresByHash(scores);
    }, []);

    const loadData = useCallback(async () => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        try {
            setState(IBPState.Loading);
            OsuData.invalidate();
            g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));
            await yieldToMain();
            await OsuData.init();
            await applyFromCache();
            setState(IBPState.Loaded);
        } catch (error) {
            console.error(error);
            setState(IBPState.None);
        } finally {
            isLoadingRef.current = false;
        }
    }, [applyFromCache]);

    const onBtnClickedByInit = () => loadData();

    useEffect(() => {
        OsuData.subscribe(applyFromCache);
        return () => OsuData.unsubscribe(applyFromCache);
    }, [applyFromCache]);

    useEffect(() => {
        if (OsuData.hasData) {
            applyFromCache().then(() => setState(IBPState.Loaded));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [showFilteredList, setShowFilteredList] = useState(false);
    const [pickedMap, setPickedMap] = useState<IBeatmapData | null>(null);

    const selectedModesSet = useMemo((): Set<number> | null => {
        const mf = generalFilter[FilterType.Mode];
        if (!mf || (mf as any[]).includes("all")) return null;
        return new Set((mf as number[]).map(Number));
    }, [generalFilter]);

    const deferredMaps = useDeferredValue(maps);
    const filteredMaps = useMemo(
        () => (state === IBPState.Loaded ? filterMaps(deferredMaps, generalFilter, [], [], []) : []),
        [state, deferredMaps, generalFilter],
    );

    const pickableCount = useMemo(() => {
        if (state !== IBPState.Loaded || advancedSettings.weights.length === 0) return filteredMaps.length;
        const pool = buildWeightedPool(filteredMaps, advancedSettings, collections, scoresByHash, history);
        return pool.filter((p) => p.weight > 0).length;
    }, [state, filteredMaps, advancedSettings, collections, scoresByHash, history]);

    const filteredPool = useMemo(() => {
        if (!showFilteredList || state !== IBPState.Loaded) return [];
        const wishlistCandidates = checkWishlist(filteredMaps, advancedSettings, scoresByHash, collections, history);
        let sourcePool = filteredMaps;
        if (wishlistCandidates.length > 0) {
            const wPool = buildWeightedPool(wishlistCandidates, advancedSettings, collections, scoresByHash, history);
            if (wPool.some((p) => p.weight > 0)) sourcePool = wishlistCandidates;
        }
        const pool = buildWeightedPool(sourcePool, advancedSettings, collections, scoresByHash, history);
        const total = pool.reduce((s, p) => s + p.weight, 0);
        return pool
            .map((p) => ({ ...p, probability: total > 0 ? (p.weight / total) * 100 : 0 }))
            .sort((a, b) => b.probability - a.probability);
    }, [showFilteredList, filteredMaps, advancedSettings, collections, scoresByHash, state, history]);

    const onBtnRoll = async () => {
        const filtered = filteredMaps;
        const now = Date.now();

        const wishlistCandidates = checkWishlist(filtered, advancedSettings, scoresByHash, collections, history);
        const wishlistPool =
            wishlistCandidates.length > 0
                ? buildWeightedPool(wishlistCandidates, advancedSettings, collections, scoresByHash, history).filter(
                      (p) => p.weight > 0,
                  )
                : [];
        const pool =
            wishlistPool.length > 0
                ? wishlistPool
                : buildWeightedPool(filtered, advancedSettings, collections, scoresByHash, history);
        const picked = pickRandom(pool);

        if (!picked) return;

        const entry: IPickerHistory = {
            beatmapId: picked.beatmapId,
            title: `${picked.artist} - ${picked.songTitle} [${picked.difficultyName}]`,
            pickedAt: now,
        };

        setHistory((prev) => {
            const next = [...prev, entry];
            if (next.length > HISTORY_MAX) next.splice(0, next.length - HISTORY_MAX);
            return next;
        });

        setPickedMap(picked);
    };

    const onClearHistory = () => {
        setHistory([]);
    };

    const onSaveProfile = async () => {
        const name = newProfileName.trim();
        if (!name) return;
        const profile: IPickerProfile = {
            name,
            generalFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
        };
        await window.olsCore.savePickerProfile(name, profile);
        setProfiles(await window.olsCore.listPickerProfiles());
        setNewProfileName("");
        g.setNotify({ message: __(I18nStrings.MAIN_PICKER_PROFILE_SAVED), severity: "success" });
    };

    const onLoadProfile = async (profileId: string) => {
        const profile = await window.olsCore.getPickerProfile(profileId);
        if (!profile) return;
        setGeneralFilter(profile.generalFilter ?? {});
        setIncludedCollections(profile.includedCollections ?? []);
        setExcludedCollections(profile.excludedCollections ?? []);
        setAdvancedSettings(normalizeAdvancedSettings(profile.advancedSettings ?? { weights: [], wishlist: [] }));
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
        const path = await window.olsCore.openFile(__(I18nStrings.MAIN_PICKER_PROFILE_IMPORT_TITLE), "openFile", [
            { name: "JSON", extensions: ["json"] },
        ]);
        if (!path) return;
        try {
            const content = await window.olsCore.readFile(path);
            const imported = JSON.parse(content) as IPickerProfile[];
            if (!Array.isArray(imported)) return;
            for (const p of imported) {
                if (!p?.name) continue;
                const normalized: IPickerProfile = {
                    ...p,
                    advancedSettings: normalizeAdvancedSettings(p.advancedSettings ?? { weights: [], wishlist: [] }),
                };
                await window.olsCore.savePickerProfile(normalized.name, normalized);
            }
            setProfiles(await window.olsCore.listPickerProfiles());
        } catch {}
    };

    const ROW_HEIGHT = 36;

    return (
        <>
            <BeatmapResultDrawer
                map={pickedMap}
                displaySR={pickedMap ? get_effective_sr(pickedMap, selectedModesSet) : 0}
                osuPath={g.config?.[ConfigKey.PATH_STABLE_DIR] ?? ""}
                collections={collections}
                scoresByHash={scoresByHash}
                onClose={() => setPickedMap(null)}
            />
            <Drawer
                anchor="bottom"
                open={showFilteredList}
                onClose={() => setShowFilteredList(false)}
                sx={{ "& .MuiDrawer-paper": { height: "60vh", display: "flex", flexDirection: "column" } }}
            >
                <Box
                    sx={{
                        px: 2,
                        py: 0.5,
                        display: "flex",
                        alignItems: "center",
                        borderBottom: 1,
                        borderColor: "divider",
                        flexShrink: 0,
                    }}
                >
                    <Typography variant="subtitle2" sx={{ flex: "0 0 40%" }}>
                        Title
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: "0 0 30%" }}>
                        Difficulty
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: "0 0 12%", textAlign: "right" }}>
                        ★
                    </Typography>
                    <Typography variant="subtitle2" sx={{ flex: "0 0 18%", textAlign: "right" }}>
                        P%
                    </Typography>
                </Box>
                <Box sx={{ flex: 1, minHeight: 0 }}>
                    <AutoSizer>
                        {({ width, height }) => (
                            <List
                                width={width}
                                height={height}
                                rowCount={filteredPool.length}
                                rowHeight={ROW_HEIGHT}
                                rowRenderer={({ index, key, style }) => {
                                    const row = filteredPool[index];
                                    return (
                                        <Box
                                            key={key}
                                            style={style}
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                px: 2,
                                                borderBottom: "1px solid",
                                                borderColor: "divider",
                                                bgcolor: index % 2 === 0 ? "transparent" : "action.hover",
                                                fontSize: "0.8rem",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    flex: "0 0 40%",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    pr: 1,
                                                }}
                                            >
                                                {row.map.artist ?? ""} - {row.map.songTitle ?? ""}
                                            </Box>
                                            <Box
                                                sx={{
                                                    flex: "0 0 30%",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    pr: 1,
                                                }}
                                            >
                                                {row.map.difficultyName}
                                            </Box>
                                            <Box sx={{ flex: "0 0 12%", textAlign: "right", pr: 1 }}>
                                                {get_effective_sr(row.map, selectedModesSet).toFixed(2)}
                                            </Box>
                                            <Box sx={{ flex: "0 0 18%", textAlign: "right" }}>
                                                {row.probability.toFixed(3)}%
                                            </Box>
                                        </Box>
                                    );
                                }}
                            />
                        )}
                    </AutoSizer>
                </Box>
                <Box sx={{ px: 2, py: 0.5, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                        {__(I18nStrings.BTN_PICKER_ROLL)}: {pickableCount} / {totalBeatmapCount}
                    </Typography>
                </Box>
            </Drawer>

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
                    {(["filter", "collection"] as const).map((panel, i) => (
                        <Button
                            key={panel}
                            variant="contained"
                            color={activePanel === panel ? "secondary" : "info"}
                            disabled={state !== IBPState.Loaded}
                            onClick={() => setActivePanel(activePanel === panel ? null : panel)}
                            sx={{
                                flex: 1,
                                borderRadius: 0,
                                minWidth: 68,
                                py: 1.5,
                                borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.15)" : "none",
                                "&:not(.Mui-disabled):hover .btn-inner": { transform: "translateX(-8px)" },
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
                                <Typography
                                    variant="caption"
                                    sx={{ fontSize: "0.62rem", lineHeight: 1.2, textAlign: "center" }}
                                >
                                    {panel === "filter"
                                        ? __(I18nStrings.BTN_PICKER_FILTER)
                                        : __(I18nStrings.BTN_PICKER_FILTER_COLLECTION)}
                                </Typography>
                            </Box>
                        </Button>
                    ))}
                </Box>

                <Button
                    variant="contained"
                    disabled={state === IBPState.Loading || (state === IBPState.Loaded && filteredMaps.length === 0)}
                    sx={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        aspectRatio: "1",
                        height: "100%",
                        borderRadius: "50%",
                        zIndex: 2,
                        fontSize: "1.2rem",
                        flexShrink: 0,
                        flexDirection: "column",
                        gap: 0.5,
                        boxShadow: (theme) =>
                            `0 0 0 8px ${theme.palette.background.default}, 0px 8px 24px rgba(0,0,0,0.4)`,
                        "&.Mui-disabled": {
                            opacity: 1,
                            backgroundColor: (theme) => theme.palette.background.default,
                            color: (theme) => theme.palette.success.contrastText,
                        },
                    }}
                    onClick={state === IBPState.Loaded ? onBtnRoll : onBtnClickedByInit}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        if (state === IBPState.Loaded) setShowFilteredList(true);
                    }}
                >
                    <span>
                        {state === IBPState.Loaded ? __(I18nStrings.BTN_PICKER_ROLL) : __(I18nStrings.BTN_PICKER_READ)}
                    </span>
                    {state === IBPState.Loaded && (
                        <Typography variant="caption" sx={{ fontSize: "0.65rem", opacity: 0.8, lineHeight: 1 }}>
                            {pickableCount} / {totalBeatmapCount}
                        </Typography>
                    )}
                </Button>

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
                            color={activePanel === panel ? "secondary" : "info"}
                            disabled={state !== IBPState.Loaded}
                            onClick={() => setActivePanel(activePanel === panel ? null : panel)}
                            sx={{
                                flex: 1,
                                borderRadius: 0,
                                minWidth: 68,
                                py: 1.5,
                                borderBottom: "1px solid rgba(255,255,255,0.15)",
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
                        color={activePanel === "profiles" ? "secondary" : "primary"}
                        disabled={state !== IBPState.Loaded}
                        onClick={() => setActivePanel(activePanel === "profiles" ? null : "profiles")}
                        sx={{
                            flex: 1,
                            borderRadius: 0,
                            minWidth: 68,
                            py: 1.5,
                            borderBottom: "1px solid rgba(255,255,255,0.15)",
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
                                {__(I18nStrings.BTN_PICKER_PROFILES)}
                            </Typography>
                        </Box>
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
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
                            borderRadius: 0,
                            minWidth: 68,
                            py: 1.5,
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

            <Drawer
                anchor="bottom"
                open={activePanel !== null}
                onClose={() => setActivePanel(null)}
                keepMounted
                sx={{ "& .MuiDrawer-paper": { height: "50vh", overflowY: "auto" } }}
            >
                <Box sx={{ display: activePanel === "filter" || activePanel === "collection" ? "block" : "none" }}>
                    <BeatmapPickerFilterPanel
                        key={`${activeProfileId}-${String(profileLoaded)}`}
                        collections={collections}
                        activeSection={activePanel === "collection" ? "collection" : "filter"}
                        generalFilter={generalFilter}
                        includedCollections={includedCollections}
                        excludedCollections={excludedCollections}
                        onGeneralFilterChanged={setGeneralFilter}
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
                                <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                                    -
                                </Typography>
                            )}
                            {profiles.map((profileId) => (
                                <Stack
                                    key={profileId}
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{
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
                                    <IconButton size="small" color="error" onClick={() => onDeleteProfile(profileId)}>
                                        <DeleteSweep fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                        </Stack>
                    </Box>
                </Box>
            </Drawer>
        </>
    );
};
