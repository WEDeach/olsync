import { FormControlLabel, Stack, Switch, Tooltip, Typography } from "@mui/material";
import React from "react";
import { ConfigKey } from "../../../utils/typed/config";
import g from "../../state";

interface ConfigSwitchProps {
    configKey: ConfigKey | string;
    label: React.ReactNode;
    tooltip?: React.ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
}

export const ConfigSwitch: React.FC<ConfigSwitchProps> = ({ configKey, label, tooltip, checked, onChange }) => (
    <FormControlLabel
        control={
            <Switch
                checked={checked ?? Boolean(g.config?.[configKey])}
                onChange={(_, c) => {
                    g.saveConfig(configKey, Boolean(c));
                    onChange?.(c);
                }}
            />
        }
        label={
            tooltip ? (
                <Stack direction="row" alignItems="center" spacing={1} useFlexGap>
                    {label}
                    <Tooltip title={tooltip} arrow>
                        <Typography variant="caption" color="text.secondary">
                            ?
                        </Typography>
                    </Tooltip>
                </Stack>
            ) : (
                label
            )
        }
    />
);
