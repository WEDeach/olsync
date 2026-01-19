import { Alert,Avatar,Backdrop,Box,Button,ButtonGroup,Card,CardHeader,Checkbox,CircularProgress,Collapse,Container,CssBaseline,Dialog,DialogActions,DialogContent,DialogTitle,Divider,Drawer,FormControl,Grid,IconButton,InputAdornment,InputLabel,List,ListItemButton,ListItemIcon,ListItemText,MenuItem,OutlinedInput,Select,Slide,Slider,Snackbar,Stack,TextField,ThemeProvider,ToggleButton,ToggleButtonGroup,Typography } from "@mui/material";
import React from "react";
import theme from "../theme";
import Controller,{ FilterType,MainViewState,PlayCountFS,SubViewType } from "./controller";
import { Observer,observer } from "mobx-react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { BeatmapList } from "../components/beatmapList";
import CompareList from "../components/compareList";
import { DataViewer } from "../components/dataViewer";
import { BeatmapPackDownloadView } from "../components/beatmapPackDownload";
import { OsuPathSettings } from "../components/osuPathSettings";
import { ApiSettings } from "../components/apiSettings";
import g,{ NewSyncState } from "../state";
import { formatTimeAgo } from "../../utils/time";
import { RankedStatus } from "../../api/v2/types/api_resp";
import { IPropertyWithName } from "../components/table";
import { KeyboardArrowDown,KeyboardArrowUp,Search } from "@mui/icons-material";
import { NumberField } from "@base-ui/react/number-field";


@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller=new Controller();
    }

    render() {
        const SubView=this.controller.SubView;
        const SSubView=this.controller.SSubView;
        const SyncPlayer=this.controller.SCachedVals.find((v) => v.key==="#sync_player")?.val.id==this.controller.CSyncTargetId? this.controller.SCachedVals.find((v) => v.key==="#sync_player"):undefined;
        return (
            // Setup theme and css baseline for the Material-UI app
            // https://mui.com/customization/theming/and
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Container maxWidth="lg" sx={{ height: "100%",minWidth: "64rem",p: 1 }}>
                    <Stack sx={{ height: "100%" }} spacing={2}>
                        {this.controller.IsDev&&<ToggleButtonGroup color="error"
                            value={this.controller.SSubView}
                            exclusive
                            onChange={this.controller.onBtnDebugClicked}
                        >
                            <ToggleButton value={SubViewType.D_LAZER}>
                                Lazer_Debug
                            </ToggleButton>
                            <ToggleButton value={SubViewType.D_STABLE}>
                                Osu_Debug
                            </ToggleButton>
                            <ToggleButton value={SubViewType.D_API}>
                                API_Debug
                            </ToggleButton>
                            <ToggleButton value={SubViewType.D_DLX}>
                                DL_TEST
                            </ToggleButton>
                            <ToggleButton value={SubViewType.NONE}>
                                NONE
                            </ToggleButton>
                        </ToggleButtonGroup>}
                        <Box display="flex" alignItems="center" gap={2}>
                            <ToggleButtonGroup color="primary"
                                value={this.controller.SSubView}
                                exclusive
                                onChange={this.controller.onBtnViewClicked}
                                sx={{ flexGrow: 1 }}
                            >
                                <ToggleButton value={SubViewType.COLLECTION}>
                                    收藏夾
                                </ToggleButton>
                                <ToggleButton value={SubViewType.SONG_RECOVERY_BY_SCORES}>
                                    歌曲缺失檢查
                                </ToggleButton>
                                <ToggleButton value={SubViewType.MAP_PACKS}>
                                    Packs
                                </ToggleButton>
                                <ToggleButton value={SubViewType.NONE}>
                                    NONE
                                </ToggleButton>
                            </ToggleButtonGroup>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => this.controller.checkUpdate(true)}
                            >
                                {__(I18nStrings.BTN_UPDATE_CHECK)}
                            </Button>
                        </Box>
                        {SubView!==undefined&&(<SubView />)}
                        {SSubView===SubViewType.NONE&&this.renderDynSection()}
                        {SSubView===SubViewType.COLLECTION&&this.renderCollection()}
                        {SSubView===SubViewType.SONG_RECOVERY_BY_SCORES&&this.renderSongRecovery()}
                        {SSubView===SubViewType.MAP_PACKS&&this.renderMapPacks()}
                    </Stack>
                    <Dialog
                        sx={(theme) => ({ zIndex: theme.zIndex.drawer+1 })}
                        open={this.controller.SDialog.show}
                        onClose={() => this.controller.SetDialogState(false)}
                        maxWidth="lg" fullWidth
                    >
                        <DialogTitle>{this.controller.SDialog.title}</DialogTitle>
                        <DialogContent>
                            {this.controller.SDialog.content!==undefined&&this.renderDialogContent(this.controller.SDialog.content)}
                            {this.controller.SDialog.beatmaps&&<BeatmapList {...this.controller.SDialog.beatmaps} />}
                            {this.controller.SDialog.compares&&<CompareList {...this.controller.SDialog.compares} />}
                            {this.controller.SDialog.syncState&&this.renderSyncState(this.controller.SDialog.syncState)}
                        </DialogContent>
                        <DialogActions>
                            {this.controller.SDialog.actions?.map((a) => <Button onClick={a.callback} key={a.label} variant="contained">{a.label}</Button>)}
                        </DialogActions>
                    </Dialog>
                    <Dialog
                        sx={(theme) => ({ zIndex: theme.zIndex.drawer+1 })}
                        open={this.controller.SShowUserDialog}
                        onClose={() => this.controller.SetShowUserDialogState(false)}
                        maxWidth="lg" fullWidth
                    >
                        <DialogContent>
                            <Stack spacing={2} alignItems="center" useFlexGap>
                                <Typography variant="h4">{SyncPlayer===undefined? __(I18nStrings.MAIN_SRS_PLAYER_WHO):__(I18nStrings.MAIN_SRS_PLAYER_YOU)}</Typography>
                                <Avatar sx={{ width: "25%",height: "25%" }} src={SyncPlayer?.val.pic??"https://osu.ppy.sh/images/layout/avatar-guest@2x.png"} />
                                <Typography variant="subtitle1">{SyncPlayer!==undefined&&SyncPlayer.val.name}</Typography>
                                <TextField
                                    fullWidth
                                    slotProps={{
                                        input: {
                                            startAdornment: <InputAdornment position="start">https://osu.ppy.sh/users/</InputAdornment>,
                                        },
                                    }}
                                    value={this.controller.CSyncTargetId}
                                    onChange={(e) => this.controller.OnSyncPlayerIdChanged(e.target.value)}
                                />
                                <Collapse in={this.controller.CSyncTargetId.length>0} timeout={300} sx={{ width: "100%" }}>
                                    <Box sx={{ display: "flex",gap: 1,width: "100%",overflowX: "hidden" }}>
                                        <Box
                                            sx={{
                                                width: SyncPlayer!==undefined? "50%":"100%",
                                                transition: "width 300ms ease-in-out",
                                                flexShrink: 0
                                            }}
                                        >
                                            <Button
                                                variant="contained"
                                                onClick={() => this.controller.onBtnCheckUserIdClicked()}
                                                loading={this.controller.SLoading.loading}
                                                color={SyncPlayer===undefined? "primary":"error"}
                                                fullWidth
                                            >
                                                {__(I18nStrings.BTN_SRS_PLAYER_CHECK)}
                                            </Button>
                                        </Box>
                                        <Slide
                                            direction="left"
                                            in={SyncPlayer!==undefined}
                                            timeout={300}
                                            mountOnEnter
                                            unmountOnExit
                                        >
                                            <Box sx={{ width: "50%",flexShrink: 0,pr: 1 }}>
                                                <Button
                                                    variant="contained"
                                                    loading={this.controller.SLoading.loading}
                                                    onClick={() => this.controller.onBtnSRSPlayerConfirmClicked()}
                                                    fullWidth
                                                >
                                                    {__(I18nStrings.BTN_SRS_PLAYER_ISME)}
                                                </Button>
                                            </Box>
                                        </Slide>
                                    </Box>
                                </Collapse>
                            </Stack>
                        </DialogContent>
                    </Dialog>
                    <Backdrop
                        sx={(theme) => ({ color: '#fff',zIndex: theme.zIndex.drawer+2 })}
                        open={this.controller.SLoading.loading}
                    >
                        <Stack spacing={2} alignItems="center" useFlexGap>
                            <CircularProgress color="inherit" />
                            {this.controller.SLoading.message}
                            {this.controller.SLoading.aborter&&<Button size="small" variant="contained" color="error" onClick={() => this.controller.SLoading.aborter!.abort()}>{__(I18nStrings.BTN_ABORT)}</Button>}
                        </Stack>
                    </Backdrop>
                    <Backdrop
                        sx={(theme) => ({ color: '#fff',zIndex: theme.zIndex.drawer+3 })}
                        open={g.hasError()}
                        onClick={() => g.clearError()}
                    >
                        <Alert variant="filled" severity="error" onClick={(e) => e.stopPropagation()}>
                            {g.error?.message}
                        </Alert>
                    </Backdrop>
                    <Snackbar
                        open={g.hasNotify()}
                        autoHideDuration={g.notify?.autoHideDuration??5000}
                        slots={{ transition: Slide }}
                        onClose={g.clearNotify}
                        message={g.notify?.message}
                        action={g.notify?.action}
                        anchorOrigin={g.notify?.anchorOrigin}
                    >
                        {g.notify?.severity&&<Alert severity={g.notify.severity} variant="filled">{g.notify.message}</Alert>}
                    </Snackbar>
                    <Drawer
                        anchor={"top"}
                        open={this.controller.SShowFilter}
                        onClose={() => this.controller.toggleFilter(false)}
                    >
                        {this.renderFilter()}
                    </Drawer>
                </Container>
            </ThemeProvider>
        );
    }

    renderDialogContent(content: any) {
        if(content===undefined) return null;
        if(typeof content==="function") return content();
        if(typeof content==="string") return (<Typography
            component="div"
            dangerouslySetInnerHTML={{ __html: content }}
        />);
        return content;
    }

    renderDynSection() {
        return <>
            <Typography variant="h3">OLSync</Typography>
            <Divider />
            <Typography variant="h4">Version: {this.controller.Version}</Typography>
        </>;
    }

    renderSelectGroups() {
        const SGA=this.controller.VSelectGroupA;
        const SGB=this.controller.VSelectGroupB;
        const SGC=(SGV: any[]|undefined,title: string) => {
            const count_max=SGV?.length??0;
            const count_selected=SGV?.filter((v) => v.is_selected).length??0;
            return <Card sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column"
            }}>
                <CardHeader
                    sx={{ px: 2,py: 1 }}
                    avatar={
                        <Checkbox checked={count_max===count_selected&&count_max!==0} />
                    }
                    title={title}
                    subheader={`${count_selected}/${count_max} selected`}
                    disabled={count_max===0}
                    onClick={() => SGV?.forEach((v) => this.controller.onBtnSelectItemClicked(v,count_max!==count_selected))}
                />
                <Divider />
                <List
                    sx={{
                        width: "100%",
                        bgcolor: 'background.paper',
                        overflow: 'auto',
                        minHeight: "16rem",
                        flexGrow: 1,
                        height: 0 // idk why, but it works :v
                    }}
                    dense
                    component="div"
                    role="list"
                >
                    {SGI(SGV)}
                </List>
            </Card>
        }
        const SGI=(SGV: any[]|undefined) => {
            return SGV?.map((value) => {
                const labelId=value.key??value;
                const count_subs=value.subs?.length??0;

                return (<Stack direction={"column"} key={labelId}>
                    <Stack direction={"row"}>
                        <ListItemButton
                            onClick={() => this.controller.onBtnSelectItemClicked(value)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                this.controller.onSelectItemContextMenu(value);
                            }}
                        >
                            <ListItemIcon>
                                <Checkbox
                                    checked={value.is_selected}
                                    tabIndex={-1}
                                    disableRipple
                                />
                            </ListItemIcon>
                            <ListItemText id={labelId} primary={labelId} secondary={count_subs>0&&`${count_subs} subs`} />
                        </ListItemButton>
                        {false&&count_subs>0&&<>
                            <Button variant="outlined" onClick={() => this.controller.onBtnSelectItemSubClicked(value)}>+</Button>
                        </>}
                    </Stack>
                    {false&&count_subs>0&&<Collapse in={value.is_sub_selected} timeout="auto" unmountOnExit sx={{ width: "100%",pl: 2 }}>
                        {SGI(value.subs)}
                    </Collapse>}
                </Stack>
                );
            })
        }
        return <Grid container spacing={1} columns={2} flexGrow={1}>
            <Grid size={1}>{SGC(SGA,"Lazer")}</Grid>
            <Grid size={1}>{SGC(SGB,"Osu!Stable")}</Grid>
        </Grid>
    }

    renderCachedVals() {
        const cv=this.controller.SCachedVals;
        const renderObj=(v: any,p?: string) => p?.startsWith("#")? undefined:typeof v==="object"? Object.keys(v).map((key) => `${p? `${p}_`:""}${key}: ${v[key]}`).join(" / "):`${p}: ${v}`;
        return <>
            {cv&&(<Typography variant="subtitle1" component="div" sx={{ textAlign: "right" }}>{cv.map((v) => renderObj(v.val,v.key)).filter((v) => v!==undefined).join(" / ")}</Typography>)}
        </>
    }

    renderList() {
        const c_view=this.controller.SCachedVals.find((v) => v.key==="#srs_view")?.val??1;
        let rows: any=[];
        let l=this.controller.VList;
        let heads: IPropertyWithName[]=[{ name: "#",type: "picture",key: "img" },{ name: "checksum",type: "string" }];
        if(c_view===1) {
            rows=l?.map((v,index) => ({
                id: index,
                checksum: v.label,
            }))??[];
        } else if(c_view===2) {
            rows=this.controller.CSrsFilteredResults.map((v: any) => {
                return {
                    id: v.beatmapset.id,
                    img: v.beatmapset.covers["card@2x"],
                    name: v.beatmapset.title,
                    play_count: v.count,
                    preview_url: v.beatmapset.preview_url,
                    "#link": `https://osu.ppy.sh/b/${v.beatmap_id}`,
                    "#shell_link": `osu://b/${v.beatmap_id}`,
                    is_selected: v.is_selected
                };
            });
            const asc=rows.length>0&&
                rows.every((v: any) => v.is_selected.value);

            heads=[{
                name: "",type: "checkbox",key: "is_selected",checkbox_toggler: {
                    checked: asc,
                    callback: this.controller.OnFilteredSelectChangeAll
                }
            },{ name: "#",type: "picture",key: "img" },{
                name: "name",type: "string",link: "link",shell_link: "shell_link"
            },{ name: "play_count",type: "string" },{ name: "preview_url",type: "audio" }];
        }

        return <DataViewer heads={heads} rows={rows} rows_total={rows.length} min_height={"400px"} />
    }

    renderCollection() {
        return <>
            <OsuPathSettings
                showStable={true}
                showLazer={true}
            />
            {this.controller.SMain===MainViewState.COLLECTION_IDLE&&<Button variant="contained" onClick={this.controller.onBtnCollectionReadClicked}>
                {__(I18nStrings.BTN_COLLECTION_READ)}
            </Button>}
            {[MainViewState.COLLECTION_SELECT,MainViewState.COLLECTION_MERGE_CONFIRM].includes(this.controller.SMain)? <>{this.renderSelectGroups()}<Button variant="contained" onClick={this.controller.onBtnCollectionMergeClicked}>
                {__(I18nStrings.BTN_COLLECTION_MERGE)}
            </Button></>:null}
        </>
    }

    renderSongRecovery() {
        const c_view=this.controller.SCachedVals.find((v) => v.key==="#srs_view")?.val??1;
        return <>
            <Stack direction={"row"} spacing={1}>
                <OsuPathSettings
                    showLazer={false}
                    showStable={true}
                />
                <Button variant="contained" color="success" onClick={() => this.controller.onBtnSRSReadClicked()} disabled={this.controller.StablePath.length===0}>
                    {__(I18nStrings.BTN_SRS_READ)}
                </Button>
            </Stack>
            <Stack direction={"row"} spacing={1}>
                <ApiSettings />
                <Button variant="contained" color="success" onClick={this.controller.onBtnSRSReadByOnlineClicked} disabled={this.controller.CClientId.length===0||this.controller.CClientSecret.length===0}>
                    {__(I18nStrings.BTN_SRS_READ_BY_ONLINE)}
                </Button>
            </Stack>
            <Box sx={{ display: "flex",gap: 1,justifyContent: "space-between" }}>
                <ToggleButtonGroup color="info"
                    value={c_view}
                    exclusive
                    onChange={(_,v) => this.controller.SetCacheVal("#srs_view",v)}
                >
                    <ToggleButton value={1}>
                        本地
                    </ToggleButton>
                    <ToggleButton value={2}>
                        線上
                    </ToggleButton>
                </ToggleButtonGroup>
                <ButtonGroup color="info">
                    <Button variant="outlined" startIcon={<Search />} onClick={() => this.controller.toggleFilter(true)}>
                        {__(I18nStrings.BTN_SRS_SEARCH)}
                    </Button>
                </ButtonGroup>
            </Box>
            {this.renderCachedVals()}
            {this.renderList()}
            {this.controller.SMain===MainViewState.SRS_RESULTS&&<Button variant="contained" onClick={() => this.controller.OnBtnSRSDownloadClicked()}>
                {__(I18nStrings.BTN_SRS_DOWNLOAD)}
            </Button>}
        </>
    }

    renderSyncState(state: NewSyncState) {
        return <Grid container spacing={1}>
            <Grid size={3}>最後同步時間</Grid>
            <Grid size={9}>{state.last_updated? formatTimeAgo(state.last_updated):"-"}</Grid>
            <Grid size={3}>最後同步預計數量</Grid>
            <Grid size={9}>{state.last_count??0}</Grid>
            <Grid size={3}>最後同步預計位置</Grid>
            <Grid size={9}>{state.last_offset??0}</Grid>
            <Grid size={12}><Divider /></Grid>
            <Grid size={3}>當前同步目標數量</Grid>
            <Grid size={9}>{state.new_count??0}</Grid>
        </Grid>;
    }

    renderFilter() {
        return <Container maxWidth="lg" sx={{ p: 1 }}>
            <Stack spacing={2}>
                <TextField label="Title" variant="outlined" value={this.controller.SFilterSettings?.[FilterType.Title]??""} onChange={(e) => this.controller.OnFilterSettingChanged(FilterType.Title,e.target.value)} />
                <FormControl fullWidth>
                    <InputLabel id="rank-state">Rank State</InputLabel>
                    <Select label="Rank State" labelId="rank-state" value={this.controller.SFilterSettings?.[FilterType.RankState]??["all"]} onChange={(e) => this.controller.OnFilterSettingChanged(FilterType.RankState,e.target.value)} multiple>
                        <MenuItem value={"all"}>All</MenuItem>
                        <MenuItem value={RankedStatus.Graveyard}>Graveyard</MenuItem>
                        <MenuItem value={RankedStatus.WIP}>WIP</MenuItem>
                        <MenuItem value={RankedStatus.Pending}>Pending</MenuItem>
                        <MenuItem value={RankedStatus.Ranked}>Ranked</MenuItem>
                        <MenuItem value={RankedStatus.Approved}>Approved</MenuItem>
                        <MenuItem value={RankedStatus.Qualified}>Qualified</MenuItem>
                        <MenuItem value={RankedStatus.Loved}>Loved</MenuItem>
                    </Select>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel htmlFor="play-count">Play Count</InputLabel>
                    <NumberField.Root
                        value={this.controller.SFilterSettings?.[FilterType.PlayCount]??0}
                        onValueChange={(value) => this.controller.OnFilterSettingChanged(FilterType.PlayCount,value)}
                        min={0}
                        step={1}
                    >
                        <NumberField.Group>
                            <NumberField.Input
                                id="play-count"
                                render={(props,state) => (
                                    <Observer>
                                        {() => (
                                            <OutlinedInput
                                                label={"play count"}
                                                inputRef={props.ref}
                                                value={state.inputValue}
                                                onBlur={props.onBlur}
                                                onChange={props.onChange}
                                                onKeyUp={props.onKeyUp}
                                                onKeyDown={props.onKeyDown}
                                                onFocus={props.onFocus}
                                                slotProps={{
                                                    input: props,
                                                }}
                                                startAdornment={<InputAdornment position="start"
                                                    sx={{
                                                        borderRight: '1px solid',
                                                        borderColor: 'divider',
                                                        maxHeight: 'unset',
                                                        alignSelf: 'stretch',
                                                    }}>
                                                    <Select
                                                        value={this.controller.SrsFilterPlayCountFS}
                                                        onChange={(e) => this.controller.OnFilterSettingChanged(
                                                            FilterType.PlayCountFS,
                                                            e.target.value
                                                        )}
                                                        variant="standard"
                                                        disableUnderline
                                                        sx={{
                                                            minWidth: '50px',
                                                            '& .MuiSelect-select': {
                                                                py: 0,
                                                                pr: '24px !important',
                                                            }
                                                        }}
                                                    >
                                                        <MenuItem value={PlayCountFS.Greater}>≥</MenuItem>
                                                        <MenuItem value={PlayCountFS.Equal}>=</MenuItem>
                                                        <MenuItem value={PlayCountFS.Less}>≤</MenuItem>
                                                    </Select>
                                                </InputAdornment>}
                                                endAdornment={
                                                    <InputAdornment
                                                        position="end"
                                                        sx={{
                                                            flexDirection: 'column',
                                                            maxHeight: 'unset',
                                                            alignSelf: 'stretch',
                                                            borderLeft: '1px solid',
                                                            borderColor: 'divider',
                                                            ml: 0,
                                                            '& button': {
                                                                py: 0,
                                                                flex: 1,
                                                                borderRadius: 0.5,
                                                            },
                                                        }}
                                                    >
                                                        <NumberField.Increment
                                                            render={<IconButton aria-label="Increase" />}
                                                        >
                                                            <KeyboardArrowUp
                                                                sx={{ transform: 'translateY(2px)' }}
                                                            />
                                                        </NumberField.Increment>

                                                        <NumberField.Decrement
                                                            render={<IconButton aria-label="Decrease" />}
                                                        >
                                                            <KeyboardArrowDown
                                                                sx={{ transform: 'translateY(-2px)' }}
                                                            />
                                                        </NumberField.Decrement>
                                                    </InputAdornment>
                                                }
                                                sx={{ pr: 0 }}
                                            />
                                        )}
                                    </Observer>
                                )}
                            />
                        </NumberField.Group>
                    </NumberField.Root>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel id="filter-lang">Lang</InputLabel>
                    <Select label="Lang" labelId="filter-lang" value={this.controller.SFilterSettings?.[FilterType.Language]??["all"]} onChange={(e) => this.controller.OnFilterSettingChanged(FilterType.Language,e.target.value)} multiple>
                        <MenuItem value={"all"}>All</MenuItem>
                        {Object.entries(this.controller.OnlineBeatmapLangs).map(([_,lab]) => <MenuItem value={lab.key}>{lab.label}</MenuItem>)}
                    </Select>
                </FormControl>
                <Slider
                    defaultValue={[0,15]}
                    valueLabelDisplay="auto"
                    shiftStep={0.01}
                    step={0.1}
                    marks
                    min={0}
                    max={15}
                    value={this.controller.CFilterSettings?.[FilterType.StarRating]??[0,15]}
                    onChange={(_,v) => this.controller.OnPreFilterSettingChanged(FilterType.StarRating,v)}
                    onChangeCommitted={(_,v) => this.controller.OnFilterSettingChanged(FilterType.StarRating,v)}
                />
            </Stack>
        </Container>
    }

    renderMapPacks() {
        return (
            <BeatmapPackDownloadView />
        );
    }
}

