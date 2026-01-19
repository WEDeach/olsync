import { observer } from "mobx-react";
import React from "react";
import Controller from "./controller";
import { Button,Stack,TextField,Typography } from "@mui/material";
import __ from "../../../utils/i18n";

@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller=new Controller();
    }

    render() {
        return (
            <Stack sx={{ height: "100%" }} spacing={2}>
                <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
                    DEBUG_VIEW: API TEST!
                </Typography>
                <Stack direction={"row"} spacing={1}>
                    <TextField label="Client Id" variant="outlined" value={this.controller.ClientId} sx={{ flexGrow: 1 }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        this.controller.onApiClientConfigChanged(event.target.value);
                    }} />
                    <TextField label="Client Secret" variant="outlined" value={this.controller.ClientSecret} sx={{ flexGrow: 1 }} onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        this.controller.onApiClientConfigChanged(undefined,event.target.value);
                    }} />
                </Stack>
                <Button variant="contained" onClick={() => this.controller.initClient()}>
                    TEST INIT API CLIENT
                </Button>
            </Stack>
        );
    }
}