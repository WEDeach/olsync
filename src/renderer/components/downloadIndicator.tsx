import { CheckCircle, CloudDownload, Error as ErrorIcon } from "@mui/icons-material";
import { Badge, Box, Button, Chip, Tooltip } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDownloadTasks } from "../../hooks/useDownloadTasks";
import { fmtSpeed } from "../../utils/format";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";

interface Props {
    visible: boolean;
    onOpenHistory: () => void;
}

export const DownloadIndicator: React.FC<Props> = ({ visible, onOpenHistory }) => {
    const { tasks, newTaskIds, authRequired, clearNewTaskIds } = useDownloadTasks({ loadAll: false });
    const [open, setOpen] = useState(false);
    const onOpenHistoryRef = useRef(onOpenHistory);
    onOpenHistoryRef.current = onOpenHistory;

    useEffect(() => {
        if (newTaskIds.size > 0 && visible) setOpen(true);
    }, [newTaskIds, visible]);

    useEffect(() => {
        if (!visible) {
            setOpen(false);
            clearNewTaskIds();
        }
    }, [visible]);

    useEffect(() => {
        if (!authRequired.show || !authRequired.hostname) return;
        g.setNotify({
            message: __(I18nStrings.MAIN_DL_AUTH_NOTIFY, { host: authRequired.hostname }),
            severity: "warning",
            action: React.createElement(
                Button,
                { color: "inherit", size: "small", onClick: () => onOpenHistoryRef.current() },
                __(I18nStrings.MAIN_DL_LOGIN_BUTTON),
            ),
        });
    }, [authRequired]);

    const handleClick = useCallback(() => {
        setOpen(false);
        clearNewTaskIds();
        onOpenHistory();
    }, [onOpenHistory, clearNewTaskIds]);

    if (!open) return null;

    const newTasks = tasks.filter((t) => newTaskIds.has(t.id));
    const downloading = newTasks.filter((t) => t.status === "downloading");
    const queued = newTasks.filter((t) => t.status === "queued");
    const held = newTasks.filter((t) => t.status === "held");
    const errors = newTasks.filter((t) => t.status === "error");
    const done = newTasks.filter((t) => t.status === "done");

    const totalActive = downloading.length + queued.length + held.length;
    const hasErrors = errors.length > 0;
    const isDoneOnly = totalActive === 0 && done.length > 0 && !hasErrors;

    const totalSpeedBps = downloading.reduce((sum, t) => sum + t.speedBps, 0);
    const overallProgress =
        downloading.length > 0
            ? Math.round(downloading.reduce((sum, t) => sum + t.progress, 0) / downloading.length)
            : 0;

    const chipColor = hasErrors ? "error" : "default";
    const badgeColor = hasErrors ? "error" : "primary";
    const icon = hasErrors ? (
        <ErrorIcon fontSize="small" />
    ) : isDoneOnly ? (
        <CheckCircle fontSize="small" />
    ) : (
        <CloudDownload fontSize="small" />
    );

    const label = hasErrors
        ? __(I18nStrings.MAIN_DL_INDICATOR_FAILED, { count: errors.length })
        : isDoneOnly
          ? __(I18nStrings.MAIN_DL_INDICATOR_DONE, { count: done.length })
          : [
                downloading.length > 0 && `↓${downloading.length}`,
                queued.length > 0 && __(I18nStrings.MAIN_DL_INDICATOR_QUEUED, { count: queued.length }),
                held.length > 0 && __(I18nStrings.MAIN_DL_INDICATOR_HELD, { count: held.length }),
                totalSpeedBps > 0 && fmtSpeed(totalSpeedBps),
            ]
                .filter(Boolean)
                .join("  ") || `${overallProgress}%`;

    const tooltipTitle = hasErrors
        ? __(I18nStrings.MAIN_DL_INDICATOR_FAILED_TOOLTIP, { count: errors.length })
        : isDoneOnly
          ? __(I18nStrings.MAIN_DL_INDICATOR_DONE_TOOLTIP, { count: done.length })
          : __(I18nStrings.MAIN_DL_INDICATOR_ACTIVE_TOOLTIP, {
                downloading: downloading.length,
                queued: queued.length,
                held: held.length,
            });

    return (
        <Box
            sx={{
                position: "fixed",
                bottom: 24,
                right: 24,
                zIndex: (theme) => theme.zIndex.drawer + 1,
            }}
        >
            <Tooltip title={tooltipTitle} arrow placement="left">
                <Badge
                    badgeContent={hasErrors ? errors.length : totalActive}
                    color={badgeColor}
                    overlap="rectangular"
                    anchorOrigin={{ vertical: "top", horizontal: "right" }}
                >
                    <Chip
                        icon={icon}
                        label={label}
                        onClick={handleClick}
                        color={chipColor}
                        variant="filled"
                        sx={{
                            cursor: "pointer",
                            bgcolor: hasErrors ? "error.main" : "background.paper",
                            color: hasErrors ? "error.contrastText" : undefined,
                            border: "1px solid",
                            borderColor: hasErrors ? "error.dark" : "divider",
                            fontWeight: 500,
                            fontSize: "0.8125rem",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                            "&:hover": { bgcolor: hasErrors ? "error.dark" : "action.hover" },
                        }}
                    />
                </Badge>
            </Tooltip>
        </Box>
    );
};
