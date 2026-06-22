import { IconButton, Tooltip } from "@mui/material";
import React from "react";

interface ActionIconButtonProps {
    title: string;
    onClick: () => void;
    color?: "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning";
    size?: "small" | "medium" | "large";
    disabled?: boolean;
    loading?: boolean;
    children: React.ReactNode;
}

export const ActionIconButton: React.FC<ActionIconButtonProps> = ({
    title,
    onClick,
    color = "default",
    size = "small",
    disabled = false,
    loading = false,
    children,
}) => (
    <Tooltip title={title} arrow>
        <span>
            <IconButton size={size} color={color} disabled={disabled || loading} onClick={onClick}>
                {children}
            </IconButton>
        </span>
    </Tooltip>
);
