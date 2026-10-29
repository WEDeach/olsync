import { Box, Chip, FormControl, InputLabel, MenuItem, OutlinedInput, Select } from "@mui/material";
import React from "react";
import { IOsuCollection } from "../../defines/types";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { BeatmapFilterView, FilterType, TFilterSetting, TSubFilterSetting } from "./beatmapFilter";
import { PickerDrawerSection } from "./beatmapPickerDrawerSection";

const PICKER_FILTER_TYPES: FilterType[] = [
    FilterType.Title,
    FilterType.Artist,
    FilterType.Creator,
    FilterType.DifficultyName,
    FilterType.Source,
    FilterType.RankStateLocal,
    FilterType.RankedDate,
    FilterType.StarRating,
    FilterType.Mode,
    FilterType.PlayerTags,
    FilterType.ApproachRate,
    FilterType.CircleSize,
    FilterType.HpDrain,
    FilterType.OverallDifficulty,
    FilterType.DrainTime,
    FilterType.SliderVelocity,
    FilterType.StackLeniency,
    FilterType.CircleCount,
    FilterType.SliderCount,
    FilterType.SpinnerCount,
    FilterType.PlayedState,
    FilterType.LastPlayed,
];

interface IBeatmapPickerFilterPanelProps {
    collections: IOsuCollection[];
    activeSection?: "filter" | "collection";
    generalFilter: TFilterSetting;
    generalSubFilter: TSubFilterSetting;
    includedCollections: string[];
    excludedCollections: string[];
    disabledFilterTypes?: FilterType[];
    onGeneralFilterChanged: (settings: TFilterSetting) => void;
    onGeneralSubFilterChanged: (settings: TSubFilterSetting) => void;
    onIncludedCollectionsChanged: (cols: string[]) => void;
    onExcludedCollectionsChanged: (cols: string[]) => void;
    source: "stable" | "lazer";
    rankedDateQueryFailed?: boolean;
}

export const BeatmapPickerFilterPanel: React.FC<IBeatmapPickerFilterPanelProps> = ({
    collections,
    activeSection,
    generalFilter,
    generalSubFilter,
    includedCollections,
    excludedCollections,
    disabledFilterTypes,
    source,
    rankedDateQueryFailed,
    onGeneralFilterChanged,
    onGeneralSubFilterChanged,
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
        <>
            {showFilter && (
                <PickerDrawerSection title={I18nStrings.MAIN_PICKER_FILTER_TITLE}>
                    <BeatmapFilterView
                        inline
                        grouped
                        show={false}
                        allowedFilterTypes={PICKER_FILTER_TYPES}
                        disabledFilterTypes={disabledFilterTypes}
                        initialSettings={generalFilter}
                        initialSubFilter={generalSubFilter}
                        onClose={() => {}}
                        onFilterChanged={onGeneralFilterChanged}
                        onSubFilterChanged={onGeneralSubFilterChanged}
                        rankedDateSource={source === "lazer" ? "lazer" : "onlineDb"}
                        rankedDateQueryFailed={rankedDateQueryFailed}
                    />
                </PickerDrawerSection>
            )}
            {showCollection && (
                <PickerDrawerSection title={I18nStrings.MAIN_PICKER_FILTER_COLLECTION_TITLE}>
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
                </PickerDrawerSection>
            )}
        </>
    );
};
