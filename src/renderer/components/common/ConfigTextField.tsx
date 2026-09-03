import { TextField, TextFieldProps } from "@mui/material";
import React from "react";
import { ConfigKey } from "../../../utils/typed/config";
import g from "../../state";

interface ConfigTextFieldProps {
    configKey: ConfigKey | string;
    label: string;
    type?: "text" | "number";
    transform?: (raw: string) => any;
    defaultValue?: any;
    placeholder?: string;
    slotProps?: TextFieldProps["slotProps"];
    sx?: TextFieldProps["sx"];
    fullWidth?: boolean;
}

export const ConfigTextField: React.FC<ConfigTextFieldProps> = ({
    configKey,
    label,
    type = "text",
    transform,
    defaultValue,
    placeholder,
    slotProps,
    sx,
    fullWidth = true,
}) => (
    <TextField
        label={label}
        variant="outlined"
        size="small"
        type={type}
        defaultValue={defaultValue ?? g.config?.[configKey] ?? ""}
        placeholder={placeholder}
        slotProps={slotProps}
        sx={sx}
        fullWidth={fullWidth}
        onChange={(e) => g.saveConfig(configKey, transform ? transform(e.target.value) : e.target.value)}
    />
);
