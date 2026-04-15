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
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutoSizer, List } from "react-virtualized";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { StableLocalBeatmap, StableScoreBeatmapData } from "../../defines/stable_structs";
import { IOsuCollection, OsuClients } from "../../defines/types";
import { IPC_RD_NAMES } from "../../entrypoint/js/ipc/ns";
import { B__YinMoChance } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { readAllWithOffset } from "../../utils/reader";
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

interface IBeatmapPickerViewProps {}

type IBeatmapData = Pick<
    StableLocalBeatmap,
    | "beatmapId"
    | "beatmapSetId"
    | "rankedStatus"
    | "md5Hash"
    | "songTitle"
    | "songTitleUnicode"
    | "artist"
    | "artistUnicode"
    | "creatorName"
    | "difficultyName"
    | "osuStandardGrade"
    | "unplayed"
    | "tags"
    | "drainSeconds"
    | "lastPlayedTime"
    | "ar"
    | "cs"
    | "hp"
    | "od"
    | "numCircles"
    | "numSliders"
    | "numSpinners"
    | "sliderMultiplier"
    | "stackLeniency"
    | "mode"
    | "source"
    | "path"
    | "audioFileName"
    | "osuFileName"
> & {
    starRating: number;
};

const HISTORY_MAX = 200;
const LOCAL_READ_PAGE_SIZE = 5000;

const RANKED_STATUS_LABELS: Record<number, string> = {
    0: "Unknown",
    1: "Not Submitted",
    2: "Pending",
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

interface IBeatmapResultDrawerProps {
    map: IBeatmapData | null;
    osuPath: string;
    collections: IOsuCollection[];
    scoresByHash: Map<string, StableScoreBeatmapData>;
    onClose: () => void;
}

const BeatmapResultDrawer: React.FC<IBeatmapResultDrawerProps> = ({
    map,
    osuPath,
    collections,
    scoresByHash,
    onClose,
}) => {
    const [bgUrl, setBgUrl] = useState<string | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [copyDone, setCopyDone] = useState(false);
    const [showScores, setShowScores] = useState(false);
    const mapScores = map ? (scoresByHash.get(map.md5Hash)?.scores ?? []) : [];
    const inCollections = map
        ? collections.filter((c) => extractHashes(c.maps).has(map.md5Hash)).map((c) => c.name)
        : [];

    useEffect(() => {
        let cancelled = false;
        setBgUrl(null);
        setAudioUrl(null);
        setShowScores(false);

        if (!map || !osuPath) {
            return;
        }

        const loadAssets = async () => {
            const osuFilePath = `${osuPath}/Songs/${map.path}/${map.osuFileName}`;
            const osuFile = await window.olsCore.readFile(osuFilePath, "utf8");
            if (cancelled || typeof osuFile !== "string") return;

            const line = osuFile.split(/\r?\n/).find((l) => /^0,0,"/.test(l.trim()));
            const match = line ? /^0,0,"([^"]+)"/.exec(line.trim()) : null;
            if (match?.[1]) {
                const bgPath = `${osuPath}/Songs/${map.path}/${match[1]}`;
                const bgBase64 = await window.olsCore.readFile(bgPath, "base64");
                if (!cancelled && typeof bgBase64 === "string") {
                    setBgUrl(`data:${guessMimeTypeFromPath(bgPath)};base64,${bgBase64}`);
                }
            }

            const audioPath = `${osuPath}/Songs/${map.path}/${map.audioFileName}`;
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
                                {map.starRating.toFixed(2)}
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
                                value={map.unplayed ? "Yes" : "No"}
                            />
                            <Tooltip title={map.lastPlayedTime ? formatDateTime(map.lastPlayedTime.getTime()) : null}>
                                <InfoRow
                                    label={__(I18nStrings.MAIN_PICKER_WEIGHT_BM_LAST_PLAYED)}
                                    value={map.lastPlayedTime ? formatTimeAgo(map.lastPlayedTime.getTime()) : "-"}
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
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1 }}>
                                {mapScores.length === 0 ? (
                                    <Typography variant="caption" color="text.disabled">
                                        -
                                    </Typography>
                                ) : (
                                    [...mapScores]
                                        .sort((a, b) => b.totalScore - a.totalScore)
                                        .map((s) => {
                                            const total = s.count300 + s.count100 + s.count50 + s.countMiss;
                                            const acc =
                                                total > 0
                                                    ? ((s.count300 * 300 + s.count100 * 100 + s.count50 * 50) /
                                                          (total * 300)) *
                                                      100
                                                    : 0;
                                            return (
                                                <Box
                                                    key={`${s.totalScore}-${s.date}-${s.maxCombo}`}
                                                    sx={{
                                                        display: "grid",
                                                        gridTemplateColumns: "2fr 1.5fr 1.5fr .5fr",
                                                        gap: "0 8px",
                                                        bgcolor: "action.hover",
                                                        borderRadius: 1,
                                                        px: 1,
                                                        py: 0.5,
                                                    }}
                                                >
                                                    <Typography variant="caption" noWrap sx={{ fontWeight: 600 }}>
                                                        {s.totalScore.toLocaleString()}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {s.maxCombo}x
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {acc.toFixed(2)}%
                                                    </Typography>
                                                    <Tooltip title={s.date ? formatDateTime(s.date.getTime()) : null}>
                                                        <Typography variant="caption" color="text.secondary" noWrap>
                                                            {s.date ? formatTimeAgo(s.date.getTime()) : "-"}
                                                        </Typography>
                                                    </Tooltip>
                                                </Box>
                                            );
                                        })
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
            result = result.filter((m) => m.starRating >= min && m.starRating <= max);
        }
    }

    if (generalFilter[FilterType.Mode] && !(generalFilter[FilterType.Mode] as any[]).includes("all")) {
        const modes = new Set((generalFilter[FilterType.Mode] as number[]).map(Number));
        result = result.filter((m) => modes.has(m.mode));
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
    scoresByHash: Map<string, StableScoreBeatmapData>,
    cond: IWeightScoreCondition,
): boolean => {
    const sb = scoresByHash.get(m.md5Hash);
    if (!sb || sb.scores.length === 0) return false;
    const s = sb.scores.reduce((best, cur) => (cur.totalScore > best.totalScore ? cur : best));
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
    scoresByHash: Map<string, StableScoreBeatmapData>,
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
    scoresByHash: Map<string, StableScoreBeatmapData>,
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
    if (B__YinMoChance) {
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
    console.log(sortPool);

    const totalWeight = sortPool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return undefined;

    const percent = 100;
    const probabilities = sortPool.map((item) => (item.weight / totalWeight) * 100);
    const candidates: IBeatmapData[] = [];

    while (candidates.length < percent) {
        for (let i = 0; i < sortPool.length && candidates.length < percent; i++) {
            const threshold = probabilities[i];
            const r = Math.random() * 100;
            if (threshold >= r) {
                candidates.push(sortPool[i].map);
                break;
            }
        }
    }

    console.log(candidates);
    const index = Math.floor(Math.random() * percent);
    return candidates[index];
};

export const BeatmapPickerView: React.FC<IBeatmapPickerViewProps> = () => {
    const [state, setState] = useState<IBPState>(IBPState.None);
    const [maps, setMaps] = useState<IBeatmapData[]>([]);
    const [collections, setCollections] = useState<IOsuCollection[]>([]);
    const [scoresByHash, setScoresByHash] = useState<Map<string, StableScoreBeatmapData>>(new Map());

    const fromConfig = <T,>(key: ConfigKey, def: T): T => {
        const v = g.config?.[key];
        if (v === undefined || v === null) return def;
        try {
            return JSON.parse(JSON.stringify(v)) as T;
        } catch {
            return def;
        }
    };

    const [generalFilter, setGeneralFilter] = useState<TFilterSetting>(() =>
        fromConfig<TFilterSetting>(ConfigKey.PICKER_GENERAL_FILTER, {}),
    );
    const [includedCollections, setIncludedCollections] = useState<string[]>(() =>
        fromConfig<string[]>(ConfigKey.PICKER_INCLUDED_COLLECTIONS, []),
    );
    const [excludedCollections, setExcludedCollections] = useState<string[]>(() =>
        fromConfig<string[]>(ConfigKey.PICKER_EXCLUDED_COLLECTIONS, []),
    );
    const [advancedSettings, setAdvancedSettings] = useState<IPickerAdvancedSettings>(() =>
        normalizeAdvancedSettings(
            fromConfig<IPickerAdvancedSettings>(ConfigKey.PICKER_ADVANCED, { weights: [], wishlist: [] }),
        ),
    );
    const [history, setHistory] = useState<IPickerHistory[]>(() =>
        fromConfig<IPickerHistory[]>(ConfigKey.PICKER_HISTORY, []),
    );
    const historyRef = useRef<IPickerHistory[]>([]);
    const isLoadingRef = useRef(false);
    const lastInitTimeRef = useRef(0);
    const rollAreaRef = useRef<HTMLDivElement>(null);
    const [rollAreaWidth, setRollAreaWidth] = useState(0);
    const [profiles, setProfiles] = useState<IPickerProfile[]>(() =>
        fromConfig<IPickerProfile[]>(ConfigKey.PICKER_PROFILES, []),
    );
    const [newProfileName, setNewProfileName] = useState("");
    const [activePanel, setActivePanel] = useState<
        "filter" | "collection" | "weight" | "wishlist" | "history" | "profiles" | null
    >(null);
    const configSaveReady = useRef(false);

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        const el = rollAreaRef.current;
        if (!el) return;
        const obs = new ResizeObserver(() => setRollAreaWidth(el.offsetWidth));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_PROFILES, profiles);
    }, [profiles]);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_GENERAL_FILTER, generalFilter);
    }, [generalFilter]);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_INCLUDED_COLLECTIONS, includedCollections);
    }, [includedCollections]);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_EXCLUDED_COLLECTIONS, excludedCollections);
    }, [excludedCollections]);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_ADVANCED, advancedSettings);
    }, [advancedSettings]);

    useEffect(() => {
        if (!configSaveReady.current) return;
        g.saveConfig(ConfigKey.PICKER_HISTORY, history);
    }, [history]);

    useEffect(() => {
        if (state !== IBPState.Loading) {
            g.setLoading(false);
        }
    }, [state]);

    // MUST be declared last — React runs effects in declaration order,
    // so this flag is set after all save effects on first render, preventing initial saves.
    useEffect(() => {
        configSaveReady.current = true;
    }, []);

    const loadData = useCallback(async (withInit: boolean) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;
        try {
            setState(IBPState.Loading);
            const osuPath = g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
            if (withInit) {
                await window.olsCore.initStableReader(osuPath);
                lastInitTimeRef.current = Date.now();
            }

            g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_LOCAL));

            let local = await window.olsCore.getBeatmaps(OsuClients.Stable, 0, LOCAL_READ_PAGE_SIZE);
            local = await readAllWithOffset(
                (offset, limit) => window.olsCore.getBeatmaps(OsuClients.Stable, offset, limit),
                local,
            );

            let cols = await window.olsCore.getCollections(OsuClients.Stable, 0, LOCAL_READ_PAGE_SIZE);
            cols = await readAllWithOffset(
                (offset, limit) => window.olsCore.getCollections(OsuClients.Stable, offset, limit),
                cols,
            );

            g.setLoading(true, __(I18nStrings.MAIN_SRS_READING_SCORES));

            const rawScores = await window.olsCore.getScores(OsuClients.Stable, 0, LOCAL_READ_PAGE_SIZE);
            const scoreMap = new Map<string, StableScoreBeatmapData>();
            if (!("error" in rawScores)) {
                const allScores = await readAllWithOffset(
                    async (offset, limit) => (await window.olsCore.getScores(OsuClients.Stable, offset, limit)) as any,
                    rawScores,
                );
                for (const s of allScores.data as StableScoreBeatmapData[]) {
                    scoreMap.set(s.md5Hash, s);
                }
            }

            setMaps(
                local.data.map((m: StableLocalBeatmap) => ({
                    beatmapId: m.beatmapId,
                    beatmapSetId: m.beatmapSetId,
                    rankedStatus: m.rankedStatus,
                    md5Hash: m.md5Hash,
                    songTitle: m.songTitle,
                    songTitleUnicode: m.songTitleUnicode,
                    artist: m.artist,
                    artistUnicode: m.artistUnicode,
                    creatorName: m.creatorName,
                    difficultyName: m.difficultyName,
                    osuStandardGrade: m.osuStandardGrade,
                    unplayed: m.unplayed,
                    tags: m.tags,
                    drainSeconds: m.drainSeconds,
                    lastPlayedTime: m.lastPlayedTime,
                    ar: m.ar,
                    cs: m.cs,
                    hp: m.hp,
                    od: m.od,
                    numCircles: m.numCircles,
                    numSliders: m.numSliders,
                    numSpinners: m.numSpinners,
                    sliderMultiplier: m.sliderMultiplier,
                    stackLeniency: m.stackLeniency,
                    mode: m.mode,
                    source: m.source,
                    path: m.path,
                    audioFileName: m.audioFileName,
                    osuFileName: m.osuFileName,
                    starRating:
                        (m as any).stdStarRatings?.starRatings?.find((sr: any) => sr.mods === 0)?.starRating ?? 0,
                })),
            );
            setCollections(cols.data as IOsuCollection[]);
            setScoresByHash(scoreMap);
            setState(IBPState.Loaded);
        } catch (error) {
            console.error(error);
            setState(IBPState.None);
        } finally {
            isLoadingRef.current = false;
        }
    }, []);

    const onBtnClickedByInit = () => loadData(true);

    useEffect(() => {
        const handler = () => {
            if (Date.now() - lastInitTimeRef.current < 3000) return;
            loadData(false);
        };
        window.olsCore.on(IPC_RD_NAMES.STABLE_CHANGED, handler);
        return () => window.olsCore.removeListener(IPC_RD_NAMES.STABLE_CHANGED, handler);
    }, [loadData]);

    const [showFilteredList, setShowFilteredList] = useState(false);
    const [pickedMap, setPickedMap] = useState<IBeatmapData | null>(null);

    const filteredMaps = useMemo(
        () =>
            state === IBPState.Loaded
                ? filterMaps(maps, generalFilter, includedCollections, excludedCollections, collections)
                : [],
        [state, maps, generalFilter, includedCollections, excludedCollections, collections],
    );

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

    const onSaveProfile = () => {
        const name = newProfileName.trim();
        if (!name) return;
        const profile: IPickerProfile = {
            name,
            generalFilter,
            includedCollections,
            excludedCollections,
            advancedSettings,
        };
        setProfiles((prev) => {
            const idx = prev.findIndex((p) => p.name === name);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = profile;
                return next;
            }
            return [...prev, profile];
        });
        setNewProfileName("");
    };

    const onLoadProfile = (profile: IPickerProfile) => {
        setGeneralFilter(profile.generalFilter);
        setIncludedCollections(profile.includedCollections);
        setExcludedCollections(profile.excludedCollections);
        setAdvancedSettings(normalizeAdvancedSettings(profile.advancedSettings));
    };

    const onDeleteProfile = (name: string) => {
        setProfiles((prev) => prev.filter((p) => p.name !== name));
    };

    const onExportProfiles = () => {
        const json = JSON.stringify(profiles, null, 2);
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
            setProfiles((prev) => {
                const merged = [...prev];
                for (const p of imported) {
                    const normalizedProfile: IPickerProfile = {
                        ...p,
                        advancedSettings: normalizeAdvancedSettings(p.advancedSettings),
                    };
                    const idx = merged.findIndex((x) => x.name === normalizedProfile.name);
                    if (idx >= 0) merged[idx] = normalizedProfile;
                    else merged.push(normalizedProfile);
                }
                return merged;
            });
        } catch {}
    };

    const ROW_HEIGHT = 36;

    return (
        <>
            <BeatmapResultDrawer
                map={pickedMap}
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
                                                {row.map.starRating.toFixed(2)}
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
                        {__(I18nStrings.BTN_PICKER_ROLL)}: {filteredMaps.length} / {maps.length}
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
                            {filteredMaps.length} / {maps.length}
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
                            {profiles.map((p) => (
                                <Stack
                                    key={p.name}
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{
                                        px: 1,
                                        py: 0.5,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        borderRadius: 1,
                                    }}
                                >
                                    <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
                                        {p.name}
                                    </Typography>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => {
                                            onLoadProfile(p);
                                            setActivePanel(null);
                                        }}
                                    >
                                        {__(I18nStrings.MAIN_PICKER_PROFILE_LOAD)}
                                    </Button>
                                    <IconButton size="small" color="error" onClick={() => onDeleteProfile(p.name)}>
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
