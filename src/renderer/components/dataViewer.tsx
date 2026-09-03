import { Stack, Typography } from "@mui/material";
import { observer } from "mobx-react";
import React from "react";
import { AutoSizer } from "react-virtualized";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import { IPropertyWithName, Table } from "./table";

interface State {
    hidden: boolean;
}

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
    getRowClassName?: (row: DefaultObject, index: number) => string | undefined;
}

@observer
export class DataViewer extends React.PureComponent<Props, State> {
    state: State = { hidden: typeof document !== "undefined" && document.hidden };

    componentDidMount() {
        document.addEventListener("visibilitychange", this._onVisibilityChange);
    }

    componentWillUnmount() {
        document.removeEventListener("visibilitychange", this._onVisibilityChange);
    }

    private _onVisibilityChange = () => {
        this.setState({ hidden: document.hidden });
    };

    public render() {
        const total = this.props.rows_total ?? this.props.rows.length;
        const rowH = this.props.rowHeight ?? 36;
        const headerH = this.props.size === "small" ? 37 : 56;
        const naturalHeight = this.props.rows.length * rowH + headerH + 42;
        const maxH = this.props.maxHeight;
        const effectiveHeight = maxH != null ? Math.min(naturalHeight, maxH as number) : "100%";
        return (
            <Stack
                sx={{
                    height: effectiveHeight,
                    maxHeight: this.props.maxHeight,
                    minHeight: this.props.min_height,
                }}
                spacing={1}
            >
                <Typography
                    variant="caption"
                    component="div"
                    sx={{
                        color: "text.secondary",
                        textAlign: "right",
                    }}
                >
                    results:{" "}
                    {this.props.rows.length === total ? this.props.rows.length : `${this.props.rows.length} / ${total}`}
                </Typography>
                <div style={{ flex: 1, overflow: "hidden", minHeight: this.props.min_height }}>
                    {this.props.rows.length === 0 && this.props.emptyContent ? (
                        this.props.emptyContent
                    ) : this.state.hidden ? null : (
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
                                    getRowClassName={this.props.getRowClassName}
                                />
                            )}
                        </AutoSizer>
                    )}
                </div>
            </Stack>
        );
    }
}
