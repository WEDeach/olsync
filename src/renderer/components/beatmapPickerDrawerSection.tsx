import { Divider, Stack, Typography } from "@mui/material";
import React from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";

export const PickerDrawerSection: React.FC<{
    title: I18nStrings;
    fill?: boolean;
    children: React.ReactNode;
}> = ({ title, fill, children }) => (
    <Stack
        spacing={2}
        useFlexGap
        sx={{
            py: 2,
            width: "100%",
            ...(fill ? { height: "100%", minHeight: 0 } : {}),
        }}
    >
        <Typography
            variant="h6"
            sx={{
                px: 2,
                color: "text.secondary",
                textAlign: "center",
                flexShrink: 0,
            }}
        >
            {__(title)}
        </Typography>
        <Divider sx={{ mx: 2, flexShrink: 0 }} />
        <Stack
            spacing={2}
            sx={{
                width: "100%",
                maxWidth: 1200,
                mx: "auto",
                px: 2,
                ...(fill ? { flex: 1, minHeight: 0 } : {}),
            }}
        >
            {children}
        </Stack>
    </Stack>
);
