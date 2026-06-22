import {
    Cancel,
    CheckCircle,
    CloudDownload,
    ContentCopy,
    Delete,
    Error as ErrorIcon,
    FolderOpen,
    InstallDesktop,
    Login,
    Pause,
    Refresh,
    SystemUpdateAlt,
} from "@mui/icons-material";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    DialogContentText,
    Divider,
    IconButton,
    LinearProgress,
    Snackbar,
    Stack,
    Tab,
    Tabs,
    Tooltip,
    Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import { DownloadTask } from "../../defines/download_types";
import { useDownloadTasks } from "../../hooks/useDownloadTasks";
import { fmtBytes, fmtSpeed } from "../../utils/format";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { CheckboxListDialog } from "./checkboxListDialog";
import { ConfirmDialog } from "./common/ConfirmDialog";
import { ProgressDialog } from "./progressDialog";

function StatusChip({ status }: { status: DownloadTask["status"] }) {
    const map: Record<
        DownloadTask["status"],
        { label: string; color: "default" | "primary" | "success" | "error" | "warning" | "info" }
    > = {
        queued: { label: __(I18nStrings.MAIN_DL_STATUS_QUEUED), color: "default" },
        downloading: { label: __(I18nStrings.MAIN_DL_STATUS_DOWNLOADING), color: "primary" },
        paused: { label: __(I18nStrings.MAIN_DL_STATUS_PAUSED), color: "warning" },
        done: { label: __(I18nStrings.MAIN_DL_STATUS_DONE), color: "success" },
        error: { label: __(I18nStrings.MAIN_DL_STATUS_ERROR), color: "error" },
        cancelled: { label: __(I18nStrings.MAIN_DL_STATUS_CANCELLED), color: "warning" },
        held: { label: __(I18nStrings.MAIN_DL_STATUS_HELD), color: "info" },
        missing: { label: __(I18nStrings.MAIN_DL_STATUS_MISSING), color: "error" },
    };
    const cfg = map[status];
    return <Chip label={cfg.label} color={cfg.color} size="small" />;
}

function TaskRow({
    task,
    onCancel,
    onPause,
    onResume,
    onRetry,
    onReveal,
    onCopyLink,
    onInstall,
    onDelete,
}: {
    task: DownloadTask;
    onCancel: (id: string) => void;
    onPause?: (id: string) => void;
    onResume?: (id: string) => void;
    onRetry: (id: string) => void;
    onReveal: (path: string) => void;
    onCopyLink?: (url: string) => void;
    onInstall?: (id: string) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}) {
    const [rowLoading, setRowLoading] = useState<"install" | "delete" | null>(null);
    const isDone = task.status === "done";
    const isError = task.status === "error" || task.status === "cancelled";
    const isMissing = task.status === "missing";
    const speed = fmtSpeed(task.speedBps);
    const received = task.receivedBytes > 0 ? fmtBytes(task.receivedBytes) : null;
    const total = task.totalBytes > 0 ? fmtBytes(task.totalBytes) : null;
    const sizeLabel = total ? (received ? `${received} / ${total}` : total) : (received ?? "");

    return (
        <Box sx={{ py: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <StatusChip status={task.status} />
                        <Tooltip title={task.url} arrow placement="top">
                            <Typography
                                variant="body2"
                                sx={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: "40vw",
                                    cursor: "pointer",
                                }}
                            >
                                {task.filename}
                            </Typography>
                        </Tooltip>
                        {speed && (
                            <Typography variant="caption" color="text.secondary">
                                {speed}
                            </Typography>
                        )}
                        {sizeLabel && (
                            <Typography variant="caption" color="text.secondary">
                                {sizeLabel}
                            </Typography>
                        )}
                        {task.error && (
                            <Tooltip title={task.error} arrow>
                                <ErrorIcon color="error" fontSize="small" />
                            </Tooltip>
                        )}
                    </Stack>
                    {task.status === "downloading" && (
                        <>
                            <LinearProgress
                                variant="determinate"
                                value={task.progress}
                                sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                            />
                            {task.chunkCount && task.chunkCount > 1 && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ mt: 0.25, display: "block" }}
                                >
                                    {__(I18nStrings.MAIN_DL_CHUNKS_PROGRESS, {
                                        active: task.activeChunkCount ?? 0,
                                        total: task.chunkCount,
                                    })}
                                </Typography>
                            )}
                        </>
                    )}
                </Box>
                <Stack direction="row" spacing={1}>
                    <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_COPY_LINK)} arrow>
                        <IconButton size="small" onClick={() => onCopyLink?.(task.url)}>
                            <ContentCopy fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {isDone && (
                        <>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_INSTALL)} arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        color="success"
                                        disabled={!!rowLoading}
                                        onClick={async () => {
                                            setRowLoading("install");
                                            try {
                                                await onInstall?.(task.id);
                                            } finally {
                                                setRowLoading(null);
                                            }
                                        }}
                                    >
                                        {rowLoading === "install" ? (
                                            <CircularProgress size={16} color="inherit" />
                                        ) : (
                                            <InstallDesktop fontSize="small" />
                                        )}
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_OPEN_FOLDER)} arrow>
                                <IconButton
                                    size="small"
                                    disabled={!!rowLoading}
                                    onClick={() => onReveal(task.savePath)}
                                >
                                    <FolderOpen fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_DELETE_FILE)} arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        disabled={!!rowLoading}
                                        onClick={async () => {
                                            setRowLoading("delete");
                                            try {
                                                await onDelete?.(task.id);
                                            } finally {
                                                setRowLoading(null);
                                            }
                                        }}
                                    >
                                        {rowLoading === "delete" ? (
                                            <CircularProgress size={16} color="inherit" />
                                        ) : (
                                            <Delete fontSize="small" />
                                        )}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </>
                    )}
                    {task.status === "downloading" && (
                        <>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_PAUSE)} arrow>
                                <IconButton size="small" color="warning" onClick={() => onPause?.(task.id)}>
                                    <Pause fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_CANCEL)} arrow>
                                <IconButton size="small" color="error" onClick={() => onCancel(task.id)}>
                                    <Cancel fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </>
                    )}
                    {task.status === "paused" && (
                        <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_RESUME)} arrow>
                            <IconButton size="small" color="success" onClick={() => onResume?.(task.id)}>
                                <Refresh fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {(task.status === "queued" || task.status === "held") && (
                        <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_CANCEL)} arrow>
                            <IconButton size="small" color="error" onClick={() => onCancel(task.id)}>
                                <Cancel fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {isError && (
                        <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_RETRY)} arrow>
                            <IconButton size="small" color="primary" onClick={() => onRetry(task.id)}>
                                <Refresh fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                    {isMissing && (
                        <>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_REDOWNLOAD)} arrow>
                                <IconButton size="small" color="primary" onClick={() => onRetry(task.id)}>
                                    <Refresh fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_REMOVE_RECORD)} arrow>
                                <span>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        disabled={!!rowLoading}
                                        onClick={async () => {
                                            setRowLoading("delete");
                                            try {
                                                await onDelete?.(task.id);
                                            } finally {
                                                setRowLoading(null);
                                            }
                                        }}
                                    >
                                        {rowLoading === "delete" ? (
                                            <CircularProgress size={16} color="inherit" />
                                        ) : (
                                            <Delete fontSize="small" />
                                        )}
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </>
                    )}
                    {isDone && (
                        <Box
                            sx={{
                                width: 28,
                                height: 28,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <CheckCircle color="success" fontSize="small" />
                        </Box>
                    )}
                </Stack>
            </Stack>
        </Box>
    );
}

export const DownloadHistoryView: React.FC = () => {
    const { tasks: syncedTasks, authRequired, clearAuthRequired } = useDownloadTasks();
    const [tasks, setTasks] = useState<DownloadTask[]>([]);
    const [rateStatus, setRateStatus] = useState<Array<{ hostname: string; count: number; limit: number }>>([]);
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        message: string;
        severity: "success" | "warning" | "error";
    }>({
        open: false,
        message: "",
        severity: "success",
    });
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; taskId?: string; filename?: string }>({
        open: false,
    });

    type InstallResult = { taskId: string; filename: string; success: boolean; reason?: string };
    const [installAllDialog, setInstallAllDialog] = useState<{
        phase: "type_select" | "progress" | "cleanup" | null;
        availableTypes?: string[];
        selectedType?: string;
        targetTasks?: DownloadTask[];
        progress?: { current: number; total: number };
        results?: InstallResult[];
    }>({ phase: null });
    const [cleanupChecked, setCleanupChecked] = useState<Record<string, boolean>>({});
    const [batchDeleteDialog, setBatchDeleteDialog] = useState<{
        open: boolean;
        items: Array<{ taskId: string; filename: string }>;
    }>({ open: false, items: [] });
    const [batchDeleteChecked, setBatchDeleteChecked] = useState<Record<string, boolean>>({});
    const [batchDeleteProgress, setBatchDeleteProgress] = useState<{ open: boolean; current: number; total: number }>({
        open: false,
        current: 0,
        total: 0,
    });
    const [clearHistoryDialog, setClearHistoryDialog] = useState<{
        open: boolean;
        items: Array<{ id: string; label: string; count: number }>;
    }>({ open: false, items: [] });
    const [clearHistoryChecked, setClearHistoryChecked] = useState<Record<string, boolean>>({});
    const [deleteDialogLoading, setDeleteDialogLoading] = useState(false);
    const [cleanupLoading, setCleanupLoading] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    useEffect(() => setTasks(syncedTasks), [syncedTasks]);
    // Poll rate status every 5 seconds
    useEffect(() => {
        const poll = () =>
            window.olsCore
                .dlGetRateStatus()
                .then(setRateStatus)
                .catch(() => {});
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, []);

    const handleCancel = useCallback((id: string) => {
        window.olsCore.dlCancel(id);
    }, []);

    const handleRetry = useCallback((id: string) => {
        window.olsCore.dlRetry(id);
    }, []);

    const handlePause = useCallback((id: string) => {
        window.olsCore.dlPause(id);
    }, []);

    const handleResume = useCallback((id: string) => {
        window.olsCore.dlResume(id);
    }, []);

    const handleReveal = useCallback((path: string) => {
        window.olsCore.dlRevealFile(path);
    }, []);

    const handleClearHistory = useCallback(() => {
        const statusLabels: Record<string, string> = {
            done: __(I18nStrings.MAIN_DL_STATUS_DONE),
            cancelled: __(I18nStrings.MAIN_DL_STATUS_CANCELLED),
            error: __(I18nStrings.MAIN_DL_STATUS_ERROR),
            missing: __(I18nStrings.MAIN_DL_STATUS_MISSING),
        };
        const counts: Record<string, number> = {};
        for (const t of tasks) {
            if (statusLabels[t.status]) {
                counts[t.status] = (counts[t.status] ?? 0) + 1;
            }
        }
        const items = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([status, count]) => ({ id: status, label: statusLabels[status], count }));
        if (!items.length) return;
        const checked: Record<string, boolean> = {};
        items.forEach((item) => {
            checked[item.id] = true;
        });
        setClearHistoryChecked(checked);
        setClearHistoryDialog({ open: true, items });
    }, [tasks]);

    const handleClearHistoryConfirm = useCallback(() => {
        const selected = clearHistoryDialog.items.filter((item) => clearHistoryChecked[item.id]).map((item) => item.id);
        setClearHistoryDialog({ open: false, items: [] });
        if (!selected.length) return;
        window.olsCore.dlClearHistory(selected).then(() => {
            setTasks((prev) => prev.filter((t) => !selected.includes(t.status)));
            setSnackbar({ open: true, message: __(I18nStrings.MAIN_DL_HISTORY_CLEARED), severity: "success" });
        });
    }, [clearHistoryDialog.items, clearHistoryChecked]);

    const handleClearHistoryCancel = useCallback(() => {
        setClearHistoryDialog({ open: false, items: [] });
        setClearHistoryChecked({});
    }, []);

    const handleOpenSaveDir = useCallback(() => {
        window.olsCore.dlOpenSaveDir();
    }, []);

    const handleLogin = useCallback(async () => {
        setLoginLoading(true);
        try {
            const result = await window.olsCore.dlLoginOsu();
            if (result.success) {
                clearAuthRequired();
                g.setNotify({ message: __(I18nStrings.MAIN_DL_LOGIN_SUCCESS), severity: "success" });
            } else {
                g.setNotify({ message: __(I18nStrings.MAIN_DL_LOGIN_INCOMPLETE), severity: "warning" });
            }
        } finally {
            setLoginLoading(false);
        }
    }, [clearAuthRequired]);

    const handleCopyLink = useCallback((url: string) => {
        navigator.clipboard.writeText(url);
        setSnackbar({ open: true, message: __(I18nStrings.MAIN_DL_LINK_COPIED), severity: "success" });
    }, []);

    const handleInstall = useCallback(
        async (taskId: string): Promise<void> => {
            const result = await window.olsCore.dlInstallFile(taskId);
            if (!result.success) {
                if (result.reason === "no_stable_path") {
                    setSnackbar({ open: true, message: __(I18nStrings.MAIN_DL_NO_STABLE_PATH), severity: "warning" });
                } else {
                    setSnackbar({
                        open: true,
                        message: __(I18nStrings.MAIN_DL_INSTALL_FAILED, { reason: result.reason }),
                        severity: "error",
                    });
                }
                return;
            }
            setSnackbar({
                open: true,
                message: __(I18nStrings.MAIN_DL_INSTALL_SUCCESS, { count: result.installedCount }),
                severity: "success",
            });
            // Show delete confirmation dialog
            const task = tasks.find((t) => t.id === taskId);
            if (task) {
                setDeleteDialog({ open: true, taskId, filename: task.filename });
            }
        },
        [tasks],
    );

    const handleDeleteConfirm = useCallback(async () => {
        if (!deleteDialog.taskId) return;
        setDeleteDialogLoading(true);
        try {
            const result = await window.olsCore.dlDeleteFile(deleteDialog.taskId);
            if (result.success) {
                setSnackbar({ open: true, message: __(I18nStrings.MAIN_DL_FILE_DELETED), severity: "success" });
                setTasks((prev) => prev.filter((t) => t.id !== deleteDialog.taskId));
            } else {
                setSnackbar({ open: true, message: __(I18nStrings.MAIN_DL_DELETE_FAILED), severity: "error" });
            }
            setDeleteDialog({ open: false });
        } finally {
            setDeleteDialogLoading(false);
        }
    }, [deleteDialog.taskId]);

    const handleDeleteCancel = useCallback(() => {
        setDeleteDialog({ open: false });
    }, []);

    const handleDelete = useCallback(
        async (taskId: string): Promise<void> => {
            const task = tasks.find((t) => t.id === taskId);
            if (!task) return;
            if (task.status === "missing") {
                const result = await window.olsCore.dlDeleteFile(taskId);
                if (result.success) {
                    setTasks((prev) => prev.filter((t) => t.id !== taskId));
                }
            } else {
                setDeleteDialog({ open: true, taskId, filename: task.filename });
            }
        },
        [tasks],
    );

    const handleDeleteAllHistory = useCallback(() => {
        const done = tasks.filter((t) => t.status === "done");
        if (!done.length) return;
        const checked: Record<string, boolean> = {};
        done.forEach((t) => {
            checked[t.id] = true;
        });
        setBatchDeleteChecked(checked);
        setBatchDeleteDialog({
            open: true,
            items: done.map((t) => ({ taskId: t.id, filename: t.filename })),
        });
    }, [tasks]);

    const handleBatchDeleteConfirm = useCallback(async () => {
        const toDelete = batchDeleteDialog.items.filter((item) => batchDeleteChecked[item.taskId]);
        setBatchDeleteDialog({ open: false, items: [] });
        setBatchDeleteProgress({ open: true, current: 0, total: toDelete.length });
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < toDelete.length; i++) {
            const item = toDelete[i];
            const res = await window.olsCore.dlDeleteFile(item.taskId);
            if (res.success) {
                successCount++;
                setTasks((prev) => prev.filter((t) => t.id !== item.taskId));
            } else {
                failCount++;
            }
            setBatchDeleteProgress((prev) => ({ ...prev, current: i + 1 }));
        }
        setBatchDeleteProgress({ open: false, current: 0, total: 0 });
        setBatchDeleteChecked({});
        setSnackbar({
            open: true,
            message: __(I18nStrings.MAIN_DL_BATCH_DELETED, {
                success: successCount,
                failPart:
                    failCount > 0
                        ? `，${failCount} ${__(I18nStrings.MAIN_DL_INDICATOR_FAILED, { count: failCount })}`
                        : "",
            }),
            severity: failCount > 0 ? "warning" : "success",
        });
    }, [batchDeleteDialog.items, batchDeleteChecked]);

    const handleBatchDeleteCancel = useCallback(() => {
        setBatchDeleteDialog({ open: false, items: [] });
        setBatchDeleteChecked({});
    }, []);

    const handleInstallAll = useCallback(() => {
        const done = tasks.filter((t) => t.status === "done");
        if (!done.length) return;
        const types = [
            ...new Set(
                done
                    .map((t) => {
                        const ext = t.filename.split(".").pop()?.toLowerCase();
                        return ext ?? "";
                    })
                    .filter(Boolean),
            ),
        ];
        if (types.length === 1) {
            setInstallAllDialog({
                phase: "progress",
                selectedType: types[0],
                targetTasks: done.filter((t) => {
                    const ext = t.filename.split(".").pop()?.toLowerCase();
                    return ext === types[0];
                }),
                progress: { current: 0, total: done.length },
            });
        } else {
            setInstallAllDialog({ phase: "type_select", availableTypes: types, targetTasks: done });
        }
    }, [tasks]);

    const handleInstallAllTypeSelect = useCallback(
        (type: string) => {
            const filtered = (installAllDialog.targetTasks ?? []).filter((t) => {
                const ext = t.filename.split(".").pop()?.toLowerCase();
                return ext === type;
            });
            setInstallAllDialog((s) => ({
                ...s,
                phase: "progress",
                selectedType: type,
                targetTasks: filtered,
                progress: { current: 0, total: filtered.length },
            }));
        },
        [installAllDialog.targetTasks],
    );

    const _installPhase = installAllDialog.phase;
    const _installTargets = installAllDialog.targetTasks;
    useEffect(() => {
        if (_installPhase !== "progress" || !_installTargets) return;
        const targets = _installTargets;
        const results: InstallResult[] = [];
        let cancelled = false;
        const run = async () => {
            for (let i = 0; i < targets.length; i++) {
                if (cancelled) break;
                const t = targets[i];
                const r = await window.olsCore.dlInstallFile(t.id);
                results.push({ taskId: t.id, filename: t.filename, success: r.success, reason: r.reason });
                setInstallAllDialog((s) => ({ ...s, progress: { current: i + 1, total: targets.length } }));
            }
            const checked: Record<string, boolean> = {};
            results
                .filter((r) => r.success)
                .forEach((r) => {
                    checked[r.taskId] = true;
                });
            setCleanupChecked(checked);
            setInstallAllDialog((s) => ({ ...s, phase: "cleanup", results }));
        };
        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [_installPhase, _installTargets]);

    const handleInstallAllCleanup = useCallback(async () => {
        const toDelete = (installAllDialog.results ?? []).filter((r) => r.success && cleanupChecked[r.taskId]);
        setCleanupLoading(true);
        try {
            for (const r of toDelete) {
                const res = await window.olsCore.dlDeleteFile(r.taskId);
                if (res.success) {
                    setTasks((prev) => prev.filter((t) => t.id !== r.taskId));
                }
            }
        } finally {
            setCleanupLoading(false);
        }
        setInstallAllDialog({ phase: null });
        setCleanupChecked({});
    }, [installAllDialog.results, cleanupChecked]);

    const [historyTab, setHistoryTab] = useState<"all" | "done" | "cancelled" | "error">("all");

    // Active tasks: downloading > paused > queued > held (priority order)
    const statusOrder: Record<string, number> = { downloading: 0, paused: 1, queued: 2, held: 3 };
    const active = tasks
        .filter(
            (t) => t.status === "downloading" || t.status === "queued" || t.status === "held" || t.status === "paused",
        )
        .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.addedAt - b.addedAt);
    const history = tasks
        .filter(
            (t) => t.status === "done" || t.status === "error" || t.status === "cancelled" || t.status === "missing",
        )
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.addedAt - a.addedAt);
    const historyFiltered = historyTab === "all" ? history : history.filter((t) => t.status === historyTab);
    const historyDoneCount = history.filter((t) => t.status === "done").length;
    const historyCancelledCount = history.filter((t) => t.status === "cancelled").length;
    const historyErrorCount = history.filter((t) => t.status === "error").length;
    const heldCount = tasks.filter((t) => t.status === "held").length;

    return (
        <Stack spacing={2} sx={{ height: "100%", overflow: "hidden", minHeight: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <CloudDownload color="primary" />
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    {__(I18nStrings.MAIN_DL_TITLE)}
                </Typography>
                <Tooltip title={__(I18nStrings.MAIN_DL_TOOLTIP_OPEN_DL_FOLDER)} arrow>
                    <IconButton size="small" onClick={handleOpenSaveDir}>
                        <FolderOpen />
                    </IconButton>
                </Tooltip>
                <Button
                    size="small"
                    startIcon={loginLoading ? <CircularProgress size={16} color="inherit" /> : <Login />}
                    variant={authRequired.show ? "contained" : "outlined"}
                    color={authRequired.show ? "error" : "primary"}
                    disabled={loginLoading}
                    onClick={handleLogin}
                >
                    {authRequired.show
                        ? __(I18nStrings.MAIN_DL_LOGIN_REQUIRED, { host: authRequired.hostname || "osu.ppy.sh" })
                        : __(I18nStrings.MAIN_DL_LOGIN_BUTTON)}
                </Button>
            </Stack>

            {rateStatus.length > 0 && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {rateStatus.map((r) => (
                        <Chip
                            key={r.hostname}
                            size="small"
                            variant="outlined"
                            color={r.count >= r.limit ? "warning" : "default"}
                            label={`${r.hostname}: ${r.count}/${r.limit} req/min`}
                        />
                    ))}
                </Stack>
            )}

            {authRequired.show && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                    {__(I18nStrings.MAIN_DL_AUTH_WARNING, { host: authRequired.hostname || "osu.ppy.sh" })}
                </Alert>
            )}

            {active.length > 0 && (
                <React.Fragment>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Divider textAlign="left" sx={{ flexGrow: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                {__(I18nStrings.MAIN_DL_ACTIVE_SECTION, {
                                    count: active.length,
                                    heldPart: heldCount > 0 ? ` / ${__(I18nStrings.MAIN_DL_STATUS_HELD)}` : "",
                                })}
                            </Typography>
                        </Divider>
                        <Button
                            size="small"
                            variant="text"
                            color="warning"
                            startIcon={<Pause fontSize="small" />}
                            onClick={() => {
                                active
                                    .filter((t) => t.status === "downloading" || t.status === "queued")
                                    .forEach((t) => {
                                        handlePause(t.id);
                                    });
                            }}
                            sx={{ flexShrink: 0 }}
                        >
                            {__(I18nStrings.BTN_DL_PAUSE_ALL)}
                        </Button>
                        <Button
                            size="small"
                            variant="text"
                            color="error"
                            startIcon={<Cancel fontSize="small" />}
                            onClick={() => {
                                active.forEach((t) => {
                                    handleCancel(t.id);
                                });
                            }}
                            sx={{ flexShrink: 0 }}
                        >
                            {__(I18nStrings.BTN_DL_CANCEL_ALL)}
                        </Button>
                    </Stack>
                    <Stack
                        spacing={0}
                        divider={<Divider />}
                        sx={{ flexShrink: 0, maxHeight: "45%", overflowY: "auto", minHeight: 0 }}
                    >
                        {active.map((t) => (
                            <TaskRow
                                key={t.id}
                                task={t}
                                onCancel={handleCancel}
                                onPause={handlePause}
                                onResume={handleResume}
                                onRetry={handleRetry}
                                onReveal={handleReveal}
                                onCopyLink={handleCopyLink}
                                onInstall={handleInstall}
                                onDelete={handleDelete}
                            />
                        ))}
                    </Stack>
                </React.Fragment>
            )}

            {active.length === 0 && (
                <Box
                    sx={{
                        border: "1px dashed",
                        borderColor: "divider",
                        borderRadius: 2,
                        p: 3,
                        textAlign: "center",
                    }}
                >
                    <Typography color="text.secondary" variant="body2">
                        {__(I18nStrings.MAIN_DL_NO_ACTIVE)}
                    </Typography>
                </Box>
            )}

            <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0, minHeight: 0 }}>
                <Divider sx={{ flexGrow: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        {__(I18nStrings.MAIN_DL_HISTORY_SECTION, { count: history.length })}
                    </Typography>
                </Divider>
                {history.length > 0 && (
                    <Button
                        size="small"
                        variant="text"
                        color="error"
                        startIcon={<Delete fontSize="small" />}
                        onClick={handleDeleteAllHistory}
                        sx={{ flexShrink: 0 }}
                    >
                        {__(I18nStrings.BTN_DL_DELETE_ALL)}
                    </Button>
                )}
                {history.some((t) => t.status === "done") && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        startIcon={<SystemUpdateAlt fontSize="small" />}
                        onClick={handleInstallAll}
                        sx={{ flexShrink: 0 }}
                    >
                        {__(I18nStrings.BTN_DL_INSTALL_ALL)}
                    </Button>
                )}
                {history.length > 0 && (
                    <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={handleClearHistory}
                        sx={{ flexShrink: 0 }}
                    >
                        {__(I18nStrings.BTN_DL_CLEAR_HISTORY)}
                    </Button>
                )}
            </Stack>

            {history.length > 0 && (
                <Tabs
                    value={historyTab}
                    onChange={(_, v) => setHistoryTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ flexShrink: 0, minHeight: 32, "& .MuiTab-root": { minHeight: 32, py: 0.5 } }}
                >
                    <Tab label={__(I18nStrings.MAIN_DL_TAB_ALL, { count: history.length })} value="all" />
                    <Tab label={__(I18nStrings.MAIN_DL_TAB_DONE, { count: historyDoneCount })} value="done" />
                    <Tab
                        label={__(I18nStrings.MAIN_DL_TAB_CANCELLED, { count: historyCancelledCount })}
                        value="cancelled"
                    />
                    <Tab label={__(I18nStrings.MAIN_DL_TAB_ERROR, { count: historyErrorCount })} value="error" />
                </Tabs>
            )}

            {historyFiltered.length > 0 && (
                <Box sx={{ overflowY: "auto", flexGrow: 1, minHeight: 0 }}>
                    <Stack spacing={0} divider={<Divider />}>
                        {historyFiltered.map((t) => (
                            <TaskRow
                                key={t.id}
                                task={t}
                                onCancel={handleCancel}
                                onPause={handlePause}
                                onResume={handleResume}
                                onRetry={handleRetry}
                                onReveal={handleReveal}
                                onCopyLink={handleCopyLink}
                                onInstall={handleInstall}
                                onDelete={handleDelete}
                            />
                        ))}
                    </Stack>
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
                message={snackbar.message}
            />

            <ConfirmDialog
                open={deleteDialog.open}
                title={__(I18nStrings.MAIN_DL_DELETE_CONFIRM_TITLE)}
                onConfirm={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
                confirmLabel={__(I18nStrings.MAIN_DL_DELETE_CONFIRM_LABEL)}
                confirmColor="error"
                confirmLoading={deleteDialogLoading}
            >
                <DialogContentText>
                    {__(I18nStrings.MAIN_DL_DELETE_CONFIRM_BODY, { filename: deleteDialog.filename })}
                </DialogContentText>
            </ConfirmDialog>

            {/* Install All: type selection */}
            <ConfirmDialog
                open={installAllDialog.phase === "type_select"}
                title={__(I18nStrings.MAIN_DL_INSTALL_TYPE_TITLE)}
                onConfirm={() => setInstallAllDialog({ phase: null })}
                confirmLabel={__(I18nStrings.BTN_CANCEL)}
                confirmVariant="text"
            >
                <DialogContentText>{__(I18nStrings.MAIN_DL_INSTALL_TYPE_DESC)}</DialogContentText>
                <Stack spacing={2} sx={{ mt: 2 }}>
                    {installAllDialog.availableTypes?.map((type) => {
                        const count = (installAllDialog.targetTasks ?? []).filter((t) =>
                            t.filename.toLowerCase().endsWith(`.${type}`),
                        ).length;
                        return (
                            <Button key={type} variant="outlined" onClick={() => handleInstallAllTypeSelect(type)}>
                                {__(I18nStrings.MAIN_DL_INSTALL_TYPE_ITEM, { type, count })}
                            </Button>
                        );
                    })}
                </Stack>
            </ConfirmDialog>

            {/* Install All: progress */}
            <ProgressDialog
                open={installAllDialog.phase === "progress"}
                title={__(I18nStrings.MAIN_DL_INSTALLING)}
                current={installAllDialog.progress?.current ?? 0}
                total={installAllDialog.progress?.total ?? 0}
            />

            {/* Install All: cleanup confirmation */}
            <CheckboxListDialog
                open={installAllDialog.phase === "cleanup"}
                title={__(I18nStrings.MAIN_DL_INSTALL_DONE_TITLE, {
                    count: (installAllDialog.results ?? []).filter((r) => r.success).length,
                })}
                subtitle={__(I18nStrings.MAIN_DL_INSTALL_CLEANUP_SUBTITLE)}
                items={(installAllDialog.results ?? []).map((r) => ({
                    id: r.taskId,
                    primary: r.filename,
                    secondary: r.success
                        ? undefined
                        : __(I18nStrings.MAIN_DL_INSTALL_FAILED_REASON, { reason: r.reason ?? "" }),
                    disabled: !r.success,
                }))}
                checked={cleanupChecked}
                onToggle={(id, value) => setCleanupChecked((prev) => ({ ...prev, [id]: value }))}
                onCancel={() => {
                    setInstallAllDialog({ phase: null });
                    setCleanupChecked({});
                }}
                onConfirm={handleInstallAllCleanup}
                cancelLabel={__(I18nStrings.BTN_DL_KEEP_ALL)}
                confirmLabel={__(I18nStrings.BTN_DL_DELETE_SELECTED)}
                confirmColor="error"
                confirmDisabled={Object.values(cleanupChecked).every((v) => !v)}
                confirmLoading={cleanupLoading}
            />

            {/* Batch delete history confirmation */}
            <CheckboxListDialog
                open={batchDeleteDialog.open}
                title={__(I18nStrings.MAIN_DL_BATCH_DELETE_TITLE)}
                subtitle={__(I18nStrings.MAIN_DL_BATCH_DELETE_SUBTITLE)}
                items={batchDeleteDialog.items.map((item) => ({
                    id: item.taskId,
                    primary: item.filename,
                }))}
                checked={batchDeleteChecked}
                onToggle={(id, value) => setBatchDeleteChecked((prev) => ({ ...prev, [id]: value }))}
                onCancel={handleBatchDeleteCancel}
                onConfirm={handleBatchDeleteConfirm}
                confirmLabel={__(I18nStrings.BTN_DL_DELETE_SELECTED)}
                confirmColor="error"
                confirmDisabled={Object.values(batchDeleteChecked).every((v) => !v)}
            />

            {/* Batch delete: progress */}
            <ProgressDialog
                open={batchDeleteProgress.open}
                title={__(I18nStrings.MAIN_DL_DELETING)}
                current={batchDeleteProgress.current}
                total={batchDeleteProgress.total}
            />

            {/* Clear history: type selection */}
            <CheckboxListDialog
                open={clearHistoryDialog.open}
                title={__(I18nStrings.MAIN_DL_CLEAR_HISTORY_TITLE)}
                subtitle={__(I18nStrings.MAIN_DL_CLEAR_HISTORY_SUBTITLE)}
                items={clearHistoryDialog.items.map((item) => ({
                    id: item.id,
                    primary: __(I18nStrings.MAIN_DL_CLEAR_HISTORY_ITEM, { label: item.label, count: item.count }),
                }))}
                checked={clearHistoryChecked}
                onToggle={(id, value) => setClearHistoryChecked((prev) => ({ ...prev, [id]: value }))}
                onCancel={handleClearHistoryCancel}
                onConfirm={handleClearHistoryConfirm}
                confirmLabel={__(I18nStrings.BTN_DL_CLEAR_SELECTED)}
                confirmColor="error"
                confirmDisabled={Object.values(clearHistoryChecked).every((v) => !v)}
            />
        </Stack>
    );
};
