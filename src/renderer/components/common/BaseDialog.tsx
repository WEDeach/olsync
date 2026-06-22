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
}) => (
    <Dialog
        open={open}
        onClose={(e, reason) => {
            if (disableBackdropClick && reason === "backdropClick") return;
            onClose?.(e, reason);
        }}
        maxWidth={maxWidth}
        fullWidth={fullWidth}
        disableEscapeKeyDown={disableEscapeKeyDown}
    >
        {title && <DialogTitle>{title}</DialogTitle>}
        {children && <DialogContent>{children}</DialogContent>}
        {actions && <DialogActions>{actions}</DialogActions>}
    </Dialog>
);
