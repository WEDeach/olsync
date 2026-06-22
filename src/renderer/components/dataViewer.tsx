import { Stack, Typography } from "@mui/material";
import { observer } from "mobx-react";
import React from "react";
import { AutoSizer } from "react-virtualized";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import { IPropertyWithName, Table } from "./table";

interface Props {
    heads: IPropertyWithName[];
    rows: DefaultObject[];
    onScrollToBottom?: () => void;
    threshold?: number;
    rows_total?: number;
    min_height?: number | string;
    maxHeight?: number | string;
    onRowClick?: (row: any, index: number) => void;
    rowHeight?: number;
    emptyContent?: React.ReactNode;
    size?: "small" | "medium";
    onRowHover?: (key: string | null) => void;
    highlightKey?: string | null;
    onVisibleKeysChange?: (keys: string[]) => void;
    getRowKey?: (row: DefaultObject, index: number) => any;
}

@observer
export class DataViewer extends React.PureComponent<Props> {
    public render() {
        const total = this.props.rows_total ?? this.props.rows.length;
        return (
            <Stack
                sx={{
                    height: this.props.maxHeight ?? "100%",
                    maxHeight: this.props.maxHeight,
                    minHeight: this.props.min_height,
                }}
                spacing={1}
            >
                <Typography variant="caption" component="div" color="text.secondary" sx={{ textAlign: "right" }}>
                    results:{" "}
                    {this.props.rows.length === total ? this.props.rows.length : `${this.props.rows.length} / ${total}`}
                </Typography>
                <div style={{ flex: 1, overflow: "hidden", minHeight: this.props.min_height }}>
                    {this.props.rows.length === 0 && this.props.emptyContent ? (
                        this.props.emptyContent
                    ) : (
                        <AutoSizer>
                            {(sizeProps) => (
                                <Table
                                    dimensions={sizeProps}
                                    heads={this.props.heads}
                                    rows={this.props.rows}
                                    onScrollToBottom={this.props.onScrollToBottom}
                                    threshold={this.props.threshold}
                                    rowHeight={this.props.rowHeight}
                                    onRowClick={this.props.onRowClick}
                                    size={this.props.size}
                                    onRowHover={this.props.onRowHover}
                                    highlightKey={this.props.highlightKey}
                                    onVisibleKeysChange={this.props.onVisibleKeysChange}
                                    getRowKey={this.props.getRowKey}
                                />
                            )}
                        </AutoSizer>
                    )}
                </div>
            </Stack>
        );
    }
}
