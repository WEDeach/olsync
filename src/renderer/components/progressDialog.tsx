import { LinearProgress, Stack, Typography } from "@mui/material";
import React from "react";
import { BaseDialog } from "./common/BaseDialog";
import { PausableCircularProgress } from "./common/PausableCircularProgress";

export interface ProgressDialogProps {
    open: boolean;
    title: React.ReactNode;
    current: number;
    total: number;
}

export const ProgressDialog: React.FC<ProgressDialogProps> = ({ open, title, current, total }) => {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
        <BaseDialog open={open} title={title} disableEscapeKeyDown>
            <Stack
                spacing={2}
                sx={{
                    alignItems: "center",
                    minWidth: 280,
                    py: 1,
                }}
            >
                <PausableCircularProgress />
                <Typography variant="body2">
                    {current} / {total}
                </Typography>
                <LinearProgress variant="determinate" value={pct} sx={{ width: "100%", borderRadius: 2 }} />
            </Stack>
        </BaseDialog>
    );
};
