import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    MenuItem,
    Paper,
    Select,
    Slider,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { Observer } from "mobx-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TrackerDailyStat, TrackerUserSummary } from "../../defines/tracker_types";
import { IOsuCollection } from "../../defines/types";
import __ from "../../utils/i18n";
import { OsuBeatmap, OsuData, OsuScore } from "../../utils/osu";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { BeatmapResultDrawer, makeScorePPKey, ScoreRecordRow, ScoreRecordTable } from "./beatmapPicker";

interface HitCounts {
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
}

function calcAccuracy(s: HitCounts): number {
    const total = s.count300 + s.count100 + s.count50 + s.countMiss;
    if (total === 0) return 0;
    return ((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) / (total * 300)) * 100;
}

function calcGrade(s: HitCounts): string {
    const total = s.count300 + s.count100 + s.count50 + s.countMiss;
    if (total === 0) return "D";
    const r300 = s.count300 / total;
    const r50 = s.count50 / total;
    if (r300 === 1) return "SS";
    if (r300 > 0.9 && r50 <= 0.01 && s.countMiss === 0) return "S";
    if ((r300 > 0.8 && s.countMiss === 0) || r300 > 0.9) return "A";
    if ((r300 > 0.7 && s.countMiss === 0) || r300 > 0.8) return "B";
    if (r300 > 0.6) return "C";
    return "D";
}

const GRADE_ORDER = ["SS", "S", "A", "B", "C", "D"];
const GRADE_COLORS: Record<string, string> = {
    SS: "#cd1b9c",
    S: "#16b5c2",
    A: "#83d430",
    B: "#e2b03e",
    C: "#e9784e",
    D: "#dd474d",
};
interface EChartProps {
    title: string;
    option: object;
    height?: number;
    onDataZoom?: (params: any) => void;
}

const EChart: React.FC<EChartProps> = ({ title, option, height = 300, onDataZoom }) => (
    <Stack spacing={2}>
        <Typography variant="subtitle2">{title}</Typography>
        <Paper variant="outlined" sx={{ p: 1 }}>
            <ReactECharts
                option={option}
                style={{ height }}
                notMerge={false}
                lazyUpdate
                onEvents={onDataZoom ? { datazoom: onDataZoom } : undefined}
            />
        </Paper>
    </Stack>
);

type DateMode = "1d" | "7d" | "30d" | "custom";

interface FlatScore {
    md5Hash: string;
    userName: string;
    date: Date;
    count300: number;
    count100: number;
    count50: number;
    countMiss: number;
    totalScore: number;
    maxCombo: number;
    mods: number;
    ruleset: number;
    beatmap: OsuBeatmap | undefined;
}

function buildUserSummary(userName: string, scores: FlatScore[]): TrackerUserSummary {
    const dailyMap = new Map<string, TrackerDailyStat>();
    const totalGrades: Record<string, number> = { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 };

    for (const s of scores) {
        const day = dayjs(s.date).format("YYYY-MM-DD");
        let stat = dailyMap.get(day);
        if (!stat) {
            stat = {
                date: day,
                playCount: 0,
                totalScore: 0,
                totalAccSum: 0,
                count300: 0,
                count100: 0,
                count50: 0,
                countMiss: 0,
                gradeCount: { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 },
            };
            dailyMap.set(day, stat);
        }
        stat.playCount++;
        stat.totalScore += s.totalScore;
        stat.totalAccSum += calcAccuracy(s);
        stat.count300 += s.count300;
        stat.count100 += s.count100;
        stat.count50 += s.count50;
        stat.countMiss += s.countMiss;
        const grade = calcGrade(s);
        stat.gradeCount[grade] = (stat.gradeCount[grade] ?? 0) + 1;
        totalGrades[grade] = (totalGrades[grade] ?? 0) + 1;
    }

    const dailyStats = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    return { userName, updatedAt: Date.now(), dailyStats, totalGrades };
}

export const TrackerView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [stablePathMissing, setStablePathMissing] = useState(false);

    const [allScoresByUser, setAllScoresByUser] = useState<Map<string, FlatScore[]>>(new Map());
    const collectionsRef = useRef<IOsuCollection[]>([]);
    const [selectedMap, setSelectedMap] = useState<OsuBeatmap | null>(null);
    const scoresByHashRef = useRef<Map<string, OsuScore[]>>(new Map());

    const [allUsers, setAllUsers] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState("");
    const isInitialUserSet = useRef(true);
    const [summaryByUser, setSummaryByUser] = useState<Map<string, TrackerUserSummary>>(new Map());

    const [zoomStart, setZoomStart] = useState(0);
    const [zoomEnd, setZoomEnd] = useState(100);
    const [scorePPs, setScorePPs] = useState<Map<string, { pp: number; aim?: number; speed?: number; acc?: number }>>(
        new Map(),
    );

    const observerRef = useRef<IntersectionObserver | null>(null);
    const [chartsVisible, setChartsVisible] = useState(false);
    const chartSectionCallback = useCallback((el: HTMLDivElement | null) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        if (!el) {
            setChartsVisible(false);
            return;
        }
        const obs = new IntersectionObserver(([entry]) => setChartsVisible(entry.isIntersecting), { threshold: 0.01 });
        obs.observe(el);
        observerRef.current = obs;
    }, []);

    const tableObserverRef = useRef<IntersectionObserver | null>(null);
    const [tableVisible, setTableVisible] = useState(false);
    const tableSectionCallback = useCallback((el: HTMLElement | null) => {
        if (tableObserverRef.current) {
            tableObserverRef.current.disconnect();
            tableObserverRef.current = null;
        }
        if (!el) {
            setTableVisible(false);
            return;
        }
        const obs = new IntersectionObserver(([entry]) => setTableVisible(entry.isIntersecting), { threshold: 0.01 });
        obs.observe(el);
        tableObserverRef.current = obs;
    }, []);

    const [dateMode, setDateMode] = useState<DateMode>("7d");
    const [customStart, setCustomStart] = useState(dayjs().subtract(30, "day").format("YYYY-MM-DD"));
    const [customEnd, setCustomEnd] = useState(dayjs().format("YYYY-MM-DD"));

    const handleAnalyze = useCallback(async (scoresByUser: Map<string, FlatScore[]>, users: string[]) => {
        setAnalyzing(true);
        try {
            const newEntries: [string, TrackerUserSummary][] = [];
            for (const user of users) {
                const summary = buildUserSummary(user, scoresByUser.get(user) ?? []);
                await window.olsCore.saveTrackerUserSummary(summary);
                newEntries.push([user, summary]);
            }
            setSummaryByUser((prev) => new Map([...prev, ...newEntries]));
        } finally {
            setAnalyzing(false);
        }
    }, []);

    const isLoadingRef = useRef(false);

    const loadData = useCallback(async () => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        setLoading(true);
        try {
            const stablePath = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
            if (!stablePath) {
                setStablePathMissing(true);
                const summaries = await window.olsCore.listTrackerUserSummaries();
                if (summaries.length > 0) {
                    const cacheMap = new Map<string, TrackerUserSummary>();
                    for (const s of summaries) {
                        cacheMap.set(s.userName, s);
                    }
                    const lastUser = g.config?.[ConfigKey.TRACKER_LAST_USER] as string | undefined;
                    const initialUser = lastUser && cacheMap.has(lastUser) ? lastUser : summaries[0].userName;
                    const initialCache = cacheMap.get(initialUser);
                    if (initialCache) {
                        setSummaryByUser(cacheMap);
                        setAllUsers(summaries.map((s) => s.userName));
                        isInitialUserSet.current = true;
                        setSelectedUser(initialUser);
                        setZoomStart(initialCache.zoomStart ?? 0);
                        setZoomEnd(initialCache.zoomEnd ?? 100);
                    }
                }
                setLoading(false);
                return;
            }
            setStablePathMissing(false);
            const [beatmaps, scoresMap, cols] = await Promise.all([
                OsuData.getBeatmaps(),
                OsuData.getScores(),
                OsuData.getCollections(),
            ]);
            const beatmapByHash = new Map<string, OsuBeatmap>(beatmaps.map((b) => [b.md5Hash, b]));
            const flat: FlatScore[] = [];
            const userSet = new Set<string>();
            scoresMap.forEach((scores, md5Hash) => {
                for (const s of scores) {
                    flat.push({
                        md5Hash,
                        userName: s.userName,
                        date: s.date,
                        count300: s.count300,
                        count100: s.count100,
                        count50: s.count50,
                        countMiss: s.countMiss,
                        totalScore: s.totalScore,
                        maxCombo: s.maxCombo,
                        mods: s.mods,
                        ruleset: s.ruleset,
                        beatmap: beatmapByHash.get(md5Hash),
                    });
                    if (s.userName) userSet.add(s.userName);
                }
            });
            const users = Array.from(userSet).sort();
            const lastUser = g.config?.[ConfigKey.TRACKER_LAST_USER] as string | undefined;
            const initialUser = lastUser && users.includes(lastUser) ? lastUser : (users[0] ?? "");
            const cacheMap = new Map<string, TrackerUserSummary>();
            if (initialUser) {
                const cache = await window.olsCore.getTrackerUserSummary(initialUser);
                if (cache && !("error" in (cache as object))) {
                    cacheMap.set(initialUser, cache as TrackerUserSummary);
                }
            }
            const byUser = new Map<string, FlatScore[]>();
            for (const s of flat) {
                let arr = byUser.get(s.userName);
                if (!arr) {
                    arr = [];
                    byUser.set(s.userName, arr);
                }
                arr.push(s);
            }
            setAllScoresByUser(byUser);
            setAllUsers(users);
            isInitialUserSet.current = true;
            setSelectedUser(initialUser);
            collectionsRef.current = cols;
            scoresByHashRef.current = scoresMap;
            setSummaryByUser(cacheMap);
            const initialCache = cacheMap.get(initialUser);
            setZoomStart(initialCache?.zoomStart ?? 0);
            setZoomEnd(initialCache?.zoomEnd ?? 100);
            setLoading(false);
            if (cacheMap.size === 0 && users.length > 0) {
                handleAnalyze(byUser, users);
            }
        } catch {
            setLoading(false);
        } finally {
            isLoadingRef.current = false;
        }
    }, [handleAnalyze]);

    const isRefreshingRef = useRef(false);
    const allScoresByUserRef = useRef<Map<string, FlatScore[]>>(new Map());
    useEffect(() => {
        allScoresByUserRef.current = allScoresByUser;
    }, [allScoresByUser]);

    const refreshScores = useCallback(async () => {
        if (isRefreshingRef.current) return;
        isRefreshingRef.current = true;
        try {
            const scoresMap = await OsuData.getScores();
            const existingBeatmapByHash = new Map<string, OsuBeatmap | undefined>();
            for (const scores of allScoresByUserRef.current.values()) {
                for (const s of scores) existingBeatmapByHash.set(s.md5Hash, s.beatmap);
            }
            const flat: FlatScore[] = [];
            const userSet = new Set<string>();
            scoresMap.forEach((scores, md5Hash) => {
                for (const s of scores) {
                    flat.push({
                        md5Hash,
                        userName: s.userName,
                        date: s.date,
                        count300: s.count300,
                        count100: s.count100,
                        count50: s.count50,
                        countMiss: s.countMiss,
                        totalScore: s.totalScore,
                        maxCombo: s.maxCombo,
                        mods: s.mods,
                        ruleset: s.ruleset,
                        beatmap: existingBeatmapByHash.get(md5Hash),
                    });
                    if (s.userName) userSet.add(s.userName);
                }
            });
            const users = Array.from(userSet).sort();
            const byUser2 = new Map<string, FlatScore[]>();
            for (const s of flat) {
                let arr = byUser2.get(s.userName);
                if (!arr) {
                    arr = [];
                    byUser2.set(s.userName, arr);
                }
                arr.push(s);
            }
            setAllScoresByUser(byUser2);
            setAllUsers(users);
            scoresByHashRef.current = scoresMap;
        } finally {
            isRefreshingRef.current = false;
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        return OsuData.subscribe("scores", refreshScores);
    }, [refreshScores]);

    const refreshBeatmaps = useCallback(async () => {
        const beatmaps = await OsuData.getBeatmaps();
        const beatmapByHash = new Map<string, OsuBeatmap>(beatmaps.map((b) => [b.md5Hash, b]));
        setAllScoresByUser((prev) => {
            const next = new Map<string, FlatScore[]>();
            for (const [user, scores] of prev) {
                next.set(
                    user,
                    scores.map((s) => ({ ...s, beatmap: beatmapByHash.get(s.md5Hash) })),
                );
            }
            return next;
        });
    }, []);

    useEffect(() => {
        return OsuData.subscribe("beatmaps", refreshBeatmaps);
    }, [refreshBeatmaps]);

    const userSummary = summaryByUser.get(selectedUser);

    useEffect(() => {
        const summary = summaryByUser.get(selectedUser);
        setZoomStart(summary?.zoomStart ?? 0);
        setZoomEnd(summary?.zoomEnd ?? 100);
    }, [selectedUser]);

    useEffect(() => {
        if (isInitialUserSet.current) {
            isInitialUserSet.current = false;
            return;
        }
        if (selectedUser) {
            g.saveConfig(ConfigKey.TRACKER_LAST_USER, selectedUser);
        }
    }, [selectedUser]);

    useEffect(() => {
        if (!selectedUser || summaryByUser.has(selectedUser) || allScoresByUser.size === 0) return;
        (async () => {
            const cache = await window.olsCore.getTrackerUserSummary(selectedUser);
            if (cache && !("error" in (cache as object))) {
                setSummaryByUser((prev) => new Map([...prev, [selectedUser, cache as TrackerUserSummary]]));
            } else {
                handleAnalyze(allScoresByUser, [selectedUser]);
            }
        })();
    }, [selectedUser, summaryByUser, allScoresByUser, handleAnalyze]);

    const saveZoomRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onDataZoom = useCallback(
        (params: any) => {
            const b = params?.batch?.[0];
            const s = b ?? params;
            const newStart = s?.start !== undefined ? s.start : undefined;
            const newEnd = s?.end !== undefined ? s.end : undefined;
            if (newStart !== undefined) setZoomStart(newStart);
            if (newEnd !== undefined) setZoomEnd(newEnd);
            if (newStart === undefined && newEnd === undefined) return;
            if (saveZoomRef.current) clearTimeout(saveZoomRef.current);
            saveZoomRef.current = setTimeout(() => {
                setSummaryByUser((prev) => {
                    const user = selectedUser;
                    const existing = prev.get(user);
                    if (!existing) return prev;
                    const updated: TrackerUserSummary = {
                        ...existing,
                        zoomStart: newStart ?? existing.zoomStart,
                        zoomEnd: newEnd ?? existing.zoomEnd,
                    };
                    window.olsCore.saveTrackerUserSummary(updated);
                    return new Map([...prev, [user, updated]]);
                });
            }, 500);
        },
        [selectedUser],
    );

    const visibleDailyStats = useMemo(() => {
        if (!userSummary || userSummary.dailyStats.length === 0) return [];
        const len = userSummary.dailyStats.length;
        const startIdx = Math.floor((zoomStart / 100) * len);
        const endIdx = Math.ceil((zoomEnd / 100) * len);
        return userSummary.dailyStats.slice(startIdx, Math.max(startIdx + 1, endIdx));
    }, [userSummary, zoomStart, zoomEnd]);

    const playCountOption = useMemo(() => {
        if (!userSummary) return {};
        const labels = visibleDailyStats.map((s) => s.date);
        const daily = visibleDailyStats.map((s) => s.playCount);
        let cum = 0;
        const cumulative = daily.map((v) => (cum += v));
        return {
            tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
            legend: { data: [__(I18nStrings.MAIN_TRACKER_CHART_DAILY), __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE)] },
            xAxis: { type: "category", data: labels },
            yAxis: [
                { type: "value", name: __(I18nStrings.MAIN_TRACKER_CHART_COUNT_LABEL) },
                { type: "value", name: __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE) },
            ],
            series: [
                { name: __(I18nStrings.MAIN_TRACKER_CHART_DAILY), type: "bar", data: daily, yAxisIndex: 0 },
                {
                    name: __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE),
                    type: "line",
                    data: cumulative,
                    yAxisIndex: 1,
                    smooth: true,
                },
            ],
        };
    }, [userSummary, visibleDailyStats]);

    const scoreChartOption = useMemo(() => {
        if (!userSummary) return {};
        const labels = visibleDailyStats.map((s) => s.date);
        const daily = visibleDailyStats.map((s) => s.totalScore);
        let cum = 0;
        const cumulative = daily.map((v) => (cum += v));
        return {
            tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
            legend: { data: [__(I18nStrings.MAIN_TRACKER_CHART_DAILY), __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE)] },
            xAxis: { type: "category", data: labels },
            yAxis: [
                { type: "value", name: __(I18nStrings.MAIN_TRACKER_CHART_SCORE_LABEL) },
                { type: "value", name: __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE) },
            ],
            series: [
                { name: __(I18nStrings.MAIN_TRACKER_CHART_DAILY), type: "bar", data: daily, yAxisIndex: 0 },
                {
                    name: __(I18nStrings.MAIN_TRACKER_CHART_CUMULATIVE),
                    type: "line",
                    data: cumulative,
                    yAxisIndex: 1,
                    smooth: true,
                },
            ],
        };
    }, [userSummary, visibleDailyStats]);

    const rankChartOption = useMemo(() => {
        const grades: Record<string, number> = { SS: 0, S: 0, A: 0, B: 0, C: 0, D: 0 };
        for (const s of visibleDailyStats) {
            for (const [g, c] of Object.entries(s.gradeCount)) {
                grades[g] = (grades[g] ?? 0) + (c as number);
            }
        }
        return {
            tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
            legend: { orient: "vertical", right: "5%", top: "center" },
            series: [
                {
                    type: "pie",
                    radius: ["40%", "70%"],
                    data: GRADE_ORDER.filter((g) => (grades[g] ?? 0) > 0).map((g) => ({
                        value: grades[g],
                        name: g,
                        itemStyle: { color: GRADE_COLORS[g] },
                    })),
                },
            ],
        };
    }, [visibleDailyStats]);

    const accChartOption = useMemo(() => {
        if (!userSummary) return {};
        const labels = visibleDailyStats.map((s) => s.date);
        const daily = visibleDailyStats.map((s) =>
            s.playCount > 0 ? +(s.totalAccSum / s.playCount).toFixed(2) : null,
        );
        return {
            tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
            xAxis: { type: "category", data: labels },
            yAxis: { type: "value", scale: true, axisLabel: { formatter: "{value}%" } },
            series: [{ type: "line", data: daily, smooth: true, connectNulls: true }],
        };
    }, [userSummary, visibleDailyStats]);

    const hitCountOption = useMemo(() => {
        if (!userSummary) return {};
        const labels = visibleDailyStats.map((s) => s.date);
        return {
            tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
            legend: { data: ["300", "100", "50", "Miss"] },
            xAxis: { type: "category", data: labels },
            yAxis: { type: "value" },
            series: [
                {
                    name: "300",
                    type: "line",
                    data: visibleDailyStats.map((s) => s.count300),
                    smooth: true,
                    itemStyle: { color: "#3498db" },
                },
                {
                    name: "100",
                    type: "line",
                    data: visibleDailyStats.map((s) => s.count100),
                    smooth: true,
                    itemStyle: { color: "#2ecc71" },
                },
                {
                    name: "50",
                    type: "line",
                    data: visibleDailyStats.map((s) => s.count50),
                    smooth: true,
                    itemStyle: { color: "#f39c12" },
                },
                {
                    name: "Miss",
                    type: "line",
                    data: visibleDailyStats.map((s) => s.countMiss),
                    smooth: true,
                    itemStyle: { color: "#e74c3c" },
                },
            ],
        };
    }, [userSummary, visibleDailyStats]);

    const dateRange = useMemo<[dayjs.Dayjs, dayjs.Dayjs]>(() => {
        const end = dayjs().endOf("day");
        if (dateMode === "1d") return [dayjs().startOf("day"), end];
        if (dateMode === "7d") return [dayjs().subtract(6, "day").startOf("day"), end];
        if (dateMode === "30d") return [dayjs().subtract(29, "day").startOf("day"), end];
        return [dayjs(customStart).startOf("day"), dayjs(customEnd).endOf("day")];
    }, [dateMode, customStart, customEnd]);

    const filteredRecords = useMemo(() => {
        const userScores = allScoresByUser.get(selectedUser) ?? [];
        return userScores
            .filter((s) => {
                const d = dayjs(s.date);
                return !d.isBefore(dateRange[0]) && !d.isAfter(dateRange[1]);
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [allScoresByUser, selectedUser, dateRange]);

    const filteredRecordsRef = useRef(filteredRecords);
    useEffect(() => {
        filteredRecordsRef.current = filteredRecords;
    }, [filteredRecords]);

    const calculatingKeys = useRef(new Set<string>());

    useEffect(() => {
        setScorePPs(new Map());
        calculatingKeys.current.clear();
    }, [filteredRecords]);

    const handleVisibleKeys = useCallback((keys: string[]) => {
        const records = filteredRecordsRef.current;
        const scoreByKey = new Map(records.map((s) => [makeScorePPKey(s), s]));
        for (const key of keys) {
            if (calculatingKeys.current.has(key)) continue;
            const s = scoreByKey.get(key);
            if (!s?.beatmap) continue;
            calculatingKeys.current.add(key);
            window.olsCore
                .calcPP({
                    md5Hash: s.md5Hash,
                    mods: s.mods,
                    combo: s.maxCombo,
                    n300: s.count300,
                    n100: s.count100,
                    n50: s.count50,
                    misses: s.countMiss,
                    totalScore: s.totalScore,
                    beatmapId: s.beatmap.beatmapId,
                    ar: s.beatmap.ar,
                    od: s.beatmap.od,
                    nCircles: s.beatmap.numCircles,
                    nSliders: s.beatmap.numSliders,
                    ruleset: s.ruleset,
                })
                .then((result) => {
                    if (result && !("error" in result)) {
                        setScorePPs((prev) => {
                            const next = new Map(prev);
                            next.set(key, { pp: result.pp, aim: result.aim, speed: result.speed, acc: result.acc });
                            return next;
                        });
                    }
                });
        }
    }, []);

    const osuPath = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
    const getDisplaySR = (bm: OsuBeatmap) =>
        bm.mode === 1 ? bm.srTaiko : bm.mode === 2 ? bm.srCtb : bm.mode === 3 ? bm.srMania : bm.srStd;

    if (loading) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                <Typography variant="body2">{__(I18nStrings.MAIN_TRACKER_LOADING)}</Typography>
            </Stack>
        );
    }

    if (allUsers.length === 0) {
        return (
            <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
                <Observer>
                    {() => {
                        const sp = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
                        if (!sp) {
                            return (
                                <Alert severity="warning" sx={{ maxWidth: 480 }}>
                                    {__(I18nStrings.MAIN_TRACKER_NO_DATA_PATH_REQUIRED)}
                                </Alert>
                            );
                        }
                        return (
                            <Typography variant="body2" color="text.secondary">
                                {__(I18nStrings.MAIN_TRACKER_NO_DATA)}
                            </Typography>
                        );
                    }}
                </Observer>
            </Stack>
        );
    }

    const sliderVisible = chartsVisible && !tableVisible;

    return (
        <Stack spacing={2} sx={{ pb: sliderVisible ? 8 : 0 }}>
            {stablePathMissing && (
                <Observer>
                    {() =>
                        g.config?.[ConfigKey.PATH_STABLE_DIR] ? null : (
                            <Alert severity="warning">{__(I18nStrings.MAIN_TRACKER_CACHE_WARNING)}</Alert>
                        )
                    }
                </Observer>
            )}
            {/* 成績分析 (all-time, from cache) */}
            <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle1">{__(I18nStrings.MAIN_TRACKER_SECTION_ANALYSIS)}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                {userSummary && (
                    <Typography variant="caption" color="text.secondary">
                        {__(I18nStrings.MAIN_TRACKER_UPDATED_AT)}{" "}
                        {dayjs(userSummary.updatedAt).format("YYYY-MM-DD HH:mm")}
                    </Typography>
                )}
                {allUsers.length > 1 ? (
                    <Select
                        size="small"
                        sx={{ height: 30 }}
                        value={selectedUser}
                        onChange={(e) => {
                            isInitialUserSet.current = false;
                            setSelectedUser(e.target.value as string);
                        }}
                    >
                        {allUsers.map((u) => (
                            <MenuItem key={u} value={u}>
                                {u}
                            </MenuItem>
                        ))}
                    </Select>
                ) : (
                    <Chip label={selectedUser} size="small" variant="outlined" />
                )}
                <Button
                    size="small"
                    variant="outlined"
                    disabled={analyzing || stablePathMissing}
                    onClick={() => handleAnalyze(allScoresByUser, allUsers)}
                >
                    {analyzing ? __(I18nStrings.MAIN_TRACKER_ANALYZING) : __(I18nStrings.BTN_TRACKER_REANALYZE)}
                </Button>
            </Stack>

            {!userSummary && analyzing ? (
                <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                        {__(I18nStrings.MAIN_TRACKER_ANALYZING)}
                    </Typography>
                </Stack>
            ) : (
                <Box ref={chartSectionCallback}>
                    <Stack spacing={2}>
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                            <EChart
                                title={__(I18nStrings.MAIN_TRACKER_CHART_PLAYS)}
                                option={playCountOption}
                                onDataZoom={onDataZoom}
                            />
                            <EChart
                                title={__(I18nStrings.MAIN_TRACKER_CHART_SCORE)}
                                option={scoreChartOption}
                                onDataZoom={onDataZoom}
                            />
                            <EChart title={__(I18nStrings.MAIN_TRACKER_CHART_RANKS)} option={rankChartOption} />
                            <EChart
                                title={__(I18nStrings.MAIN_TRACKER_CHART_ACC)}
                                option={accChartOption}
                                onDataZoom={onDataZoom}
                            />
                        </Box>
                        <EChart
                            title={__(I18nStrings.MAIN_TRACKER_CHART_HITS)}
                            option={hitCountOption}
                            onDataZoom={onDataZoom}
                        />
                    </Stack>
                </Box>
            )}

            <Divider />

            {/* 遊玩紀錄 (live data, date filtered) */}
            <Stack ref={tableSectionCallback} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="subtitle1">{__(I18nStrings.MAIN_TRACKER_SECTION_RECORDS)}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="body2" color="text.secondary">
                    {__(I18nStrings.MAIN_TRACKER_RECORDS_COUNT, { count: filteredRecords.length })}
                </Typography>
                <ToggleButtonGroup size="small" exclusive value={dateMode} onChange={(_, v) => v && setDateMode(v)}>
                    <ToggleButton value="1d">{__(I18nStrings.MAIN_TRACKER_DATE_TODAY)}</ToggleButton>
                    <ToggleButton value="7d">{__(I18nStrings.MAIN_TRACKER_DATE_7D)}</ToggleButton>
                    <ToggleButton value="30d">{__(I18nStrings.MAIN_TRACKER_DATE_30D)}</ToggleButton>
                    <ToggleButton value="custom">{__(I18nStrings.MAIN_TRACKER_DATE_CUSTOM)}</ToggleButton>
                </ToggleButtonGroup>
                {dateMode === "custom" && (
                    <>
                        <TextField
                            size="small"
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            slotProps={{ htmlInput: { max: customEnd } }}
                        />
                        <Typography variant="body2">—</Typography>
                        <TextField
                            size="small"
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            slotProps={{ htmlInput: { min: customStart } }}
                        />
                    </>
                )}
            </Stack>

            <ScoreRecordTable
                scores={filteredRecords.slice(0, 500).map(
                    (s): ScoreRecordRow => ({
                        md5Hash: s.md5Hash,
                        date: s.date,
                        count300: s.count300,
                        count100: s.count100,
                        count50: s.count50,
                        countMiss: s.countMiss,
                        totalScore: s.totalScore,
                        maxCombo: s.maxCombo,
                        mods: s.mods,
                        ruleset: s.ruleset,
                        beatmapLabel: s.beatmap
                            ? `${s.beatmap.artist} - ${s.beatmap.songTitle} [${s.beatmap.difficultyName}]`
                            : undefined,
                    }),
                )}
                ppMap={scorePPs}
                sortBy="date"
                showBeatmapLabel
                onVisibleKeysChange={handleVisibleKeys}
                onRowClick={(row) => {
                    const flat = filteredRecords.find((s) => makeScorePPKey(s) === makeScorePPKey(row));
                    if (flat?.beatmap) setSelectedMap(flat.beatmap);
                }}
            />

            <BeatmapResultDrawer
                map={selectedMap}
                displaySR={selectedMap ? getDisplaySR(selectedMap) : 0}
                osuPath={osuPath}
                collections={collectionsRef.current}
                scoresByHash={scoresByHashRef.current}
                onClose={() => setSelectedMap(null)}
            />
            {sliderVisible && (
                <Box
                    sx={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        bgcolor: "background.paper",
                        px: 4,
                        py: 1,
                        borderTop: 1,
                        borderColor: "divider",
                    }}
                >
                    <Slider
                        size="small"
                        value={[zoomStart, zoomEnd]}
                        onChange={(_, val) => {
                            const [s, e] = val as number[];
                            setZoomStart(s);
                            setZoomEnd(e);
                        }}
                        onChangeCommitted={(_, val) => {
                            const [s, e] = val as number[];
                            setSummaryByUser((prev) => {
                                const existing = prev.get(selectedUser);
                                if (!existing) return prev;
                                const updated: TrackerUserSummary = { ...existing, zoomStart: s, zoomEnd: e };
                                window.olsCore.saveTrackerUserSummary(updated);
                                return new Map([...prev, [selectedUser, updated]]);
                            });
                        }}
                        min={0}
                        max={100}
                    />
                </Box>
            )}
        </Stack>
    );
};
