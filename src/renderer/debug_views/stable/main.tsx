import { Backdrop, Button, Chip, Container, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react";
import React from "react";
import { stableIpcState } from "../../../utils/stableIpcState";
import { PausableCircularProgress } from "../../components/common/PausableCircularProgress";
import { DataViewer } from "../../components/dataViewer";
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
            <Container maxWidth="lg" sx={{ height: "100%" }}>
                <Stack sx={{ height: "100%" }} spacing={2}>
                    <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
                        DEBUG_VIEW: Osu!
                    </Typography>
                    <Typography variant="h6" component="h2">
                        Stable IPC Client Data
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                        <Chip
                            label={`Connected: ${stableIpcState.data.Connected}`}
                            color={stableIpcState.data.Connected ? "success" : "default"}
                            size="small"
                        />
                        <Chip
                            label={`Mode: ${stableIpcState.modeName} (${stableIpcState.data.Mode ?? "-"})`}
                            size="small"
                        />
                        <Chip label={`BeatmapId: ${stableIpcState.data.BeatmapId ?? "-"}`} size="small" />
                        <Chip label={`Score: ${stableIpcState.data.Score ?? "-"}`} size="small" />
                        <Chip label={`AudioTime: ${stableIpcState.data.AudioTime ?? "-"}`} size="small" />
                        <Chip label={`ReplayTime: ${stableIpcState.data.ReplayTime ?? "-"}`} size="small" />
                        <Chip label={`SpectatingID: ${stableIpcState.data.SpectatingID ?? "-"}`} size="small" />
                        <Chip label={`MenuTime: ${stableIpcState.data.MenuTime ?? "-"}`} size="small" />
                        <Chip label={`AudioPlaying: ${stableIpcState.data.AudioPlaying ?? "-"}`} size="small" />
                        <Chip label={`DimLevel: ${stableIpcState.data.DimLevel ?? "-"}`} size="small" />
                        <Chip label={`Buffering: ${stableIpcState.data.Buffering ?? "-"}`} size="small" />
                        <Chip label={`SkipCalculations: ${stableIpcState.data.SkipCalculations ?? "-"}`} size="small" />
                        <Chip label={`LReplayFrame: ${stableIpcState.data.LReplayFrame ?? "-"}`} size="small" />
                        <Chip label={`LReplayMode: ${stableIpcState.data.LReplayMode ?? "-"}`} size="small" />
                        <Chip label={`LReplayStreaming: ${stableIpcState.data.LReplayStreaming ?? "-"}`} size="small" />
                        <Chip label={`LPlayerLoaded: ${stableIpcState.data.LPlayerLoaded ?? "-"}`} size="small" />
                        <Chip label={`LReplayToEnd: ${stableIpcState.data.LReplayToEnd ?? "-"}`} size="small" />
                    </Stack>
                    <TextField
                        multiline
                        fullWidth
                        rows={8}
                        value={JSON.stringify(stableIpcState.data, null, 2)}
                        slotProps={{
                            input: { readOnly: true },
                        }}
                    />
                    <Stack direction={"row"} spacing={1}>
                        <TextField label="Path" variant="outlined" value={this.controller.Path} sx={{ flexGrow: 1 }} />
                        <Button variant="contained" onClick={this.controller.handleSelectFile}>
                            選擇檔案
                        </Button>
                    </Stack>
                    <Stack direction={"row"} spacing={1}>
                        <TextField
                            label="PathPatch"
                            variant="outlined"
                            value={this.controller.PathPatch}
                            sx={{ flexGrow: 1 }}
                            disabled
                        />
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

                    {this.controller.SSchemaRows.length > 0 && (
                        <Typography variant="subtitle1" component="div" sx={{ textAlign: "right" }}>
                            results: {this.controller.SSchemaRows.length}
                        </Typography>
                    )}
                    <DataViewer
                        heads={this.controller.SSchemaKeys}
                        rows={this.controller.SSchemaRows}
                        onScrollToBottom={this.controller.loadSchemaObjs}
                        threshold={100}
                    />
                    <Backdrop
                        sx={(theme) => ({ color: "#fff", zIndex: theme.zIndex.drawer + 1 })}
                        open={!this.controller.SSchemaRowsLoaded}
                    >
                        <PausableCircularProgress color="inherit" />
                    </Backdrop>
                </Stack>
            </Container>
        );
    }
}
