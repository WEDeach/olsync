import {
    Box,
    Chip,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Select,
    Typography,
} from "@mui/material";
import React from "react";
import { IOsuCollection } from "../../defines/types";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { BeatmapFilterView, FilterType, TFilterSetting } from "./beatmapFilter";

interface IBeatmapPickerFilterPanelProps {
    collections: IOsuCollection[];
    activeSection?: "filter" | "collection";
    generalFilter: TFilterSetting;
    includedCollections: string[];
    excludedCollections: string[];
    onGeneralFilterChanged: (settings: TFilterSetting) => void;
    onIncludedCollectionsChanged: (cols: string[]) => void;
    onExcludedCollectionsChanged: (cols: string[]) => void;
}

export const BeatmapPickerFilterPanel: React.FC<IBeatmapPickerFilterPanelProps> = ({
    collections,
    activeSection,
    generalFilter,
    includedCollections,
    excludedCollections,
    onGeneralFilterChanged,
    onIncludedCollectionsChanged,
    onExcludedCollectionsChanged,
}) => {
    const showFilter = !activeSection || activeSection === "filter";
    const showCollection = !activeSection || activeSection === "collection";

    const handleIncludedChange = (value: string | string[]) => {
        onIncludedCollectionsChanged(typeof value === "string" ? value.split(",") : value);
    };

    const handleExcludedChange = (value: string | string[]) => {
        onExcludedCollectionsChanged(typeof value === "string" ? value.split(",") : value);
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", p: 1, gap: 1 }}>
            {showFilter && (
                <>
                    <Typography variant="subtitle2" color="text.secondary" textAlign="center">
                        {__(I18nStrings.MAIN_PICKER_FILTER_TITLE)}
                    </Typography>
                    <Divider />
                    <BeatmapFilterView
                        inline
                        show={false}
                        allowedFilterTypes={[
                            FilterType.Title,
                            FilterType.RankState,
                            FilterType.StarRating,
                            FilterType.Mode,
                        ]}
                        initialSettings={generalFilter}
                        onClose={() => {}}
                        onFilterChanged={onGeneralFilterChanged}
                        onSubFilterChanged={() => {}}
                    />
                </>
            )}
            {showCollection && (
                <>
                    {showFilter && <Divider />}
                    <Typography variant="subtitle2" color="text.secondary" textAlign="center">
                        {__(I18nStrings.MAIN_PICKER_FILTER_COLLECTION_TITLE)}
                    </Typography>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="picker-collection-include-label">
                            {__(I18nStrings.BTN_PICKER_FILTER_COLLECTION)}
                        </InputLabel>
                        <Select
                            labelId="picker-collection-include-label"
                            label={__(I18nStrings.BTN_PICKER_FILTER_COLLECTION)}
                            multiple
                            value={includedCollections}
                            onChange={(e) => handleIncludedChange(e.target.value)}
                            input={<OutlinedInput label={__(I18nStrings.BTN_PICKER_FILTER_COLLECTION)} size="small" />}
                            renderValue={(selected) => (
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {(selected as string[]).map((v) => (
                                        <Chip key={v} label={v} size="small" />
                                    ))}
                                </Box>
                            )}
                        >
                            {collections.map((col) => (
                                <MenuItem key={col.name} value={col.name}>
                                    {col.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" fullWidth>
                        <InputLabel id="picker-collection-exclude-label">
                            {__(I18nStrings.MAIN_PICKER_FILTER_COLLECTION_EXCLUDE)}
                        </InputLabel>
                        <Select
                            labelId="picker-collection-exclude-label"
                            label={__(I18nStrings.MAIN_PICKER_FILTER_COLLECTION_EXCLUDE)}
                            multiple
                            value={excludedCollections}
                            onChange={(e) => handleExcludedChange(e.target.value)}
                            input={
                                <OutlinedInput
                                    label={__(I18nStrings.MAIN_PICKER_FILTER_COLLECTION_EXCLUDE)}
                                    size="small"
                                />
                            }
                            renderValue={(selected) => (
                                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                                    {(selected as string[]).map((v) => (
                                        <Chip key={v} label={v} size="small" color="error" />
                                    ))}
                                </Box>
                            )}
                        >
                            {collections.map((col) => (
                                <MenuItem key={col.name} value={col.name}>
                                    {col.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </>
            )}
        </Box>
    );
};
