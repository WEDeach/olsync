import { Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import React from "react";

interface BaseDialogProps {
    open: boolean;
    onClose?: (event: object, reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick") => void;
    title?: React.ReactNode;
    children?: React.ReactNode;
    actions?: React.ReactNode;
    maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
    fullWidth?: boolean;
    disableEscapeKeyDown?: boolean;
    disableBackdropClick?: boolean;
}

export const BaseDialog: React.FC<BaseDialogProps> = ({
    open,
    onClose,
    title,
    children,
    actions,
    maxWidth = "sm",
    fullWidth = true,
    disableEscapeKeyDown = false,
    disableBackdropClick = false,
}) => {
    const handleClose = (e: object, reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick") => {
        if (disableBackdropClick && reason === "backdropClick") return;
        if (disableEscapeKeyDown && reason === "escapeKeyDown") return;
        onClose?.(e, reason);
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth={maxWidth} fullWidth={fullWidth}>
            {title && <DialogTitle>{title}</DialogTitle>}
            {children && <DialogContent>{children}</DialogContent>}
            {actions && <DialogActions>{actions}</DialogActions>}
        </Dialog>
    );
};
