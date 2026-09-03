import { Box, List, ListItem, ListItemText, Typography } from "@mui/material";
import React from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";

export interface ICompareListProps {
    source: { [key: string]: any };
    target: { [key: string]: any };
}

function getDiffRows(source: any, target: any) {
    const rows: Array<{
        key: string;
        sourceValue: any;
        targetValue: any;
        status: "added" | "removed" | "changed" | "unchanged";
    }> = [];

    const allKeys = Array.from(new Set([...Object.keys(source || {}), ...Object.keys(target || {})]));

    allKeys.forEach((key) => {
        const sourceValue = source?.[key];
        const targetValue = target?.[key];
        if (sourceValue === undefined && targetValue !== undefined) {
            rows.push({ key, sourceValue, targetValue, status: "added" });
        } else if (sourceValue !== undefined && targetValue === undefined) {
            rows.push({ key, sourceValue, targetValue, status: "removed" });
        } else if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
            rows.push({ key, sourceValue, targetValue, status: "changed" });
        } else {
            rows.push({ key, sourceValue, targetValue, status: "unchanged" });
        }
    });

    return rows;
}

const statusColor = {
    added: "rgba(76, 175, 80, 0.06)",
    removed: "rgba(244, 67, 54, 0.06)",
    changed: "rgba(255, 193, 7, 0.08)",
    unchanged: "inherit",
};

const statusLabel = {
    added: __(I18nStrings.MAIN_COMPARE_STATUS_ADDED),
    removed: __(I18nStrings.MAIN_COMPARE_STATUS_REMOVED),
    changed: __(I18nStrings.MAIN_COMPARE_STATUS_CHANGED),
    unchanged: "",
};

const CompareList: React.FC<ICompareListProps> = ({ source, target }) => {
    const rows = getDiffRows(source, target);

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                {__(I18nStrings.MAIN_COMPARE_TITLE)}
            </Typography>
            <List>
                {rows.map((row) => (
                    <ListItem
                        key={row.key}
                        sx={{
                            bgcolor: statusColor[row.status],
                            borderRadius: 1,
                            mb: 0.5,
                            display: "flex",
                            alignItems: "flex-start",
                        }}
                    >
                        <Box sx={{ minWidth: 120, fontWeight: "bold" }}>{row.key}</Box>
                        <Box sx={{ flex: 1 }}>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: "flex", gap: 2 }}>
                                        <Box>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: "text.secondary",
                                                }}
                                            >
                                                {__(I18nStrings.MAIN_COMPARE_ORIGINAL)}
                                            </Typography>
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    textDecoration:
                                                        row.status === "removed" || row.status === "changed"
                                                            ? "line-through"
                                                            : "none",
                                                }}
                                            >
                                                {JSON.stringify(row.sourceValue)}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: "text.secondary",
                                                }}
                                            >
                                                {__(I18nStrings.MAIN_COMPARE_TARGET)}
                                            </Typography>
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    fontWeight:
                                                        row.status === "added" || row.status === "changed"
                                                            ? "bold"
                                                            : "normal",
                                                }}
                                            >
                                                {JSON.stringify(row.targetValue)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                                secondary={
                                    statusLabel[row.status] && (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: "text.secondary",
                                            }}
                                        >
                                            {statusLabel[row.status]}
                                        </Typography>
                                    )
                                }
                            />
                        </Box>
                    </ListItem>
                ))}
            </List>
        </Box>
    );
};

export default CompareList;
