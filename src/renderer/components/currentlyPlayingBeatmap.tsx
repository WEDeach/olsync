import { History, MusicNote, PlayArrow, Star } from "@mui/icons-material";
import { Box, ButtonBase, Chip, CircularProgress, Fade, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RespUserRecentScore, ScoreStatistics } from "../../api/v2/types/api_resp";
import type { StableIpcClientData } from "../../defines/stable_structs";
import { StableIpcMode } from "../../defines/stable_structs";
import __ from "../../utils/i18n";
import {
    calcGrade,
    calculateAccuracy,
    formatApiMods,
    GRADE_COLORS,
    getModAcronyms,
    getNativeStarRating,
    normalizeRank,
    OsuBeatmap,
    OsuData,
    OsuScore,
} from "../../utils/osu";
import { formatPlayingTime, getBeatmapTotalMilliseconds } from "../../utils/playingBeatmap";
import { stableIpcState } from "../../utils/stableIpcState";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { loadBeatmapBackground } from "./common/beatmapMedia";

const API_SCORE_TIMEOUT_MS = 25_000;
const LOCAL_SCORE_POLL_INTERVAL_MS = 2_000;
const LOCAL_SCORE_TIMEOUT_MS = 60_000;
const LOCAL_SCORE_TIME_TOLERANCE_MS = 10_000;

interface CurrentlyPlayingBeatmapProps {
    maps: OsuBeatmap[];
    osuPath: string;
    onOpenMap: (map: OsuBeatmap) => void;
}

interface CardFrameProps {
    children: React.ReactNode;
    backgroundUrl: string | null;
    onClick?: () => void;
    ariaLabel?: string;
}

const CardFrame: React.FC<CardFrameProps> = ({ children, backgroundUrl, onClick, ariaLabel }) => {
    const content = (
        <Box
            sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 1.5,
                bgcolor: "#242332",
                color: "common.white",
                textAlign: "left",
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : "none",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "cover",
                    filter: "brightness(0.55) saturate(0.8)",
                    opacity: backgroundUrl ? 1 : 0,
                    transition: "opacity 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            />
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    bgcolor: backgroundUrl ? "rgba(24, 23, 34, 0.52)" : "rgba(36, 35, 50, 0.96)",
                    transition: "background-color 400ms ease",
                }}
            />
            <Box sx={{ position: "relative" }}>{children}</Box>
        </Box>
    );

    return (
        <Box
            sx={{
                p: 0.75,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                bgcolor: "rgba(255,255,255,0.28)",
                boxShadow: "0 1px 4px rgba(50, 42, 75, 0.08)",
                transition:
                    "transform 260ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 260ms cubic-bezier(0.16, 1, 0.3, 1)",
                "&:has(button:not(:disabled)):hover": {
                    transform: "translateY(-2px)",
                    boxShadow: "0 4px 14px rgba(50, 42, 75, 0.12)",
                },
            }}
        >
            {onClick ? (
                <ButtonBase
                    onClick={onClick}
                    aria-label={ariaLabel}
                    sx={{ display: "block", width: "100%", borderRadius: 1.5, textAlign: "left" }}
                >
                    {content}
                </ButtonBase>
            ) : (
                content
            )}
        </Box>
    );
};

const Metric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography
            variant="caption"
            sx={{
                color: "rgba(255,255,255,0.58)",
                fontSize: "0.6875rem",
                letterSpacing: "0.08em",
                lineHeight: 1.2,
            }}
        >
            {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.25 }} noWrap>
            {value}
        </Typography>
    </Stack>
);

const formatMetric = (value: number | undefined, digits = 1): string =>
    value === undefined || !Number.isFinite(value) ? "-" : value.toFixed(digits);

const LoadingCard: React.FC<{ tall?: boolean }> = ({ tall }) => (
    <CardFrame backgroundUrl={null}>
        <Stack
            direction="row"
            spacing={1.5}
            sx={{
                alignItems: "center",
                justifyContent: "center",
                minHeight: tall ? { xs: 220, md: 260 } : 76,
                px: 1.5,
                py: tall ? { xs: 1.75, md: 2 } : 1.15,
            }}
        >
            <CircularProgress size={tall ? 24 : 18} thickness={5} sx={{ color: "rgba(255,255,255,0.85)" }} />
            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.875rem" }}>
                {__(I18nStrings.MAIN_PICKER_CURRENT_LOADING)}
            </Typography>
        </Stack>
    </CardFrame>
);

const ProgressBar: React.FC<{
    menuTime: number;
    totalMilliseconds: number;
    isRunning: boolean;
    audioPlaying?: boolean;
    buffering?: boolean;
}> = ({ menuTime, totalMilliseconds, isRunning, audioPlaying = true, buffering = false }) => {
    const clampedMenu = Math.max(0, menuTime ?? 0);
    const effectivelyRunning = isRunning && audioPlaying && !buffering;

    const baseRef = useRef({ menuTime: clampedMenu, time: performance.now() });
    const menuTimeRef = useRef(clampedMenu);
    const prevMenuRef = useRef(clampedMenu);
    const prevTimeRef = useRef(performance.now());
    const rateRef = useRef(1);
    const totalRef = useRef(totalMilliseconds);
    const runningRef = useRef(effectivelyRunning);
    const fillRef = useRef<HTMLDivElement | null>(null);
    const thumbRef = useRef<HTMLDivElement | null>(null);
    const currentTimeRef = useRef<HTMLElement | null>(null);
    const totalTimeRef = useRef<HTMLElement | null>(null);

    const render = (now: number) => {
        const base = baseRef.current;
        const next = runningRef.current
            ? Math.min(totalRef.current, base.menuTime + (now - base.time) * rateRef.current)
            : menuTimeRef.current;
        const progress = totalRef.current > 0 ? Math.min(1, Math.max(0, next / totalRef.current)) : 0;
        const currentTime = formatPlayingTime(next);
        if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`;
        if (thumbRef.current) {
            thumbRef.current.style.left = `${progress * 100}%`;
            thumbRef.current.style.opacity = progress > 0 && progress < 1 ? "1" : "0";
        }
        if (currentTimeRef.current && currentTimeRef.current.textContent !== currentTime) {
            currentTimeRef.current.textContent = currentTime;
        }
    };

    useEffect(() => {
        const now = performance.now();
        if (menuTimeRef.current !== clampedMenu) {
            const dt = now - prevTimeRef.current;
            const dMenu = clampedMenu - prevMenuRef.current;
            if (dt > 50) {
                rateRef.current = dMenu >= 0 ? dMenu / dt : 0;
            } else {
                rateRef.current = 1;
            }
            menuTimeRef.current = clampedMenu;
            prevMenuRef.current = clampedMenu;
            prevTimeRef.current = now;
            baseRef.current = { menuTime: clampedMenu, time: now };
        }
        if (totalRef.current !== totalMilliseconds) {
            totalRef.current = totalMilliseconds;
            if (totalTimeRef.current) {
                totalTimeRef.current.textContent = formatPlayingTime(totalMilliseconds);
            }
        }
        if (runningRef.current !== effectivelyRunning) {
            runningRef.current = effectivelyRunning;
            baseRef.current = { menuTime: menuTimeRef.current, time: performance.now() };
        }
        render(performance.now());
    }, [clampedMenu, totalMilliseconds, effectivelyRunning]);

    useEffect(() => {
        let mounted = true;
        let raf = 0;

        const tick = (now: number) => {
            if (!mounted) return;
            render(now);
            raf = requestAnimationFrame(tick);
        };

        const handleVisibility = () => {
            if (document.hidden) {
                if (raf) {
                    cancelAnimationFrame(raf);
                    raf = 0;
                }
            } else if (runningRef.current && !raf) {
                baseRef.current = { menuTime: menuTimeRef.current, time: performance.now() };
                raf = requestAnimationFrame(tick);
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        if (!runningRef.current || document.hidden) {
            render(performance.now());
        } else {
            raf = requestAnimationFrame(tick);
        }

        return () => {
            mounted = false;
            cancelAnimationFrame(raf);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [effectivelyRunning]);

    return (
        <Stack spacing={0.5} sx={{ width: "100%" }}>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    alignItems: "center",
                }}
            >
                <Typography
                    ref={currentTimeRef}
                    variant="caption"
                    sx={{
                        minWidth: 44,
                        color: "rgba(255,255,255,0.72)",
                        fontSize: "0.75rem",
                        textAlign: "left",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {formatPlayingTime(clampedMenu)}
                </Typography>
                <Box
                    sx={{
                        flex: 1,
                        height: 8,
                        overflow: "hidden",
                        borderRadius: 4,
                        bgcolor: "rgba(255,255,255,0.18)",
                        position: "relative",
                    }}
                >
                    <Box
                        ref={fillRef}
                        sx={{
                            position: "absolute",
                            inset: 0,
                            transformOrigin: "left center",
                            bgcolor: "common.white",
                            borderRadius: 4,
                            boxShadow: "0 0 10px rgba(255,255,255,0.4)",
                            willChange: "transform",
                        }}
                    />
                    <Box
                        ref={thumbRef}
                        sx={{
                            position: "absolute",
                            left: "0%",
                            top: "50%",
                            opacity: 0,
                            transform: "translate(-50%, -50%)",
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            bgcolor: "common.white",
                            boxShadow: "0 0 8px rgba(255,255,255,0.6)",
                        }}
                    />
                </Box>
                <Typography
                    ref={totalTimeRef}
                    variant="caption"
                    sx={{
                        minWidth: 44,
                        color: "rgba(255,255,255,0.72)",
                        fontSize: "0.75rem",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {formatPlayingTime(totalMilliseconds)}
                </Typography>
            </Stack>
        </Stack>
    );
};

const PlayingMetricGrid: React.FC<{ map: OsuBeatmap }> = ({ map }) => (
    <Box
        sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
            gap: { xs: 1, md: 1.5 },
            width: "100%",
        }}
    >
        {[
            { label: "AR", value: formatMetric(map.ar) },
            { label: "CS", value: formatMetric(map.cs) },
            { label: "OD", value: formatMetric(map.od) },
            { label: "HP", value: formatMetric(map.hp) },
            { label: "BPM", value: formatMetric(map.bpm, 0) },
        ].map((m) => (
            <Box
                key={m.label}
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    borderRadius: 1.5,
                    bgcolor: "rgba(255,255,255,0.08)",
                    px: 1.5,
                    py: 1.25,
                    minWidth: 0,
                }}
            >
                <Metric label={m.label} value={m.value} />
            </Box>
        ))}
    </Box>
);

interface ScoreDisplayData {
    accuracy: number;
    id: number;
    isBest?: boolean;
    max_combo: number;
    mods: unknown[];
    perfect: boolean;
    pp: number | null;
    rank: string;
    score: number;
    statistics: ScoreStatistics;
}

const osuScoreToDisplayData = (s: OsuScore, isBest: boolean, ppOverride?: number | null): ScoreDisplayData => ({
    accuracy: calculateAccuracy(s, "ratio"),
    id: 0,
    isBest,
    max_combo: s.maxCombo,
    mods: getModAcronyms(s.mods),
    perfect: s.perfect,
    pp: ppOverride ?? s._pp ?? null,
    rank: s._grade ?? calcGrade(s),
    score: s.totalScore,
    statistics: {
        count_300: s.count300,
        count_100: s.count100,
        count_50: s.count50,
        count_geki: s.countGeki ?? null,
        count_katu: s.countKatu ?? null,
        count_miss: s.countMiss,
    },
});

const ScorePanel: React.FC<{ score: ScoreDisplayData; compact?: boolean }> = ({ score, compact }) => {
    const isBest = score.isBest === true;
    const accuracy = `${(score.accuracy * 100).toFixed(2)}%`;
    const pp = score.pp === null || score.pp === undefined ? "-" : Math.round(score.pp).toString();
    const scoreText = score.score.toLocaleString();
    const rankColor = GRADE_COLORS[normalizeRank(score.rank)] ?? "rgba(255,255,255,0.9)";
    const maxComboNode = (
        <Box sx={{ color: score.perfect ? "#ffd700" : "inherit" }}>
            <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_MAX_COMBO)} value={score.max_combo} />
        </Box>
    );

    const stats = [
        { label: __(I18nStrings.MAIN_PICKER_TABLE_300), value: score.statistics.count_300 },
        { label: __(I18nStrings.MAIN_PICKER_TABLE_100), value: score.statistics.count_100 },
        { label: __(I18nStrings.MAIN_PICKER_TABLE_50), value: score.statistics.count_50 },
        { label: __(I18nStrings.MAIN_PICKER_TABLE_MISS), value: score.statistics.count_miss },
    ];

    if (compact) {
        return (
            <Stack spacing={0.75}>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                    }}
                >
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <Box
                            sx={{
                                px: 0.75,
                                py: 0.25,
                                borderRadius: 1,
                                bgcolor: "rgba(255,255,255,0.12)",
                                color: rankColor,
                                fontWeight: 700,
                                fontSize: "0.875rem",
                                minWidth: 28,
                                textAlign: "center",
                            }}
                        >
                            {score.rank}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                            {scoreText}
                        </Typography>
                        {isBest && <Star sx={{ fontSize: 16, color: "#ffd700" }} />}
                    </Stack>
                    <Stack
                        direction="row"
                        spacing={1.5}
                        sx={{
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_MODS)} value={formatApiMods(score.mods)} />
                        <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_ACCURACY)} value={accuracy} />
                        {maxComboNode}
                        <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_PP)} value={pp} />
                    </Stack>
                </Stack>
            </Stack>
        );
    }

    return (
        <Stack spacing={1.25} sx={{ width: "100%" }}>
            <Stack
                direction="row"
                spacing={2}
                sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                }}
            >
                <Stack
                    direction="row"
                    spacing={1.5}
                    sx={{
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <Box
                        sx={{
                            px: 1,
                            py: 0.4,
                            borderRadius: 1.5,
                            bgcolor: "rgba(255,255,255,0.12)",
                            color: rankColor,
                            fontWeight: 800,
                            fontSize: "1.1rem",
                            minWidth: 40,
                            textAlign: "center",
                        }}
                    >
                        {score.rank}
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.25rem" }}>
                        {scoreText}
                    </Typography>
                    {isBest && (
                        <Chip
                            icon={<Star sx={{ fontSize: 14 }} />}
                            label={__(I18nStrings.MAIN_PICKER_SCORE_BEST)}
                            size="small"
                            sx={{
                                height: 22,
                                color: "#ffd700",
                                bgcolor: "rgba(255,215,0,0.14)",
                                fontWeight: 700,
                                "& .MuiChip-icon": { color: "#ffd700" },
                            }}
                        />
                    )}
                </Stack>
                <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_ACCURACY)} value={accuracy} />
                    {maxComboNode}
                    <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_PP)} value={pp} />
                    <Metric label={__(I18nStrings.MAIN_PICKER_TABLE_MODS)} value={formatApiMods(score.mods)} />
                </Stack>
            </Stack>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                    gap: 1,
                }}
            >
                {stats.map((s) => (
                    <Box key={s.label} sx={{ borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.08)", px: 1.5, py: 1 }}>
                        <Metric label={s.label} value={s.value} />
                    </Box>
                ))}
            </Box>
        </Stack>
    );
};

const LastPlayedScoreCard: React.FC<{ score: RespUserRecentScore; onClick?: () => void }> = ({ score, onClick }) => {
    const title = score.beatmapset.title_unicode || score.beatmapset.title;
    const artist = score.beatmapset.artist_unicode || score.beatmapset.artist;
    const coverUrl = score.beatmapset.covers.cover || score.beatmapset.covers.list || null;

    return (
        <CardFrame
            backgroundUrl={coverUrl}
            onClick={onClick}
            ariaLabel={`${__(I18nStrings.MAIN_PICKER_CURRENT_LAST_PLAYED)}: ${title}`}
        >
            <Stack spacing={1} sx={{ px: 1.5, py: 1.25 }}>
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <Chip
                        icon={<History sx={{ fontSize: 14 }} />}
                        label={__(I18nStrings.MAIN_PICKER_CURRENT_LAST_PLAYED)}
                        size="small"
                        sx={{
                            height: 22,
                            alignSelf: "flex-start",
                            color: "common.white",
                            bgcolor: "rgba(124,107,170,0.7)",
                            "& .MuiChip-icon": { color: "inherit" },
                            "& .MuiChip-label": { fontSize: "0.6875rem", px: 0.8 },
                        }}
                    />
                    <Stack
                        direction="row"
                        spacing={0.35}
                        sx={{
                            alignItems: "center",
                        }}
                    >
                        <Star sx={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }} />
                        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                            {score.beatmap.difficulty_rating.toFixed(2)}
                        </Typography>
                    </Stack>
                </Stack>
                <Stack spacing={0.35} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.875rem" }} noWrap>
                        {title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.68)", fontSize: "0.75rem" }} noWrap>
                        {artist} · {score.beatmap.version}
                    </Typography>
                </Stack>
                <ScorePanel score={score} compact />
            </Stack>
        </CardFrame>
    );
};

const RANKING_MODES = new Set([
    StableIpcMode.Rank,
    StableIpcMode.RankingVs,
    StableIpcMode.RankingTagCoop,
    StableIpcMode.RankingTeam,
]);

const isRankingMode = (mode?: StableIpcMode) => mode !== undefined && RANKING_MODES.has(mode);

const getDataKey = (data: StableIpcClientData): string =>
    `${data.Connected}:${data.BeatmapId ?? 0}:${data.BeatmapChecksum ?? ""}`;

const findLocalMap = (data: StableIpcClientData, maps: OsuBeatmap[]): OsuBeatmap | undefined => {
    const beatmapId = data.BeatmapId ?? 0;
    if (beatmapId > 0) return maps.find((map) => map.beatmapId === beatmapId);
    const checksum = data.BeatmapChecksum?.trim().toLowerCase();
    return checksum ? maps.find((map) => map.md5Hash?.toLowerCase() === checksum) : undefined;
};

const unavailableLabel = (data: StableIpcClientData): string => {
    const beatmapId = data.BeatmapId ?? 0;
    if (beatmapId > 0) return `${__(I18nStrings.MAIN_PICKER_CURRENT_MAP_ID)}: ${beatmapId}`;
    return `${__(I18nStrings.MAIN_PICKER_CURRENT_HASH)}: ${data.BeatmapChecksum || "-"}`;
};

export const CurrentlyPlayingBeatmap = observer(({ maps, osuPath, onOpenMap }: CurrentlyPlayingBeatmapProps) => {
    const data = stableIpcState.data;
    const lastScore = stableIpcState.lastScore;
    const lastPlayingStatus = stableIpcState.lastPlayingStatus;
    const [map, setMap] = useState<OsuBeatmap | null>(null);
    const [resolving, setResolving] = useState(false);
    const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
    const [inPlaySequence, setInPlaySequence] = useState(false);
    const [localScore, setLocalScore] = useState<ScoreDisplayData | undefined>(undefined);
    type ScoreStatus = "idle" | "waiting-api" | "waiting-local" | "api-score" | "local-score" | "not-found";
    const [scoreStatus, setScoreStatus] = useState<ScoreStatus>("idle");
    const playEndAtRef = useRef<number>(0);
    const scoreStatusRef = useRef<ScoreStatus>("idle");

    const currentBeatmapId = data.BeatmapId ?? 0;
    const currentBeatmapChecksum = data.BeatmapChecksum?.trim() ?? "";
    const useLastPlayingBeatmap =
        isRankingMode(data.Mode) && currentBeatmapId === 0 && currentBeatmapChecksum.length === 0;
    const activeBeatmapId = useLastPlayingBeatmap ? lastPlayingStatus.BeatmapId : currentBeatmapId;
    const activeBeatmapChecksum = useLastPlayingBeatmap ? lastPlayingStatus.BeatmapChecksum : currentBeatmapChecksum;
    const activeBeatmapData: StableIpcClientData = {
        Connected: data.Connected,
        Mode: data.Mode,
        BeatmapId: activeBeatmapId,
        BeatmapChecksum: activeBeatmapChecksum,
    };
    const dataKey = getDataKey(activeBeatmapData);
    // Lookups run against the caller's loaded maps; OsuData's shared cache is not filled by the picker's stable read.
    const hasBeatmap =
        data.Connected && maps.length > 0 && ((activeBeatmapId ?? 0) > 0 || activeBeatmapChecksum.length > 0);
    const isPlaying = data.Mode === StableIpcMode.Play || (isRankingMode(data.Mode) && inPlaySequence);
    const lastPlayMatchesCurrent =
        lastPlayingStatus.BeatmapId > 0 &&
        (currentBeatmapId === 0 || lastPlayingStatus.BeatmapId === currentBeatmapId) &&
        (currentBeatmapChecksum.length === 0 ||
            lastPlayingStatus.BeatmapChecksum.toLowerCase() === currentBeatmapChecksum.toLowerCase());
    const scoreDisplayEnabled = isRankingMode(data.Mode) && lastPlayMatchesCurrent;
    const apiAvailable = useMemo(
        () => osuPath.length > 0 && !!g.config?.[ConfigKey.API_CLIENT_ID] && !!g.config?.[ConfigKey.API_CLIENT_SECRET],
        [osuPath, g.config?.[ConfigKey.API_CLIENT_ID], g.config?.[ConfigKey.API_CLIENT_SECRET]],
    );
    const beatmapHash = useMemo(
        () => (map?.md5Hash || activeBeatmapChecksum)?.toLowerCase(),
        [map?.md5Hash, activeBeatmapChecksum],
    );

    const activeScore = lastScore ?? localScore;
    const showScoreInCard = scoreDisplayEnabled && !!activeScore;
    const totalMilliseconds = map ? getBeatmapTotalMilliseconds(map) : 0;
    const lastScoreMap = useMemo(() => {
        if (!lastScore) return null;
        const beatmapId = lastScore.beatmap.id;
        const checksum = lastScore.beatmap.checksum?.trim().toLowerCase();
        return (
            maps.find(
                (m) =>
                    (beatmapId > 0 && m.beatmapId === beatmapId) || (checksum && m.md5Hash?.toLowerCase() === checksum),
            ) ?? null
        );
    }, [lastScore, maps]);
    const handleOpenLastScore = useCallback(() => {
        if (lastScoreMap && lastScore) {
            onOpenMap(lastScoreMap);
        } else if (lastScore) {
            window.olsCore.openBeatmapPage(lastScore.beatmap.id);
        }
    }, [lastScore, lastScoreMap, onOpenMap]);

    useEffect(() => {
        scoreStatusRef.current = scoreStatus;
    }, [scoreStatus]);

    useEffect(() => {
        if (data.Mode === StableIpcMode.Play) {
            setInPlaySequence(true);
        } else if (!isRankingMode(data.Mode)) {
            setInPlaySequence(false);
        }
    }, [data.Mode]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (!scoreDisplayEnabled || !beatmapHash) {
            setScoreStatus("idle");
            setLocalScore(undefined);
            playEndAtRef.current = 0;
        } else if (lastScore) {
            setScoreStatus("api-score");
            setLocalScore(undefined);
        } else if (lastScore === null) {
            setScoreStatus("waiting-local");
        } else if (apiAvailable) {
            setScoreStatus("waiting-api");
            timer = setTimeout(() => {
                if (scoreStatusRef.current === "waiting-api") {
                    setScoreStatus("waiting-local");
                }
            }, API_SCORE_TIMEOUT_MS);
        } else {
            setScoreStatus("waiting-local");
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [scoreDisplayEnabled, lastScore, apiAvailable, beatmapHash]);

    useEffect(() => {
        if (scoreStatus === "waiting-api" || scoreStatus === "waiting-local") {
            if (playEndAtRef.current === 0) {
                playEndAtRef.current = Date.now();
            }
        } else if (scoreStatus === "idle") {
            playEndAtRef.current = 0;
        }
    }, [scoreStatus]);

    useEffect(() => {
        if (scoreStatus !== "waiting-local" || !beatmapHash || playEndAtRef.current === 0) {
            return;
        }
        const minDate = playEndAtRef.current - LOCAL_SCORE_TIME_TOLERANCE_MS;
        const deadline = playEndAtRef.current + LOCAL_SCORE_TIMEOUT_MS;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const load = async () => {
            if (cancelled || scoreStatusRef.current !== "waiting-local") return;
            if (Date.now() > deadline) {
                if (!cancelled) setScoreStatus("not-found");
                return;
            }
            try {
                const byHash = await OsuData.queryStableScoresByHashes(undefined, [beatmapHash]);
                if (cancelled) return;
                const scores = byHash.size > 0 ? (Array.from(byHash.values())[0] ?? []) : [];
                const candidates = scores.filter((s) => s.date.getTime() >= minDate);
                if (candidates.length === 0) return;
                const latest = candidates.reduce((a, b) => (a.date.getTime() > b.date.getTime() ? a : b));

                const userName = latest.userName;
                const userScores = scores.filter((s) => s.userName.toLowerCase() === userName.toLowerCase());
                const userCandidates = userScores.filter((s) => s.date.getTime() >= minDate);
                if (userCandidates.length === 0) return;
                const userLatest = userCandidates.reduce((a, b) => (a.date.getTime() > b.date.getTime() ? a : b));

                const isBest = !userScores.some(
                    (s) =>
                        s.totalScore > userLatest.totalScore ||
                        (s.totalScore === userLatest.totalScore && (s._pp ?? 0) > (userLatest._pp ?? 0)),
                );

                let pp = userLatest._pp ?? null;
                if (map && pp === null) {
                    try {
                        const result = await window.olsCore.calcPP({
                            md5Hash: map.md5Hash,
                            mods: userLatest.mods,
                            modsData: userLatest._lazerMods,
                            combo: userLatest.maxCombo,
                            n300: userLatest.count300,
                            n100: userLatest.count100,
                            n50: userLatest.count50,
                            misses: userLatest.countMiss,
                            totalScore: userLatest.totalScore,
                            beatmapId: map.beatmapId,
                            ruleset: userLatest.ruleset,
                            lazer: userLatest._lazer ?? false,
                        });
                        if (result) pp = result.pp;
                    } catch {
                        // ignore: beatmap file may not be available
                    }
                }

                if (cancelled) return;
                setLocalScore(osuScoreToDisplayData(userLatest, isBest, pp));
                setScoreStatus("local-score");
            } catch {
                // ignore: score.db may not be ready yet
            }
        };

        const schedule = () => {
            if (cancelled || scoreStatusRef.current !== "waiting-local") return;
            timer = setTimeout(async () => {
                await load();
                schedule();
            }, LOCAL_SCORE_POLL_INTERVAL_MS);
        };

        schedule();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [scoreStatus, beatmapHash, map, activeBeatmapChecksum]);

    useEffect(() => {
        if (!hasBeatmap) {
            setMap(null);
            setResolving(false);
            return;
        }

        const resolved = findLocalMap(activeBeatmapData, maps) ?? null;
        setMap(resolved);
        setResolving(false);
    }, [dataKey, maps, hasBeatmap]);

    useEffect(() => {
        let cancelled = false;
        setBackgroundUrl(map?._coverUrl ?? null);
        if (!map) return;

        loadBeatmapBackground(map, osuPath)
            .then((url) => {
                if (!cancelled) setBackgroundUrl(url);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [map, osuPath]);

    if (!hasBeatmap) return null;

    const statusLabel = isPlaying
        ? __(I18nStrings.MAIN_PICKER_CURRENT_PLAYING)
        : __(I18nStrings.MAIN_PICKER_CURRENT_SELECTED);
    const mapTitle = map?.songTitle ?? "";
    const mapSubtitle = map ? `${map.artist} · ${map.difficultyName} · ${map.creatorName}` : "";
    const durationLabel = formatPlayingTime(totalMilliseconds);

    const card = resolving ? (
        <LoadingCard tall={isPlaying} />
    ) : !map ? (
        <CardFrame backgroundUrl={null}>
            <Stack spacing={0.5} sx={{ minHeight: 76, justifyContent: "center", px: 1.5, py: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.3 }}>
                    {__(I18nStrings.MAIN_PICKER_CURRENT_UNAVAILABLE)}
                </Typography>
                <Typography
                    variant="caption"
                    sx={{ color: "rgba(255,255,255,0.68)", fontSize: "0.75rem", lineHeight: 1.4 }}
                    noWrap
                >
                    {unavailableLabel(activeBeatmapData)}
                </Typography>
            </Stack>
        </CardFrame>
    ) : !isPlaying ? (
        <CardFrame
            backgroundUrl={backgroundUrl}
            onClick={() => onOpenMap(map)}
            ariaLabel={`${statusLabel}: ${mapTitle}`}
        >
            <Stack
                direction="row"
                spacing={2}
                sx={{
                    alignItems: "center",
                    minHeight: 76,
                    px: 1.5,
                    py: 1.15,
                }}
            >
                <Stack spacing={0.35} sx={{ minWidth: 0, flex: 1 }}>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            alignItems: "center",
                        }}
                    >
                        <Chip
                            icon={<MusicNote sx={{ fontSize: 14 }} />}
                            label={statusLabel}
                            size="small"
                            sx={{
                                height: 22,
                                alignSelf: "flex-start",
                                color: "common.white",
                                bgcolor: "rgba(124,107,170,0.7)",
                                "& .MuiChip-icon": { color: "inherit" },
                                "& .MuiChip-label": { fontSize: "0.6875rem", px: 0.8 },
                            }}
                        />
                        <Typography
                            variant="caption"
                            sx={{ color: "rgba(255,255,255,0.66)", fontSize: "0.75rem" }}
                            noWrap
                        >
                            {durationLabel}
                        </Typography>
                    </Stack>
                    <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 700, fontSize: { xs: "0.95rem", sm: "1rem" }, lineHeight: 1.25 }}
                        noWrap
                    >
                        {mapTitle}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: "rgba(255,255,255,0.76)", fontSize: "0.8125rem", lineHeight: 1.3 }}
                        noWrap
                    >
                        {mapSubtitle}
                    </Typography>
                </Stack>
                <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{
                        alignItems: "center",
                        flexShrink: 0,
                        color: "rgba(255,255,255,0.9)",
                    }}
                >
                    <Star sx={{ fontSize: 16 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1 }}>
                        {formatMetric(getNativeStarRating(map), 2)}
                    </Typography>
                </Stack>
            </Stack>
        </CardFrame>
    ) : (
        <CardFrame
            backgroundUrl={backgroundUrl}
            onClick={() => onOpenMap(map)}
            ariaLabel={`${statusLabel}: ${mapTitle}`}
        >
            <Stack
                sx={{
                    minHeight: { xs: 240, md: 280 },
                    px: { xs: 1.5, md: 2.5 },
                    py: { xs: 1.75, md: 2 },
                    justifyContent: "space-between",
                }}
            >
                <Stack spacing={1.25} sx={{ minWidth: 0 }}>
                    <Stack
                        direction="row"
                        spacing={2}
                        sx={{
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                        }}
                    >
                        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
                            <Chip
                                icon={<PlayArrow sx={{ fontSize: 16 }} />}
                                label={statusLabel}
                                size="small"
                                sx={{
                                    height: 24,
                                    alignSelf: "flex-start",
                                    color: "common.white",
                                    bgcolor: "rgba(124,107,170,0.78)",
                                    "& .MuiChip-icon": { color: "inherit" },
                                    "& .MuiChip-label": { fontSize: "0.75rem", px: 0.9 },
                                }}
                            />
                            <Typography
                                variant="h5"
                                sx={{
                                    mt: 0.25,
                                    fontWeight: 700,
                                    fontSize: { xs: "1.35rem", sm: "1.55rem", md: "1.75rem" },
                                    lineHeight: 1.15,
                                }}
                                noWrap
                            >
                                {mapTitle}
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={0.75}
                                sx={{
                                    alignItems: "center",
                                    color: "rgba(255,255,255,0.74)",
                                }}
                            >
                                <Typography variant="body2" sx={{ fontSize: "0.875rem", lineHeight: 1.4 }} noWrap>
                                    {map.artist}
                                </Typography>
                                <Box
                                    sx={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: "50%",
                                        bgcolor: "rgba(255,255,255,0.45)",
                                    }}
                                />
                                <Typography variant="body2" sx={{ fontSize: "0.875rem", lineHeight: 1.4 }} noWrap>
                                    {map.difficultyName}
                                </Typography>
                                <Box
                                    sx={{
                                        width: 4,
                                        height: 4,
                                        borderRadius: "50%",
                                        bgcolor: "rgba(255,255,255,0.45)",
                                    }}
                                />
                                <Stack
                                    direction="row"
                                    spacing={0.35}
                                    sx={{
                                        alignItems: "center",
                                    }}
                                >
                                    <Star sx={{ fontSize: 16, color: "rgba(255,255,255,0.8)" }} />
                                    <Typography
                                        variant="body2"
                                        sx={{ fontWeight: 700, fontSize: "0.875rem", lineHeight: 1 }}
                                    >
                                        {formatMetric(getNativeStarRating(map), 2)}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Stack>
                        <Typography
                            variant="body2"
                            sx={{ color: "rgba(255,255,255,0.72)", fontSize: "0.875rem", fontWeight: 500 }}
                        >
                            {durationLabel}
                        </Typography>
                    </Stack>
                </Stack>

                <Stack spacing={2} sx={{ width: "100%", mt: "auto", pt: { xs: 2, md: 3 } }}>
                    {showScoreInCard && activeScore && <ScorePanel score={activeScore} />}
                    <PlayingMetricGrid map={map} />
                    <ProgressBar
                        menuTime={data.MenuTime ?? 0}
                        totalMilliseconds={totalMilliseconds}
                        isRunning={data.Mode === StableIpcMode.Play}
                        audioPlaying={data.AudioPlaying !== false}
                        buffering={data.Buffering === true}
                    />
                </Stack>
            </Stack>
        </CardFrame>
    );

    const lastPlayedCard =
        !isPlaying && lastScore ? <LastPlayedScoreCard score={lastScore} onClick={handleOpenLastScore} /> : null;

    return (
        <Fade
            in
            timeout={300}
            appear
            mountOnEnter
            unmountOnExit
            key={`${dataKey}-${resolving ? "l" : map ? (isPlaying ? "p" : "s") : "u"}`}
        >
            <Stack spacing={1.25}>
                {card}
                {lastPlayedCard}
            </Stack>
        </Fade>
    );
});
