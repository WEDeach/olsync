import { Checkbox, DialogContentText, FormControlLabel, List, ListItem, ListItemText } from "@mui/material";
import React from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { ConfirmDialog } from "./common/ConfirmDialog";

export interface CheckboxListDialogItem {
    id: string;
    primary: React.ReactNode;
    secondary?: React.ReactNode;
    disabled?: boolean;
}

export interface CheckboxListDialogProps {
    open: boolean;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    items: CheckboxListDialogItem[];
    checked: Record<string, boolean>;
    onToggle: (id: string, value: boolean) => void;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: "primary" | "secondary" | "error" | "info" | "success" | "warning";
    confirmVariant?: "text" | "outlined" | "contained";
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
}

export const CheckboxListDialog: React.FC<CheckboxListDialogProps> = ({
    open,
    title,
    subtitle,
    items,
    checked,
    onToggle,
    onConfirm,
    onCancel,
    confirmLabel = __(I18nStrings.BTN_CONFIRM),
    cancelLabel = __(I18nStrings.BTN_CANCEL),
    confirmColor = "primary",
    confirmVariant = "contained",
    confirmDisabled = false,
    confirmLoading = false,
}) => {
    return (
        <ConfirmDialog
            open={open}
            title={title}
            onConfirm={onConfirm}
            onCancel={onCancel}
            confirmLabel={confirmLabel}
            cancelLabel={cancelLabel}
            confirmColor={confirmColor}
            confirmVariant={confirmVariant}
            confirmDisabled={confirmDisabled}
            confirmLoading={confirmLoading}
        >
            {subtitle && <DialogContentText sx={{ mb: 1 }}>{subtitle}</DialogContentText>}
            <List dense disablePadding>
                {items.map((item) => (
                    <ListItem key={item.id} disableGutters disablePadding>
                        {item.disabled ? (
                            <ListItemText
                                primary={item.primary}
                                secondary={item.secondary}
                                slotProps={{ primary: { color: "text.disabled" } }}
                            />
                        ) : (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={!!checked[item.id]}
                                        onChange={(e) => onToggle(item.id, e.target.checked)}
                                    />
                                }
                                label={<ListItemText primary={item.primary} secondary={item.secondary} />}
                            />
                        )}
                    </ListItem>
                ))}
            </List>
        </ConfirmDialog>
    );
};
