import React from "react";
import { DataViewer } from "./dataViewer";
import { DefaultObject } from "realm/dist/public-types/namespace";

export interface IValueObserver {
    value: any;
    callback: (value: any) => void;
};

export interface IBeatmap {
    checksum: string;
    is_selected?: IValueObserver;
};

export interface IBeatmapListProps {
    beatmaps: IBeatmap[];
};

export const BeatmapList=(props: IBeatmapListProps) => {
    const rows: DefaultObject[]=props.beatmaps.map(b => { return { checksum: b.checksum,is_selected: b.is_selected }; });
    return <DataViewer heads={[{ name: "#",type: "checkbox",key: "is_selected" },{ name: "checksum",type: "string" }]} rows={rows} rows_total={rows.length} min_height={"80dvh"} />;
}