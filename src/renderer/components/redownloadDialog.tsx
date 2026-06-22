import { Checkbox, FormControlLabel, List, ListItem, Typography } from "@mui/material";
import React, { useState } from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { ConfirmDialog } from "./common/ConfirmDialog";

interface Props {
    open: boolean;
    filenames: string[];
    onConfirm: (selectedFilenames: string[]) => void;
    onCancel: () => void;
}

export const RedownloadDialog: React.FC<Props> = ({ open, filenames, onConfirm, onCancel }) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const handleToggle = (filename: string) => {
        const next = new Set(selected);
        if (next.has(filename)) {
            next.delete(filename);
        } else {
            next.add(filename);
        }
        setSelected(next);
    };

    const handleSelectAll = () => {
        if (selected.size === filenames.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filenames));
        }
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selected));
        setSelected(new Set());
    };

    const handleCancel = () => {
        onCancel();
        setSelected(new Set());
    };

    return (
        <ConfirmDialog
            open={open}
            title={__(I18nStrings.MAIN_DL_REDOWNLOAD_TITLE)}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            confirmLabel={__(I18nStrings.BTN_DL_REDOWNLOAD, { count: selected.size })}
            confirmDisabled={selected.size === 0}
        >
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {__(I18nStrings.MAIN_DL_REDOWNLOAD_DESC)}
            </Typography>
            <FormControlLabel
                control={
                    <Checkbox
                        checked={selected.size === filenames.length && filenames.length > 0}
                        indeterminate={selected.size > 0 && selected.size < filenames.length}
                        onChange={handleSelectAll}
                    />
                }
                label={
                    selected.size === filenames.length
                        ? __(I18nStrings.MAIN_DL_UNSELECT_ALL)
                        : __(I18nStrings.MAIN_DL_SELECT_ALL)
                }
                sx={{ mb: 1 }}
            />
            <List dense sx={{ maxHeight: 300, overflow: "auto", bgcolor: "background.paper", borderRadius: 1 }}>
                {filenames.map((filename) => (
                    <ListItem key={filename} dense>
                        <FormControlLabel
                            control={
                                <Checkbox checked={selected.has(filename)} onChange={() => handleToggle(filename)} />
                            }
                            label={filename}
                        />
                    </ListItem>
                ))}
            </List>
        </ConfirmDialog>
    );
};
