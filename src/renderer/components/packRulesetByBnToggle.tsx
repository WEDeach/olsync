import { FormControlLabel, Stack, Switch } from "@mui/material";
import { Observer } from "mobx-react";
import React from "react";
import { getPackRulesetByNmExperiment } from "../../utils/experiments";
import __ from "../../utils/i18n";
import { ConfigKey } from "../../utils/typed/config";
import { I18nStrings } from "../../utils/typed/i18n";
import g from "../state";
import { InfoLinkTooltip } from "./infoLinkTooltip";

const BN_WIKI_URL = "https://osu.ppy.sh/wiki/en/People/Beatmap_Nominators";

export const PackRulesetByBnToggle: React.FC = () => {
    return (
        <Observer>
            {() => (
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                        alignItems: "center",
                    }}
                >
                    <FormControlLabel
                        control={
                            <Switch
                                checked={getPackRulesetByNmExperiment()}
                                onChange={(_, checked) =>
                                    g.saveConfig(ConfigKey.EXPERIMENT_PACK_RULESET_BY_NM, Boolean(checked))
                                }
                            />
                        }
                        label={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_NM)}
                    />
                    <InfoLinkTooltip
                        title={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_BN_DESC_PRE)}
                        linkText={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_BN_DESC_LINK)}
                        href={BN_WIKI_URL}
                        postfix={__(I18nStrings.MAIN_SETTINGS_PACK_RULESET_BY_BN_DESC_POST)}
                    />
                </Stack>
            )}
        </Observer>
    );
};
