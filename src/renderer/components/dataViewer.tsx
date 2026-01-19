import React from "react";
import { AutoSizer } from 'react-virtualized';
import { IPropertyWithName,Table } from "./table";
import { DefaultObject } from "realm/dist/public-types/schema/types";
import { Paper,Stack,Typography } from "@mui/material";
import { observer } from "mobx-react";

interface Props {
    heads: IPropertyWithName[]
    rows: DefaultObject[]
    onScrollToBottom?: () => void;
    threshold?: number;
    rows_total?: number;
    min_height?: number|string;
}

@observer
export class DataViewer extends React.PureComponent<Props> {
    public render() {
        return (
            <Stack sx={{ height: "100%",minHeight: this.props.min_height,}} spacing={2}>
                <Typography variant="subtitle1" component="div" sx={{ textAlign: "right" }}>results: {this.props.rows.length===this.props.rows_total? this.props.rows.length:`${this.props.rows.length} / ${this.props.rows_total}`}</Typography>
                <Paper sx={{
                    width: '100%',overflow: 'hidden',
                    height: "100%",
                    minHeight: this.props.min_height,
                }}>
                    <AutoSizer>
                        {sizeProps => (
                            <Table
                                {...this.props}
                                dimensions={sizeProps} />
                        )}
                    </AutoSizer>
                </Paper>
            </Stack>);
    }
}

