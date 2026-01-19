import { observer } from "mobx-react";
import React from "react";
import Controller from "./controller";
import { Backdrop,Button,CircularProgress,Container,Stack,TextField,Typography } from "@mui/material";
import { DataViewer } from "../../components/dataViewer";

@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller=new Controller();
    }

    render() {
        return (
            <Container maxWidth="lg" sx={{ height: "100%" }}>
                <Stack sx={{ height: "100%" }} spacing={2}>
                    <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
                        DEBUG_VIEW: Osu!
                    </Typography>
                    <Stack direction={"row"} spacing={1}>
                        <TextField label="Path" variant="outlined" value={this.controller.Path} sx={{ flexGrow: 1 }} />
                        <Button variant="contained" onClick={this.controller.handleSelectFile}>
                            選擇檔案
                        </Button>
                    </Stack>
                    <Stack direction={"row"} spacing={1}>
                        <TextField label="PathPatch" variant="outlined" value={this.controller.PathPatch} sx={{ flexGrow: 1 }} disabled />
                        <Button variant="contained" onClick={this.controller.onBtnPathPatchClicked}>
                            檢查1
                        </Button>
                        <Button variant="contained" onClick={this.controller.onBtnPathPatchV2Clicked}>
                            檢查2
                        </Button>
                    </Stack>
                    <Button variant="contained" onClick={this.controller.onBtnCollectionClicked}>
                        檢查收藏夾
                    </Button>
                    <Button variant="contained" onClick={this.controller.onBtnReadOsuDBFileClicked}>
                        測試讀取OSU_DB檔案
                    </Button>
                    <Button variant="contained" onClick={this.controller.onBtnReadScoresClicked}>
                        Read Scores
                    </Button>

                    {this.controller.SSchemaRows.length>0&&<Typography variant="subtitle1" component="div" sx={{ textAlign: "right" }}>results: {this.controller.SSchemaRows.length}</Typography>}
                    <DataViewer
                        heads={this.controller.SSchemaKeys}
                        rows={this.controller.SSchemaRows}
                        onScrollToBottom={this.controller.loadSchemaObjs}
                        threshold={100}
                    />
                    <Backdrop
                        sx={(theme) => ({ color: '#fff',zIndex: theme.zIndex.drawer+1 })}
                        open={!this.controller.SSchemaRowsLoaded}
                    >
                        <CircularProgress color="inherit" />
                    </Backdrop>
                </Stack>
            </Container>
        );
    }
}