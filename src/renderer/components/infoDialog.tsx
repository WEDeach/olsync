import { Button } from "@mui/material";
import React from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { BaseDialog } from "./common/BaseDialog";

interface IInfoDialogProps {
    open: boolean;
    title: string;
    children: React.ReactNode;
    confirmLabel?: string;
    onConfirm: () => void;
}

/**
 * A blocking info dialog that can only be dismissed via the confirm button.
 * Backdrop clicks and Escape key are intentionally disabled.
 *
 * @param open - Whether the dialog is visible.
 * @param title - Dialog title text.
 * @param children - Dialog body content.
 * @param confirmLabel - Label for the confirm button (defaults to i18n OK key).
 * @param onConfirm - Called when the confirm button is clicked.
 *
 * @example
 * <InfoDialog open={open} title="Notice" onConfirm={() => setOpen(false)}>
 *   <Typography>Some important message.</Typography>
 * </InfoDialog>
 */
export const InfoDialog: React.FC<IInfoDialogProps> = ({
    open,
    title,
    children,
    confirmLabel = __(I18nStrings.BTN_OK),
    onConfirm,
}) => (
    <BaseDialog
        open={open}
        disableEscapeKeyDown
        disableBackdropClick
        onClose={() => onConfirm()}
        title={title}
        actions={
            <Button onClick={onConfirm} variant="contained" fullWidth>
                {confirmLabel}
            </Button>
        }
    >
        {children}
    </BaseDialog>
);
