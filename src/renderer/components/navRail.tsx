import { Box, ButtonBase, Stack, Tooltip } from "@mui/material";
import React from "react";
import { SubViewType } from "../main/controller";

export interface NavRailItem {
    view: SubViewType;
    icon: React.ReactNode;
    label: string;
}

export interface NavRailProps {
    items: NavRailItem[];
    selected: SubViewType;
    onSelect: (view: SubViewType) => void;
    footer?: React.ReactNode;
}

const RailItem: React.FC<{
    item: NavRailItem;
    index: number;
    active: boolean;
    onSelect: (view: SubViewType) => void;
}> = ({ item, index, active, onSelect }) => {
    return (
        <Tooltip arrow title={item.label} placement="right">
            <ButtonBase
                onClick={() => onSelect(item.view)}
                sx={{
                    position: "relative",
                    width: 56,
                    height: 40,
                    borderRadius: 0,
                    overflow: "visible",
                    color: active ? "primary.main" : "text.secondary",
                    bgcolor: active ? "action.selected" : "transparent",
                    "&:hover": {
                        bgcolor: active ? "action.selected" : "action.hover",
                        "& .rail-icon": { transform: "scale(1.1)" },
                    },
                    "&:active": { transform: "scale(0.94)" },
                    transition:
                        "background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 100ms cubic-bezier(0.4, 0, 0.2, 1)",
                    animation: `rail-item-in 260ms cubic-bezier(0.2, 0, 0, 1) ${index * 30}ms backwards`,
                    "@keyframes rail-item-in": {
                        from: { opacity: 0, transform: "translateX(-10px)" },
                        to: { opacity: 1, transform: "translateX(0)" },
                    },
                }}
            >
                {active && (
                    <Box
                        sx={{
                            position: "absolute",
                            left: 0,
                            top: "50%",
                            width: 3,
                            height: 20,
                            borderRadius: 2,
                            bgcolor: "primary.main",
                            transform: "translateY(-50%)",
                            animation: "rail-indicator-in 200ms cubic-bezier(0.2, 0, 0, 1) backwards",
                            "@keyframes rail-indicator-in": {
                                from: { opacity: 0, transform: "translateY(-50%) scaleY(0.2)" },
                                to: { opacity: 1, transform: "translateY(-50%) scaleY(1)" },
                            },
                        }}
                    />
                )}
                <Box
                    className="rail-icon"
                    sx={{
                        display: "flex",
                        transition: "transform 150ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                >
                    {item.icon}
                </Box>
            </ButtonBase>
        </Tooltip>
    );
};

export const NavRail: React.FC<NavRailProps> = ({ items, selected, onSelect, footer }) => {
    return (
        <Stack
            spacing={0}
            sx={{
                width: 56,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "space-between",
                py: 1,
                borderRight: "1px solid var(--mui-palette-divider)",
            }}
        >
            <Stack spacing={0} sx={{ alignItems: "center", gap: 0.25 }}>
                {items.map((item, index) => (
                    <RailItem
                        key={item.view}
                        item={item}
                        index={index}
                        active={selected === item.view}
                        onSelect={onSelect}
                    />
                ))}
            </Stack>
            {footer !== undefined && (
                <Stack spacing={0} sx={{ alignItems: "center", gap: 0.5 }}>
                    {footer}
                </Stack>
            )}
        </Stack>
    );
};
