import { Button, Typography } from "@mui/material";
import React, { useState } from "react";
import __ from "../../../utils/i18n";
import { I18nStrings } from "../../../utils/typed/i18n";
import { BaseDialog } from "./BaseDialog";
import type { RankedDateQueryFailure, StableRankedDateFilterResult } from "./useStableRankedDateFilter";

export function getRankedDateCountLabel(status: StableRankedDateFilterResult["status"], fallbackLabel: string): string {
    if (status === "loading") return __(I18nStrings.MAIN_PICKER_RANKED_DATE_QUERY_LOADING);
    if (status === "error") return __(I18nStrings.MAIN_PICKER_RANKED_DATE_QUERY_FAILED);
    return fallbackLabel;
}

export function isRankedDateQueryBlocked(
    status: StableRankedDateFilterResult["status"],
    pickerLoaded: boolean,
): boolean {
    return pickerLoaded && (status === "loading" || status === "error");
}

interface RankedDateQueryErrorDialogProps {
    failure: RankedDateQueryFailure | null;
    onReviewCondition: () => void;
}

export const RankedDateQueryErrorDialog: React.FC<RankedDateQueryErrorDialogProps> = ({
    failure,
    onReviewCondition,
}) => {
    const [acknowledged, setAcknowledged] = useState<RankedDateQueryFailure | null>(null);
    const open = failure !== null && failure !== acknowledged;
    const acknowledge = () => setAcknowledged(failure);
    const bound = (value: string) => (value === "" ? "-" : value);
    return (
        <BaseDialog
            open={open}
            onClose={acknowledge}
            title={__(I18nStrings.MAIN_PICKER_RANKED_DATE_QUERY_ERROR_TITLE)}
            actions={
                <Button
                    variant="contained"
                    fullWidth
                    onClick={() => {
                        acknowledge();
                        onReviewCondition();
                    }}
                >
                    {__(I18nStrings.BTN_PICKER_REVIEW_CONDITION)}
                </Button>
            }
        >
            <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {__(I18nStrings.MAIN_PICKER_RANKED_DATE_QUERY_ERROR_DESC, {
                    from: bound(failure?.from ?? ""),
                    to: bound(failure?.to ?? ""),
                })}
            </Typography>
        </BaseDialog>
    );
};
