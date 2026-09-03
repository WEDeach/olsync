import { Button } from "@mui/material";
import React from "react";
import __ from "../../../utils/i18n";
import { I18nStrings } from "../../../utils/typed/i18n";
import { BaseDialog } from "./BaseDialog";
import { PausableCircularProgress } from "./PausableCircularProgress";

interface ConfirmDialogProps {
    open: boolean;
    title?: React.ReactNode;
    children?: React.ReactNode;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: "primary" | "secondary" | "error" | "info" | "success" | "warning";
    confirmVariant?: "text" | "outlined" | "contained";
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
    maxWidth?: "xs" | "sm" | "md" | "lg" | "xl" | false;
    fullWidth?: boolean;
    disableEscapeKeyDown?: boolean;
    disableBackdropClick?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    children,
    onConfirm,
    onCancel,
    confirmLabel = __(I18nStrings.BTN_CONFIRM),
    cancelLabel = __(I18nStrings.BTN_CANCEL),
    confirmColor = "primary",
    confirmVariant = "contained",
    confirmDisabled = false,
    confirmLoading = false,
    ...dialogProps
}) => (
    <BaseDialog
        open={open}
        onClose={onCancel}
        title={title}
        actions={
            <>
                {onCancel && (
                    <Button onClick={onCancel} color="inherit">
                        {cancelLabel}
                    </Button>
                )}
                <Button
                    onClick={onConfirm}
                    color={confirmColor}
                    variant={confirmVariant}
                    disabled={confirmDisabled || confirmLoading}
                    endIcon={confirmLoading ? <PausableCircularProgress size={16} color="inherit" /> : undefined}
                >
                    {confirmLabel}
                </Button>
            </>
        }
        {...dialogProps}
    >
        {children}
    </BaseDialog>
);
