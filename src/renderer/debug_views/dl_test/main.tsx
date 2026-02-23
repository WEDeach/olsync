import { Button, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react";
import React from "react";
import Controller from "./controller";

@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller = new Controller();
    }

    render() {
        return (
            <Stack sx={{ height: "100%" }} spacing={2}>
                <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
                    DEBUG_VIEW: DOWNLOADER TEST!
                </Typography>
                <Stack direction={"row"} spacing={1}></Stack>
                <Button variant="contained" onClick={() => this.controller.initFDM()}>
                    TEST FDM
                </Button>
            </Stack>
        );
    }
}
