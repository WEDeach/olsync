import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Divider,
    FormControlLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    CollectionSyncChoice,
    CollectionSyncExecuteResult,
    CollectionSyncKind,
    CollectionSyncPlan,
    CollectionSyncState,
    CollectionSyncType,
    MissingBeatmapDownload,
    MissingBeatmapReport,
} from "../../defines/collection_sync";
import { GetDLOptionByBuiltin } from "../../utils/download";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";

const TYPE_OPTIONS: CollectionSyncType[] = ["default", "excluded", "delete"];

const FOOTER_BUTTON_SX = { border: "1px solid transparent" };

const TYPE_ROW_BASE = {
    borderInlineStart: "4px solid transparent",
    borderRadius: 1,
    pl: 1.5,
    pr: 0.5,
    py: 0.5,
};

function typeRowSx(type: CollectionSyncType) {
    if (type === "excluded") {
        return {
            ...TYPE_ROW_BASE,
            // Deeper than `warning.main` :>
            borderInlineStartColor: "#A1662F",
            backgroundColor: "rgba(184, 121, 62, 0.10)",
            ".dark &": {
                borderInlineStartColor: "#D2A06A",
                backgroundColor: "rgba(210, 160, 106, 0.14)",
            },
        };
    }
    if (type === "delete") {
        return {
            ...TYPE_ROW_BASE,
            borderInlineStartColor: "#C64E5B",
            backgroundColor: "rgba(198, 78, 91, 0.10)",
            ".dark &": {
                borderInlineStartColor: "#C97884",
                backgroundColor: "rgba(201, 120, 132, 0.14)",
            },
        };
    }
    return TYPE_ROW_BASE;
}

function unwrapResult<T>(value: unknown): T {
    if (value !== null && typeof value === "object" && "error" in value) {
        const message = (value as { error?: unknown }).error;
        throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return value as T;
}

function typeLabel(type: CollectionSyncType): string {
    if (type === "excluded") return __(I18nStrings.MAIN_COLLECTION_SYNC_TYPE_EXCLUDED);
    if (type === "delete") return __(I18nStrings.MAIN_COLLECTION_SYNC_TYPE_DELETE);
    return __(I18nStrings.MAIN_COLLECTION_SYNC_TYPE_DEFAULT);
}

function kindLabel(kind: CollectionSyncKind): string {
    if (kind === "create") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_CREATE);
    if (kind === "update") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_UPDATE);
    if (kind === "in-sync") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_IN_SYNC);
    if (kind === "conflict") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_CONFLICT);
    if (kind === "excluded") return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_EXCLUDED);
    return __(I18nStrings.MAIN_COLLECTION_SYNC_KIND_DELETE);
}

function kindColor(
    kind: CollectionSyncKind,
): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" {
    if (kind === "create") return "success";
    if (kind === "update") return "primary";
    if (kind === "conflict") return "warning";
    if (kind === "delete") return "error";
    return "default";
}

function formatHashes(hashes: string[]): string {
    return hashes.map((hash) => hash.slice(0, 8)).join(", ");
}

function showMissingReport(report: MissingBeatmapReport) {
    const title = __(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_TITLE);
    if (report.missingHashes === 0) {
        g.setDialog(true, {
            title,
            content: __(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_NONE),
            actions: [{ label: __(I18nStrings.BTN_CONFIRM), callback: () => g.setDialog(false) }],
        });
        return;
    }

    const affected = report.collections.filter((entry) => entry.missing > 0);
    const content = (
        <Stack spacing={1.5}>
            <Typography variant="body2">{__(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_DESC)}</Typography>
            <Stack spacing={0.5}>
                {affected.map((entry) => (
                    <Stack
                        key={entry.name}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" noWrap title={entry.name}>
                                {entry.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {`Stable ${entry.missingStable} / Lazer ${entry.missingLazer}`}
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            {`${entry.missing} / ${entry.total}`}
                        </Typography>
                    </Stack>
                ))}
            </Stack>
            <Typography variant="body2">
                {__(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_SUMMARY, {
                    missing: String(report.missingHashes),
                    sets: String(report.downloads.length),
                })}
            </Typography>
            {report.unresolvedHashes.length > 0 && (
                <Typography variant="caption" color="warning.main">
                    {__(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_UNRESOLVED, {
                        count: String(report.unresolvedHashes.length),
                    })}
                </Typography>
            )}
            {report.notFoundHashes.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                    {__(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_NOT_FOUND, {
                        count: String(report.notFoundHashes.length),
                    })}
                </Typography>
            )}
        </Stack>
    );

    const enqueueDownloads = (sets: MissingBeatmapDownload[]) => {
        g.setDialog(false);
        const option = GetDLOptionByBuiltin(
            sets.map(({ beatmapsetId, missingSource }) => ({
                source: "osu-official" as const,
                beatmapsetId,
                missingSource,
            })),
        );
        void option.callback();
    };

    const actions: Array<{ label: string; callback: () => void }> = [];
    // A `common` set is missing on both sides, so either side's download needs it.
    const stableDownloads = report.downloads.filter((entry) => entry.missingSource !== "lazer");
    const lazerDownloads = report.downloads.filter((entry) => entry.missingSource !== "stable");
    if (stableDownloads.length > 0 && stableDownloads.length < report.downloads.length) {
        actions.push({
            label: __(I18nStrings.BTN_COLLECTION_SYNC_DOWNLOAD_MISSING_STABLE, {
                count: String(stableDownloads.length),
            }),
            callback: () => enqueueDownloads(stableDownloads),
        });
    }
    if (lazerDownloads.length > 0 && lazerDownloads.length < report.downloads.length) {
        actions.push({
            label: __(I18nStrings.BTN_COLLECTION_SYNC_DOWNLOAD_MISSING_LAZER, {
                count: String(lazerDownloads.length),
            }),
            callback: () => enqueueDownloads(lazerDownloads),
        });
    }
    if (report.downloads.length > 0) {
        actions.push({
            label: __(I18nStrings.BTN_COLLECTION_SYNC_DOWNLOAD_MISSING, {
                count: String(report.downloads.length),
            }),
            callback: () => enqueueDownloads(report.downloads),
        });
    }
    actions.push({ label: __(I18nStrings.BTN_CANCEL), callback: () => g.setDialog(false) });
    g.setDialog(true, { title, content, actions });
}

export function CollectionSyncView({ onBack }: { onBack: () => void }) {
    const [state, setState] = useState<CollectionSyncState | null>(null);
    const [plan, setPlan] = useState<CollectionSyncPlan | null>(null);
    const [resolutions, setResolutions] = useState<Record<string, CollectionSyncChoice>>({});
    const [result, setResult] = useState<CollectionSyncExecuteResult | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [checkProgress, setCheckProgress] = useState<{ resolved: number; total: number } | null>(null);

    useEffect(() => {
        return window.olsCore.onCsMissingProgress((resolved, total) => setCheckProgress({ resolved, total }));
    }, []);

    const loadState = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const next = unwrapResult<CollectionSyncState>(await window.olsCore.csGetState());
            setState(next);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setBusy(false);
        }
    }, []);

    const buildPreview = useCallback(async (nextResolutions: Record<string, CollectionSyncChoice>) => {
        setBusy(true);
        setError(null);
        try {
            const list = Object.entries(nextResolutions).map(([name, choice]) => ({ name, choice }));
            const nextPlan = unwrapResult<CollectionSyncPlan>(await window.olsCore.csBuildPlan(list));
            setPlan(nextPlan);
            setResult(null);
            return nextPlan;
        } catch (buildError) {
            setError(buildError instanceof Error ? buildError.message : String(buildError));
            return null;
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        void loadState();
    }, [loadState]);

    const onTypeChanged = useCallback(async (name: string, type: CollectionSyncType) => {
        setBusy(true);
        setError(null);
        try {
            const settings = unwrapResult<CollectionSyncState["settings"]>(
                await window.olsCore.csSetCollectionType(name, type),
            );
            setState((current) => (current ? { ...current, settings } : current));
            setPlan(null);
            setResult(null);
        } catch (typeError) {
            setError(typeError instanceof Error ? typeError.message : String(typeError));
        } finally {
            setBusy(false);
        }
    }, []);

    const onResolve = useCallback(
        async (name: string, choice: CollectionSyncChoice) => {
            const next = { ...resolutions, [name]: choice };
            setResolutions(next);
            await buildPreview(next);
        },
        [buildPreview, resolutions],
    );

    const onExcludeNotFoundChanged = useCallback(
        async (enabled: boolean) => {
            setBusy(true);
            setError(null);
            try {
                const next = unwrapResult<CollectionSyncState>(await window.olsCore.csSetExcludeNotFound(enabled));
                setState(next);
                if (plan) await buildPreview(resolutions);
            } catch (toggleError) {
                setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
            } finally {
                setBusy(false);
            }
        },
        [buildPreview, plan, resolutions],
    );

    const onRefresh = useCallback(async () => {
        setPlan(null);
        setResult(null);
        setResolutions({});
        setNotice(null);
        await window.olsCore.csInvalidatePlan();
        await loadState();
    }, [loadState]);

    const onRun = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const response = unwrapResult<{
                stale: boolean;
                plan?: CollectionSyncPlan;
                result?: CollectionSyncExecuteResult;
            }>(await window.olsCore.csExecute());

            if (response.stale) {
                setPlan(response.plan ?? null);
                setNotice(__(I18nStrings.MAIN_COLLECTION_SYNC_STALE));
                return;
            }
            if (response.result) {
                setResult(response.result);
                setPlan(null);
                setResolutions({});
                await loadState();
            }
        } catch (runError) {
            setError(runError instanceof Error ? runError.message : String(runError));
        } finally {
            setBusy(false);
        }
    }, [loadState]);

    const onExportSettings = useCallback(async () => {
        setBusy(true);
        try {
            const filePath = unwrapResult<string | null>(await window.olsCore.csExportSettings());
            if (filePath) setNotice(__(I18nStrings.MAIN_COLLECTION_SYNC_EXPORTED).replace(":path", filePath));
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : String(exportError));
        } finally {
            setBusy(false);
        }
    }, []);

    const onImportSettings = useCallback(async () => {
        setBusy(true);
        try {
            const settings = unwrapResult<CollectionSyncState["settings"] | null>(
                await window.olsCore.csImportSettings(),
            );
            if (settings) {
                setState((current) => (current ? { ...current, settings } : current));
                setPlan(null);
                setNotice(__(I18nStrings.MAIN_COLLECTION_SYNC_IMPORTED_SETTINGS));
            }
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : String(importError));
        } finally {
            setBusy(false);
        }
    }, []);

    const onExportContent = useCallback(async () => {
        setBusy(true);
        try {
            const exported = unwrapResult<{ filePath: string } | null>(await window.olsCore.csExportContent());
            if (exported) setNotice(__(I18nStrings.MAIN_COLLECTION_SYNC_EXPORTED).replace(":path", exported.filePath));
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : String(exportError));
        } finally {
            setBusy(false);
        }
    }, []);

    const onImportContent = useCallback(async () => {
        setBusy(true);
        try {
            const summary = unwrapResult<{ collectionCount: number; unresolvedIds: number } | null>(
                await window.olsCore.csImportContent(),
            );
            if (summary) {
                setPlan(null);
                setNotice(
                    `${__(I18nStrings.MAIN_COLLECTION_SYNC_IMPORTED_CONTENT).replace(
                        ":count",
                        String(summary.collectionCount),
                    )}${
                        summary.unresolvedIds > 0
                            ? ` (${__(I18nStrings.MAIN_COLLECTION_SYNC_NOT_INSTALLED)}: ${summary.unresolvedIds})`
                            : ""
                    }`,
                );
            }
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : String(importError));
        } finally {
            setBusy(false);
        }
    }, []);

    const onCheckMissing = useCallback(async () => {
        setBusy(true);
        setError(null);
        setNotice(null);
        setCheckProgress(null);
        try {
            const report = unwrapResult<MissingBeatmapReport>(await window.olsCore.csCheckMissing());
            setState((current) => (current ? { ...current, notFoundHashes: report.notFoundHashes } : current));
            // A fresh not-found list can change an exclusion target, so keep an
            // existing preview consistent with it.
            if (plan) await buildPreview(resolutions);
            showMissingReport(report);
        } catch (checkError) {
            setError(checkError instanceof Error ? checkError.message : String(checkError));
        } finally {
            setBusy(false);
            setCheckProgress(null);
        }
    }, [buildPreview, plan, resolutions]);

    const onResetBaseline = useCallback(async () => {
        setBusy(true);
        try {
            const baseline = unwrapResult<CollectionSyncState["baseline"]>(await window.olsCore.csResetBaseline());
            setState((current) => (current ? { ...current, baseline } : current));
            setPlan(null);
            setNotice(__(I18nStrings.MAIN_COLLECTION_SYNC_RESET_DONE));
        } catch (resetError) {
            setError(resetError instanceof Error ? resetError.message : String(resetError));
        } finally {
            setBusy(false);
        }
    }, []);

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

    const unresolvedConflicts = plan ? plan.collections.filter((entry) => entry.kind === "conflict").length : 0;
    const clientRunning = Boolean(state?.runningStable);
    // Shown on the execute button so a disabled state always explains itself.
    const executeBlockReason = clientRunning
        ? __(I18nStrings.MAIN_COLLECTION_SYNC_CLIENT_RUNNING)
        : unresolvedConflicts > 0
          ? __(I18nStrings.MAIN_COLLECTION_SYNC_CONFLICT_BLOCK)
          : !plan
            ? __(I18nStrings.MAIN_COLLECTION_SYNC_PREVIEW_EMPTY)
            : "";
    // The check reads both libraries directly, so it only needs the clients up.
    const checkBlockReason =
        !state?.hasStable || !state?.hasLazer ? __(I18nStrings.MAIN_COLLECTION_SYNC_NO_CLIENT) : "";
    const totalChanges = plan
        ? plan.collections.reduce(
              (sum, entry) => sum + entry.changes.stable.add.length + entry.changes.stable.remove.length,
              0,
          )
        : 0;

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button variant="text" startIcon={<ArrowBackIcon />} onClick={onBack}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_BACK)}
                </Button>
                <Typography variant="h6" sx={{ flex: 1 }}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC)}
                </Typography>
                {busy && <CircularProgress size={20} />}
                <Tooltip arrow title={__(I18nStrings.BTN_COLLECTION_SYNC_REFRESH)}>
                    <span>
                        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={busy}>
                            {__(I18nStrings.BTN_COLLECTION_SYNC_REFRESH)}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            <Typography variant="body2" color="text.secondary">
                {__(I18nStrings.MAIN_COLLECTION_SYNC_DESC)}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={onExportSettings} disabled={busy}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_EXPORT_SETTINGS)}
                </Button>
                <Button variant="outlined" startIcon={<CloudDownloadIcon />} onClick={onImportSettings} disabled={busy}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_IMPORT_SETTINGS)}
                </Button>
                <Button variant="outlined" startIcon={<CloudUploadIcon />} onClick={onExportContent} disabled={busy}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_EXPORT_CONTENT)}
                </Button>
                <Button variant="outlined" startIcon={<CloudDownloadIcon />} onClick={onImportContent} disabled={busy}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_IMPORT_CONTENT)}
                </Button>
                <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={onResetBaseline} disabled={busy}>
                    {__(I18nStrings.BTN_COLLECTION_SYNC_RESET_BASELINE)}
                </Button>
            </Stack>

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

            {state?.hasContentOverride && (
                <Alert severity="info">{__(I18nStrings.MAIN_COLLECTION_SYNC_OVERRIDE)}</Alert>
            )}

            {state?.runningStable && (
                <Alert severity="warning" icon={<WarningAmberIcon />}>
                    {__(I18nStrings.MAIN_COLLECTION_SYNC_CLIENT_RUNNING)}
                </Alert>
            )}

            {notice && <Alert severity="info">{notice}</Alert>}
            {checkProgress && checkProgress.total > 0 && (
                <Alert severity="info">
                    {__(I18nStrings.MAIN_COLLECTION_SYNC_MISSING_RESOLVING, {
                        resolved: String(checkProgress.resolved),
                        total: String(checkProgress.total),
                    })}
                </Alert>
            )}
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
                        <Typography variant="subtitle1">{__(I18nStrings.MAIN_COLLECTION_SYNC_TYPE)}</Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2, pt: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", pb: 1 }}>
                            {__(I18nStrings.MAIN_COLLECTION_SYNC_TYPE_DELETE_DESC)}
                        </Typography>
                        {collectionNames.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_NO_COLLECTIONS)}
                            </Typography>
                        ) : (
                            <Stack spacing={1}>
                                {collectionNames.map((name) => {
                                    const type = state?.settings.collections[name] ?? "default";
                                    const stableCount = countsBySide.stable.get(name);
                                    const lazerCount = countsBySide.lazer.get(name);
                                    return (
                                        <Box key={name} sx={typeRowSx(type)}>
                                            <Stack
                                                direction="row"
                                                spacing={1}
                                                sx={{ alignItems: "center", justifyContent: "space-between" }}
                                            >
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography variant="body2" noWrap title={name}>
                                                        {name}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {`Stable ${stableCount ?? 0} / Lazer ${lazerCount ?? 0}`}
                                                    </Typography>
                                                </Box>
                                                <Select
                                                    size="small"
                                                    value={type}
                                                    onChange={(event) =>
                                                        void onTypeChanged(
                                                            name,
                                                            event.target.value as CollectionSyncType,
                                                        )
                                                    }
                                                    sx={{ minWidth: 132 }}
                                                    disabled={busy}
                                                >
                                                    {TYPE_OPTIONS.map((option) => (
                                                        <MenuItem key={option} value={option}>
                                                            {typeLabel(option)}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </Stack>
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
                        <Typography variant="subtitle1">{__(I18nStrings.MAIN_COLLECTION_SYNC_PREVIEW)}</Typography>
                    </Box>
                    <Divider />
                    <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2, pt: 1 }}>
                        {plan && (
                            <Stack direction="row" spacing={1} sx={{ pb: 1.5, flexWrap: "wrap" }}>
                                <Chip size="small" label={`${kindLabel("create")} ${plan.stats.create}`} />
                                <Chip
                                    size="small"
                                    color="primary"
                                    label={`${kindLabel("update")} ${plan.stats.update}`}
                                />
                                <Chip size="small" label={`${kindLabel("in-sync")} ${plan.stats.inSync}`} />
                                <Chip
                                    size="small"
                                    color={plan.stats.conflict > 0 ? "warning" : "default"}
                                    label={`${kindLabel("conflict")} ${plan.stats.conflict}`}
                                />
                                <Chip size="small" label={`${kindLabel("excluded")} ${plan.stats.excluded}`} />
                                <Chip
                                    size="small"
                                    color={plan.stats.deletions > 0 ? "error" : "default"}
                                    label={`${kindLabel("delete")} ${plan.stats.deletions}`}
                                />
                            </Stack>
                        )}
                        {!plan ? (
                            <Typography variant="body2" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_PREVIEW_EMPTY)}
                            </Typography>
                        ) : (
                            <Stack spacing={1.5}>
                                <Typography variant="body2" color="text.secondary">
                                    {`${__(I18nStrings.MAIN_COLLECTION_SYNC_BASELINE)}: ${
                                        state?.baseline && state.baseline.syncedAt > 0
                                            ? new Date(state.baseline.syncedAt).toLocaleString()
                                            : __(I18nStrings.MAIN_COLLECTION_SYNC_BASELINE_NONE)
                                    }`}
                                </Typography>

                                {plan.collections.map((entry) => (
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
                                                {`${entry.stable.length} / ${entry.lazer.length}`}
                                            </Typography>
                                        </Stack>

                                        {(entry.changes.stable.add.length > 0 ||
                                            entry.changes.stable.remove.length > 0 ||
                                            entry.changes.lazer.add.length > 0 ||
                                            entry.changes.lazer.remove.length > 0) && (
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{ display: "block", pl: 1 }}
                                            >
                                                {`${__(I18nStrings.MAIN_COLLECTION_SYNC_CHANGES)}: Stable +${entry.changes.stable.add.length} -${entry.changes.stable.remove.length}, Lazer +${entry.changes.lazer.add.length} -${entry.changes.lazer.remove.length}`}
                                            </Typography>
                                        )}

                                        {entry.kind === "conflict" && entry.conflict && (
                                            <Box sx={{ pl: 1, pt: 0.5 }}>
                                                <Typography
                                                    variant="caption"
                                                    color="warning.main"
                                                    sx={{ display: "block" }}
                                                >
                                                    {entry.conflict.kind === "missing-side"
                                                        ? __(I18nStrings.MAIN_COLLECTION_SYNC_CONFLICT_MISSING).replace(
                                                              ":client",
                                                              entry.conflict.presentOn === "stable"
                                                                  ? "Lazer"
                                                                  : "Stable",
                                                          )
                                                        : __(I18nStrings.MAIN_COLLECTION_SYNC_CONFLICT_CONTENT)}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    sx={{ display: "block" }}
                                                >
                                                    {`Stable ${entry.stable.length} / Lazer ${entry.lazer.length}`}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    sx={{ display: "block" }}
                                                >
                                                    {__(I18nStrings.MAIN_COLLECTION_SYNC_KEEP)}
                                                </Typography>
                                                <Stack direction="row" spacing={1} sx={{ pt: 0.5, flexWrap: "wrap" }}>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => void onResolve(entry.name, "union")}
                                                        disabled={busy}
                                                    >
                                                        {__(I18nStrings.MAIN_COLLECTION_SYNC_UNION)}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => void onResolve(entry.name, "stable")}
                                                        disabled={busy}
                                                    >
                                                        {__(I18nStrings.MAIN_COLLECTION_SYNC_USE_STABLE)}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => void onResolve(entry.name, "lazer")}
                                                        disabled={busy}
                                                    >
                                                        {__(I18nStrings.MAIN_COLLECTION_SYNC_USE_LAZER)}
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        )}
                                    </Box>
                                ))}

                                {plan.deletions.length > 0 && (
                                    <>
                                        <Divider />
                                        <Typography variant="subtitle2" color="error.main">
                                            {`${__(I18nStrings.MAIN_COLLECTION_SYNC_DELETIONS)} (${plan.deletions.length})`}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {__(I18nStrings.MAIN_COLLECTION_SYNC_DELETIONS_DESC)}
                                        </Typography>
                                        <Stack spacing={0.5}>
                                            {plan.deletions.map((item) => (
                                                <Stack
                                                    key={item.hash}
                                                    direction="row"
                                                    spacing={1}
                                                    sx={{ alignItems: "center" }}
                                                >
                                                    <DeleteForeverIcon fontSize="small" color="error" />
                                                    <Typography
                                                        variant="caption"
                                                        sx={{ flex: 1 }}
                                                        noWrap
                                                        title={item.hash}
                                                    >
                                                        {item.mapId === null
                                                            ? item.hash
                                                            : `#${item.mapId} ${item.hash.slice(0, 8)}`}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {item.installedStable ? "Stable" : ""}
                                                        {item.installedStable && item.installedLazer ? " / " : ""}
                                                        {item.installedLazer ? "Lazer" : ""}
                                                    </Typography>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </>
                                )}
                            </Stack>
                        )}
                    </Box>
                    <Divider />
                    <Box sx={{ p: 2 }}>
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_CONFIRM_DESC)}
                            </Typography>
                            {state && state.notFoundHashes.length > 0 && (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={state.excludeNotFound}
                                            onChange={(event) => void onExcludeNotFoundChanged(event.target.checked)}
                                            disabled={busy}
                                        />
                                    }
                                    label={
                                        <Typography variant="body2">
                                            {__(I18nStrings.MAIN_COLLECTION_SYNC_EXCLUDE_NOT_FOUND, {
                                                count: String(state.notFoundHashes.length),
                                            })}
                                        </Typography>
                                    }
                                />
                            )}
                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                <Button
                                    variant="outlined"
                                    sx={FOOTER_BUTTON_SX}
                                    onClick={() => void buildPreview(resolutions)}
                                    disabled={busy}
                                >
                                    {__(I18nStrings.BTN_COLLECTION_SYNC_PREVIEW)}
                                </Button>
                                <Tooltip arrow placement="top" title={executeBlockReason}>
                                    <span>
                                        <Button
                                            variant="contained"
                                            color="error"
                                            sx={FOOTER_BUTTON_SX}
                                            startIcon={<PlayArrowIcon />}
                                            onClick={() => void onRun()}
                                            disabled={busy || !plan || unresolvedConflicts > 0 || clientRunning}
                                        >
                                            {`${__(I18nStrings.BTN_COLLECTION_SYNC_EXECUTE)}${
                                                totalChanges > 0 ? ` (${totalChanges})` : ""
                                            }`}
                                        </Button>
                                    </span>
                                </Tooltip>
                                <Tooltip arrow placement="top" title={checkBlockReason}>
                                    <span>
                                        <Button
                                            variant="outlined"
                                            sx={FOOTER_BUTTON_SX}
                                            startIcon={<SearchIcon />}
                                            onClick={() => void onCheckMissing()}
                                            disabled={busy || !state?.hasStable || !state?.hasLazer}
                                        >
                                            {__(I18nStrings.BTN_COLLECTION_SYNC_CHECK_MISSING)}
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
                        <Typography variant="body2">
                            {`${__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_LAZER)}: ${
                                result.lazerWritten
                                    ? __(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_WRITTEN)
                                    : __(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_SKIPPED)
                            }`}
                        </Typography>
                        {result.deletions.length > 0 && (
                            <Typography variant="body2">
                                {`${__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_DELETED)}: ${result.deletions
                                    .filter((item) => item.ok)
                                    .map((item) => `${item.client} ${item.hash.slice(0, 8)}`)
                                    .join(", ")}`}
                            </Typography>
                        )}
                        {result.deletions.some((item) => !item.ok) && (
                            <Typography variant="body2" color="warning.main">
                                {formatHashes(result.deletions.filter((item) => !item.ok).map((item) => item.hash))}
                            </Typography>
                        )}
                        {result.errors.length > 0 && <Alert severity="error">{result.errors.join(" | ")}</Alert>}
                        {result.blocked === "stable_running" && (
                            <Alert severity="error" icon={<WarningAmberIcon />}>
                                {__(I18nStrings.MAIN_COLLECTION_SYNC_BLOCKED_RUNNING)}
                            </Alert>
                        )}
                        {result.stableRescanRequired && (
                            <Alert severity="info">{__(I18nStrings.MAIN_COLLECTION_SYNC_RESULT_RESCAN)}</Alert>
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
