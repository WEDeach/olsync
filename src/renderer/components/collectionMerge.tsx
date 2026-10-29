import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    Divider,
    FormControlLabel,
    IconButton,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AutoSizer, List } from "react-virtualized";
import type {
    CollectionMergeExecuteResponse,
    CollectionMergeExecuteResult,
    CollectionMergeHashInfo,
    CollectionMergeKind,
    CollectionMergePlan,
    CollectionMergeSelection,
    CollectionMergeState,
} from "../../defines/collection_sync";
import { buildCollectionMergePlan } from "../../shared/utils/collectionMerge";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";

const FOOTER_BUTTON_SX = { border: "1px solid transparent" };

const ROW_BASE = {
    borderInlineStart: "4px solid transparent",
    borderRadius: 1,
    pl: 0.5,
    pr: 0.5,
    py: 0.5,
};

function rowSx(include: boolean, selected: number) {
    if (!include) {
        return {
            ...ROW_BASE,
            borderInlineStartColor: "#A1662F",
            backgroundColor: "rgba(184, 121, 62, 0.10)",
            ".dark &": {
                borderInlineStartColor: "#D2A06A",
                backgroundColor: "rgba(210, 160, 106, 0.14)",
            },
        };
    }
    if (selected === 0) {
        return {
            ...ROW_BASE,
            borderInlineStartColor: "#C64E5B",
            backgroundColor: "rgba(198, 78, 91, 0.10)",
            ".dark &": {
                borderInlineStartColor: "#C97884",
                backgroundColor: "rgba(201, 120, 132, 0.14)",
            },
        };
    }
    return ROW_BASE;
}

function unwrapResult<T>(value: unknown): T {
    if (value !== null && typeof value === "object" && "error" in value) {
        const message = (value as { error?: unknown }).error;
        throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return value as T;
}

function kindLabel(kind: CollectionMergeKind): string {
    if (kind === "create") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_CREATE);
    if (kind === "update") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_UPDATE);
    if (kind === "in-sync") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_IN_SYNC);
    return __(I18nStrings.MAIN_COLLECTION_MERGE_KIND_SKIPPED);
}

function kindColor(
    kind: CollectionMergeKind,
): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
    if (kind === "create") return "success";
    if (kind === "update") return "primary";
    if (kind === "skipped") return "warning";
    return "default";
}

function hashLabel(hash: string, info: CollectionMergeHashInfo | undefined): string {
    if (!info || (info.artist.length === 0 && info.title.length === 0)) return hash.slice(0, 8);
    const name = `${info.artist}${info.artist && info.title ? " - " : ""}${info.title}`;
    return info.difficulty ? `${name} [${info.difficulty}]` : name;
}

const MergeHashRow = memo(function MergeHashRow({
    name,
    hash,
    info,
    checked,
    onStable,
    onLazer,
    disabled,
    onToggle,
}: {
    name: string;
    hash: string;
    info: CollectionMergeHashInfo | undefined;
    checked: boolean;
    onStable: boolean;
    onLazer: boolean;
    disabled: boolean;
    onToggle: (name: string, hash: string, checked: boolean) => void;
}) {
    const label = hashLabel(hash, info);
    return (
        <FormControlLabel
            sx={{ display: "flex", mx: 0, minWidth: 0 }}
            control={
                <Checkbox
                    size="small"
                    checked={checked}
                    onChange={(event) => onToggle(name, hash, event.target.checked)}
                    disabled={disabled}
                />
            }
            label={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
                    <Typography variant="body2" noWrap title={`${label} (${hash})`}>
                        {label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {`${onStable ? "S" : ""}${onLazer ? "L" : ""}`}
                    </Typography>
                </Stack>
            }
        />
    );
});

export function CollectionMergeView({ onBack }: { onBack: () => void }) {
    const [state, setState] = useState<CollectionMergeState | null>(null);
    const [plan, setPlan] = useState<CollectionMergePlan | null>(null);
    const [selections, setSelections] = useState<Record<string, CollectionMergeSelection>>({});
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [result, setResult] = useState<CollectionMergeExecuteResult | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const loadState = useCallback(async (): Promise<CollectionMergeState | null> => {
        setBusy(true);
        setError(null);
        try {
            const next = unwrapResult<CollectionMergeState>(await window.olsCore.cmGetState());
            setState(next);
            return next;
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
            return null;
        } finally {
            setBusy(false);
        }
    }, []);

    const buildPreview = useCallback(
        async (nextSelections: Record<string, CollectionMergeSelection>): Promise<CollectionMergePlan | null> => {
            setBusy(true);
            setError(null);
            try {
                const nextPlan = unwrapResult<CollectionMergePlan>(await window.olsCore.cmBuildPlan(nextSelections));
                setPlan(nextPlan);
                setResult(null);
                return nextPlan;
            } catch (buildError) {
                setError(buildError instanceof Error ? buildError.message : String(buildError));
                return null;
            } finally {
                setBusy(false);
            }
        },
        [],
    );

    useEffect(() => {
        void (async () => {
            const loaded = await loadState();
            if (loaded) await buildPreview({});
        })();
    }, [buildPreview, loadState]);

    const collectionsByName = useMemo(
        () => ({
            stable: new Map((state?.stable ?? []).map((entry) => [entry.name, entry.maps])),
            lazer: new Map((state?.lazer ?? []).map((entry) => [entry.name, entry.maps])),
        }),
        [state],
    );

    const mapsFor = useCallback(
        (name: string, side: "stable" | "lazer"): string[] => collectionsByName[side].get(name) ?? [],
        [collectionsByName],
    );

    const unionFor = useCallback(
        (name: string): string[] => Array.from(new Set([...mapsFor(name, "stable"), ...mapsFor(name, "lazer")])).sort(),
        [mapsFor],
    );

    const includeFor = useCallback((name: string): boolean => selections[name]?.include !== false, [selections]);

    const selectedHashesFor = useCallback(
        (name: string): Set<string> => {
            const selection = selections[name];
            if (selection?.hashes !== undefined) return new Set(selection.hashes);
            return new Set(unionFor(name));
        },
        [selections, unionFor],
    );

    const updateSelection = useCallback((name: string, selection: CollectionMergeSelection) => {
        setSelections((current) => ({ ...current, [name]: selection }));
    }, []);

    const setInclude = useCallback(
        (name: string, include: boolean) => {
            if (!include) {
                updateSelection(name, { include: false });
                return;
            }
            updateSelection(name, { include: true, hashes: Array.from(selectedHashesFor(name)).sort() });
        },
        [selectedHashesFor, updateSelection],
    );

    const setHashes = useCallback(
        (name: string, hashes: string[]) => {
            updateSelection(name, { include: true, hashes: Array.from(new Set(hashes)).sort() });
        },
        [updateSelection],
    );

    const toggleHash = useCallback(
        (name: string, hash: string, checked: boolean) => {
            setSelections((current) => {
                const next = new Set(current[name]?.hashes ?? unionFor(name));
                if (checked) next.add(hash);
                else next.delete(hash);
                return { ...current, [name]: { include: true, hashes: Array.from(next).sort() } };
            });
        },
        [unionFor],
    );

    const detailsByName = useMemo(
        () => new Map((plan?.collections ?? []).map((entry) => [entry.name, entry.details])),
        [plan],
    );

    const detailsByHash = useMemo(() => {
        const map = new Map<string, CollectionMergeHashInfo>();
        for (const entry of plan?.collections ?? []) {
            for (const [hash, info] of Object.entries(entry.details)) map.set(hash, info);
        }
        return map;
    }, [plan]);

    // The preview is pure and local, so per-hash toggles update it instantly;
    // the main process rebuilds the identical plan when execute runs.
    const preview = useMemo(() => {
        if (!state) return null;
        return buildCollectionMergePlan({
            stable: state.stable,
            lazer: state.lazer,
            selections,
            detailsByHash,
        });
    }, [detailsByHash, selections, state]);

    const onRefresh = useCallback(async () => {
        setResult(null);
        setSelections({});
        setExpanded({});
        setNotice(null);
        await window.olsCore.cmInvalidatePlan();
        const loaded = await loadState();
        if (loaded) await buildPreview({});
    }, [buildPreview, loadState]);

    const onRun = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            // Rebuild against a fresh read first, so a changed collection list
            // is detected instead of silently merging something else.
            const fresh = await buildPreview(selections);
            if (!fresh) return;
            if (preview && JSON.stringify(fresh.stablePayload) !== JSON.stringify(preview.stablePayload)) {
                await loadState();
                setNotice(__(I18nStrings.MAIN_COLLECTION_MERGE_STALE));
                return;
            }
            const response = unwrapResult<CollectionMergeExecuteResponse>(await window.olsCore.cmExecute());
            if (response.stale) {
                setPlan(response.plan ?? null);
                setNotice(__(I18nStrings.MAIN_COLLECTION_MERGE_STALE));
                return;
            }
            if (response.result) {
                setResult(response.result);
                await loadState();
                if (response.result.stableWritten && response.result.errors.length === 0) {
                    setNotice(__(I18nStrings.MAIN_COLLECTION_MERGE_SUCCESS));
                }
            }
        } catch (runError) {
            setError(runError instanceof Error ? runError.message : String(runError));
        } finally {
            setBusy(false);
        }
    }, [buildPreview, loadState, preview, selections]);

    const collectionNames = useMemo(() => {
        if (!state) return [];
        const names = new Set<string>();
        for (const entry of [...state.stable, ...state.lazer]) names.add(entry.name);
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [state]);

    const countsBySide = useMemo(() => {
        const stable = new Map<string, number>();
        const lazer = new Map<string, number>();
        for (const entry of state?.stable ?? []) stable.set(entry.name, entry.maps.length);
        for (const entry of state?.lazer ?? []) lazer.set(entry.name, entry.maps.length);
        return { stable, lazer };
    }, [state]);

    const clientRunning = Boolean(state?.runningStable);
    const executeBlockReason = clientRunning
        ? __(I18nStrings.MAIN_COLLECTION_SYNC_CLIENT_RUNNING)
        : !preview
          ? __(I18nStrings.MAIN_COLLECTION_SYNC_PREVIEW_EMPTY)
          : "";

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button variant="text" startIcon={<ArrowBackIcon />} onClick={onBack}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_BACK)}
                </Button>
                <Typography variant="h6" sx={{ flex: 1 }}>
                    {__(I18nStrings.BTN_COLLECTION_MERGE)}
                </Typography>
                {busy && <CircularProgress size={20} />}
                <Tooltip arrow title={__(I18nStrings.BTN_COLLECTION_SYNC_REFRESH)}>
                    <span>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={() => void onRefresh()}
                            disabled={busy}
                        >
                            {__(I18nStrings.BTN_COLLECTION_SYNC_REFRESH)}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                {__(I18nStrings.MAIN_COLLECTION_MERGE_DESC)}
            </Typography>

            {state && (!state.hasStable || !state.hasLazer) && (
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                    <Typography variant="body2">{__(I18nStrings.MAIN_COLLECTION_SYNC_NO_CLIENT)}</Typography>
                    {!state.hasStable && (
                        <Typography variant="caption" sx={{ display: "block" }}>
                            {`Stable: ${state.stableError ?? "-"}`}
                        </Typography>
                    )}
                    {!state.hasLazer && (
                        <Typography variant="caption" sx={{ display: "block" }}>
                            {`Lazer: ${state.lazerError ?? "-"}`}
                        </Typography>
                    )}
                </Alert>
            )}

            {state?.runningStable && (
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                    {__(I18nStrings.MAIN_COLLECTION_SYNC_CLIENT_RUNNING)}
                </Alert>
            )}

            {notice && <Alert severity="info">{notice}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}

            <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ alignItems: "stretch" }}>
                <Paper
                    variant="outlined"
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 360,
                        maxHeight: "60vh",
                    }}
                >
                    <Box sx={{ p: 2, pb: 1 }}>
                        <Typography variant="subtitle1">{__(I18nStrings.MAIN_COLLECTION_MERGE_CHOICE)}</Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2, pt: 1 }}>
                        {collectionNames.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_NO_COLLECTIONS)}
                            </Typography>
                        ) : (
                            <Stack spacing={1}>
                                {collectionNames.map((name) => {
                                    const union = unionFor(name);
                                    const selected = selectedHashesFor(name);
                                    const include = includeFor(name);
                                    const stableMaps = mapsFor(name, "stable");
                                    const lazerMaps = mapsFor(name, "lazer");
                                    const stableSet = new Set(stableMaps);
                                    const lazerSet = new Set(lazerMaps);
                                    const details = detailsByName.get(name);
                                    const isExpanded = expanded[name] ?? false;
                                    return (
                                        <Box key={name} sx={rowSx(include, selected.size)}>
                                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() =>
                                                        setExpanded((current) => ({ ...current, [name]: !isExpanded }))
                                                    }
                                                    disabled={union.length === 0}
                                                >
                                                    <ExpandMoreIcon
                                                        fontSize="small"
                                                        sx={{
                                                            transform: isExpanded ? "rotate(180deg)" : "none",
                                                            transition: "transform 0.2s",
                                                        }}
                                                    />
                                                </IconButton>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography variant="body2" noWrap title={name}>
                                                        {name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {`Stable ${countsBySide.stable.get(name) ?? 0} / Lazer ${countsBySide.lazer.get(name) ?? 0} · ${__(
                                                            I18nStrings.MAIN_COLLECTION_MERGE_SELECTED,
                                                            {
                                                                selected: String(selected.size),
                                                                total: String(union.length),
                                                            },
                                                        )}`}
                                                    </Typography>
                                                </Box>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            size="small"
                                                            checked={include}
                                                            onChange={(event) => setInclude(name, event.target.checked)}
                                                            disabled={busy}
                                                        />
                                                    }
                                                    label={
                                                        <Typography variant="caption">
                                                            {__(I18nStrings.MAIN_COLLECTION_MERGE_INCLUDE)}
                                                        </Typography>
                                                    }
                                                />
                                            </Stack>
                                            <Collapse in={isExpanded && include} timeout="auto" unmountOnExit>
                                                <Stack spacing={0.5} sx={{ pl: 4, pt: 0.5, pr: 0.5 }}>
                                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                                                        <Button
                                                            size="small"
                                                            onClick={() => setHashes(name, union)}
                                                            disabled={busy}
                                                        >
                                                            {__(I18nStrings.MAIN_COLLECTION_MERGE_SELECT_ALL)}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            onClick={() => setHashes(name, stableMaps)}
                                                            disabled={busy || stableMaps.length === 0}
                                                        >
                                                            {__(I18nStrings.MAIN_COLLECTION_MERGE_ONLY_STABLE)}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            onClick={() => setHashes(name, lazerMaps)}
                                                            disabled={busy || lazerMaps.length === 0}
                                                        >
                                                            {__(I18nStrings.MAIN_COLLECTION_MERGE_ONLY_LAZER)}
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            onClick={() => setHashes(name, [])}
                                                            disabled={busy || selected.size === 0}
                                                        >
                                                            {__(I18nStrings.MAIN_COLLECTION_MERGE_CLEAR)}
                                                        </Button>
                                                    </Stack>
                                                    <Box
                                                        sx={{
                                                            height: 220,
                                                            overflow: "hidden",
                                                            border: "1px solid",
                                                            borderColor: "divider",
                                                            borderRadius: 1,
                                                            p: 0.5,
                                                        }}
                                                    >
                                                        <AutoSizer disableHeight>
                                                            {({ width }) => (
                                                                <List
                                                                    width={width}
                                                                    height={210}
                                                                    rowCount={union.length}
                                                                    rowHeight={36}
                                                                    overscanRowCount={8}
                                                                    rowKey={({ index }: { index: number }) =>
                                                                        union[index]
                                                                    }
                                                                    rowRenderer={({ index, key, style }) => {
                                                                        const hash = union[index];
                                                                        return (
                                                                            <div key={key} style={style}>
                                                                                <MergeHashRow
                                                                                    name={name}
                                                                                    hash={hash}
                                                                                    info={details?.[hash]}
                                                                                    checked={selected.has(hash)}
                                                                                    onStable={stableSet.has(hash)}
                                                                                    onLazer={lazerSet.has(hash)}
                                                                                    disabled={busy}
                                                                                    onToggle={toggleHash}
                                                                                />
                                                                            </div>
                                                                        );
                                                                    }}
                                                                />
                                                            )}
                                                        </AutoSizer>
                                                    </Box>
                                                </Stack>
                                            </Collapse>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        )}
                    </Box>
                </Paper>

                <Paper
                    variant="outlined"
                    sx={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 360,
                        maxHeight: "60vh",
                    }}
                >
                    <Box sx={{ p: 2, pb: 1 }}>
                        <Typography variant="subtitle1">{__(I18nStrings.MAIN_COLLECTION_MERGE_PREVIEW)}</Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2, pt: 1 }}>
                        {!preview ? (
                            <Typography variant="body2" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_MERGE_PREVIEW_EMPTY)}
                            </Typography>
                        ) : (
                            <Stack spacing={1.5}>
                                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                    <Chip size="small" label={`${kindLabel("create")} ${preview.stats.create}`} />
                                    <Chip
                                        size="small"
                                        color="primary"
                                        label={`${kindLabel("update")} ${preview.stats.update}`}
                                    />
                                    <Chip size="small" label={`${kindLabel("in-sync")} ${preview.stats.inSync}`} />
                                    <Chip
                                        size="small"
                                        color={preview.stats.skipped > 0 ? "warning" : "default"}
                                        label={`${kindLabel("skipped")} ${preview.stats.skipped}`}
                                    />
                                </Stack>

                                {preview.collections.map((entry) => (
                                    <Box key={entry.name}>
                                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                            <Chip
                                                size="small"
                                                color={kindColor(entry.kind)}
                                                label={kindLabel(entry.kind)}
                                            />
                                            <Typography
                                                variant="body2"
                                                sx={{ flex: 1, minWidth: 0 }}
                                                noWrap
                                                title={entry.name}
                                            >
                                                {entry.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {`${entry.target?.length ?? 0} / ${
                                                    new Set([...entry.stable, ...entry.lazer]).size
                                                }`}
                                            </Typography>
                                        </Stack>
                                        {(entry.changes.add.length > 0 || entry.changes.remove.length > 0) && (
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: "block", pl: 1 }}
                                            >
                                                {`${__(I18nStrings.MAIN_COLLECTION_SYNC_CHANGES)}: Stable +${entry.changes.add.length} -${entry.changes.remove.length}`}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Box>
                    <Divider />
                    <Box sx={{ p: 2 }}>
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_MERGE_CONFIRM_DESC)}
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                <Tooltip arrow placement="top" title={executeBlockReason}>
                                    <span>
                                        <Button
                                            variant="contained"
                                            color="error"
                                            sx={FOOTER_BUTTON_SX}
                                            startIcon={<PlayArrowIcon />}
                                            onClick={() => void onRun()}
                                            disabled={busy || !preview || clientRunning}
                                        >
                                            {__(I18nStrings.BTN_COLLECTION_MERGE_EXECUTE)}
                                        </Button>
                                    </span>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </Box>
                </Paper>
            </Stack>

            {result && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ pb: 1 }}>
                        {__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT)}
                    </Typography>
                    <Stack spacing={0.5}>
                        <Typography variant="body2">
                            {`${__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_STABLE)}: ${
                                result.stableWritten
                                    ? __(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_WRITTEN)
                                    : __(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_SKIPPED)
                            }`}
                        </Typography>
                        {result.errors.length > 0 && <Alert severity="error">{result.errors.join(" | ")}</Alert>}
                        {result.blocked === "stable_running" && (
                            <Alert severity="error" icon={<WarningAmberIcon />}>
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_BLOCKED_RUNNING)}
                            </Alert>
                        )}
                        <Typography variant="caption" color="text.secondary">
                            {`${__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_BACKUP)}: ${result.backupPaths.join(", ")}`}
                        </Typography>
                    </Stack>
                </Paper>
            )}

            <Typography variant="caption" color="text.secondary">
                {`${__(I18nStrings.MAIN_COLLECTION_SYNC_COLLECTIONS)}: ${collectionNames.length}`}
            </Typography>
        </Stack>
    );
}
