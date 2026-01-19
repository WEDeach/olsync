import { Backdrop,Button,CircularProgress,Container,Grid,Stack,TextField,Typography } from "@mui/material";
import React from "react";
import Controller from "./controller";
import { observer } from "mobx-react";
import { DataViewer } from "../../components/dataViewer";


@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller=new Controller();
    }

    render() {
        const s_tables=this.controller.STables;
        return (
            <Container maxWidth="lg" sx={{ height: "100%" }}>
                <Stack sx={{ height: "100%" }} spacing={2}>
                    <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
                        DEBUG_VIEW: Lazer
                    </Typography>
                    <div>
                        <Button variant="contained" onClick={this.controller.handleSelectFile}>
                            選擇檔案
                        </Button>
                        <TextField id="outlined-basic" label="Outlined" variant="outlined" value={this.controller.Path} />
                    </div>
                    <div>
                        <Button variant="contained" onClick={this.controller.onReadLazerBtnClicked} disabled={this.controller.Path.length==0}>
                            讀取檔案
                        </Button>
                        <Button variant="contained" onClick={this.controller.onCloseLazerBtnClicked} disabled={this.controller.Path.length==0}>
                            關閉檔案
                        </Button>
                    </div>
                    <Grid container spacing={.5}>
                        {s_tables.map((t) => {
                            return <Button variant="contained" onClick={() => this.controller.onSchemaBtnClicked(t)}>
                                {t}
                            </Button>
                        })}
                    </Grid>
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

