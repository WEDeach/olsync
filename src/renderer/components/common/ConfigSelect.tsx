import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import React from "react";
import { ConfigKey } from "../../../utils/typed/config";
import g from "../../state";

interface ConfigSelectOption {
    value: string | number;
    label: string;
}

interface ConfigSelectProps {
    configKey: ConfigKey | string;
    label: string;
    options: ConfigSelectOption[];
    defaultValue?: string;
    size?: "small" | "medium";
    fullWidth?: boolean;
    onChange?: (value: string | number) => void;
}

export const ConfigSelect: React.FC<ConfigSelectProps> = ({
    configKey,
    label,
    options,
    defaultValue,
    size = "small",
    fullWidth = true,
    onChange,
}) => (
    <FormControl size={size} fullWidth={fullWidth}>
        <InputLabel>{label}</InputLabel>
        <Select
            label={label}
            value={g.config?.[configKey] ?? defaultValue ?? ""}
            onChange={(e) => {
                const val = e.target.value as string;
                g.saveConfig(configKey, val);
                onChange?.(val);
            }}
        >
            {options.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                </MenuItem>
            ))}
        </Select>
    </FormControl>
);
