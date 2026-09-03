import {
    CloudDownloadOutlined,
    HistoryOutlined,
    HomeOutlined,
    Inventory2Outlined,
    LibraryMusicOutlined,
    ManageSearchOutlined,
    QueryStatsOutlined,
    ShuffleOutlined,
} from "@mui/icons-material";
import {
    Alert,
    Avatar,
    Backdrop,
    Box,
    Button,
    Card,
    CardHeader,
    Checkbox,
    Collapse,
    Container,
    CssBaseline,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Fade,
    Grid,
    InputAdornment,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Slide,
    Stack,
    TextField,
    ThemeProvider,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import { observer } from "mobx-react";
import React from "react";
import { GetDLOptionByBuiltin } from "../../utils/download";
import __ from "../../utils/i18n";
import { formatDateTime, formatTimeAgo } from "../../utils/time";
import { I18nStrings } from "../../utils/typed/i18n";
import { BeatmapList } from "../components/beatmapList";
import { BeatmapPackDownloadView } from "../components/beatmapPackDownload";
import { BeatmapPickerView } from "../components/beatmapPicker";
import { BeatmapRestorerView } from "../components/beatmapRestorer";
import CompareList from "../components/compareList";
import { DownloadHistoryView } from "../components/downloadHistory";
import { DownloadIndicator } from "../components/downloadIndicator";
import LoadingOverlay from "../components/loadingOverlay";
import { NavRail, NavRailItem } from "../components/navRail";
import { OnboardingDialog } from "../components/onboardingDialog";
import { SettingsDrawer } from "../components/settingsDrawer";
import { TrackerView } from "../components/tracker";
import g, { IGlobalNotify, NewSyncState } from "../state";
import theme from "../theme";
import Controller, { MainViewState, SubViewType } from "./controller";

const NotifyItem: React.FC<{
    notify: IGlobalNotify;
    onClose: () => void;
}> = ({ notify, onClose }) => {
    const [visible, setVisible] = React.useState(true);

    React.useEffect(() => {
        const duration = notify.autoHideDuration ?? 5000;
        const timer = setTimeout(() => setVisible(false), duration);
        return () => clearTimeout(timer);
    }, [notify.autoHideDuration]);

    return (
        <Slide direction="right" in={visible} timeout={300} onExited={onClose}>
            <Alert
                severity={notify.severity ?? "info"}
                variant="filled"
                onClose={() => setVisible(false)}
                action={notify.action}
                sx={{ boxShadow: 3, alignItems: "center" }}
            >
                {notify.message}
            </Alert>
        </Slide>
    );
};

@observer
export default class Main extends React.Component {
    private controller: Controller;

    constructor(props: any) {
        super(props);

        this.controller = new Controller();
    }

    private deepLinkUnsub?: () => void;

    componentDidMount() {
        this.deepLinkUnsub = window.olsCore.onDeepLink((beatmapsetId: number) => {
            g.setDialog(true, {
                title: __(I18nStrings.MAIN_DL_DEEP_LINK_CONFIRM_TITLE),
                content: __(I18nStrings.MAIN_DL_DEEP_LINK_CONFIRM_BODY, { id: String(beatmapsetId) }),
                actions: [
                    {
                        label: __(I18nStrings.BTN_CONFIRM),
                        callback: () => {
                            g.setDialog(false);
                            this.controller.SetSubView(SubViewType.DOWNLOAD_HISTORY);
                            const opt = GetDLOptionByBuiltin([{ source: "osu-official", beatmapsetId }]);
                            opt.callback();
                        },
                    },
                    {
                        label: __(I18nStrings.BTN_CANCEL),
                        callback: () => g.setDialog(false),
                    },
                ],
            });
        });
    }

    componentWillUnmount() {
        this.deepLinkUnsub?.();
    }

    private getNavItems(): NavRailItem[] {
        return [
            { view: SubViewType.NONE, icon: <HomeOutlined />, label: __(I18nStrings.BTN_TAB_NONE) },
            { view: SubViewType.COLLECTION, icon: <LibraryMusicOutlined />, label: __(I18nStrings.BTN_TAB_COLLECTION) },
            {
                view: SubViewType.SONG_RECOVERY_BY_SCORES,
                icon: <ManageSearchOutlined />,
                label: __(I18nStrings.BTN_TAB_SRS),
            },
            { view: SubViewType.MAP_PACKS, icon: <Inventory2Outlined />, label: __(I18nStrings.BTN_TAB_PACKS) },
            { view: SubViewType.MAP_PICKER, icon: <ShuffleOutlined />, label: __(I18nStrings.BTN_TAB_PICKER) },
            { view: SubViewType.TRACKER, icon: <QueryStatsOutlined />, label: __(I18nStrings.BTN_TAB_TRACKER) },
            {
                view: SubViewType.DOWNLOAD_HISTORY,
                icon: <CloudDownloadOutlined />,
                label: __(I18nStrings.BTN_TAB_DOWNLOAD),
            },
        ];
    }

    render() {
        const SubView = this.controller.SubView;
        const SSubView = this.controller.SSubView;
        const SDialog = this.controller.SDialog;
        const SShowUserDialog = this.controller.SShowUserDialog;
        void g.i18nVersion;
        return (
            // Setup theme and css baseline for the Material-UI app
            // https://mui.com/customization/theming/and
            <ThemeProvider theme={theme} defaultMode="system" modeStorageKey="olsync-theme-mode">
                <CssBaseline />
                {/* maxWidth 原始為 lg, 改為 false 以禁用最大寬度限制, 日後可選擇添加選項來支持自定義 */}
                <Container maxWidth={false} disableGutters sx={{ height: "100%", minWidth: "64rem", p: 0 }}>
                    <Box sx={{ display: "flex", height: "100%", overflow: "hidden" }}>
                        <NavRail
                            items={this.getNavItems()}
                            selected={SSubView}
                            onSelect={(v) => this.controller.SwitchView(v)}
                            footer={<SettingsDrawer />}
                        />
                        <Stack sx={{ flex: 1, minWidth: 0, p: 2, pr: 0, pb: 0 }} spacing={2}>
                            {this.controller.IsDev && (
                                <ToggleButtonGroup
                                    color="error"
                                    value={this.controller.SSubView}
                                    exclusive
                                    onChange={this.controller.onBtnDebugClicked}
                                >
                                    <ToggleButton value={SubViewType.D_LAZER}>Lazer_Debug</ToggleButton>
                                    <ToggleButton value={SubViewType.D_STABLE}>Osu_Debug</ToggleButton>
                                    <ToggleButton value={SubViewType.D_API}>API_Debug</ToggleButton>
                                    <ToggleButton value={SubViewType.D_DLX}>DL_TEST</ToggleButton>
                                    <ToggleButton value={SubViewType.NONE}>NONE</ToggleButton>
                                </ToggleButtonGroup>
                            )}
                            <Fade in key={SSubView} timeout={150}>
                                <Stack
                                    sx={{
                                        flex: 1,
                                        minHeight: 0,
                                        overflowY: "auto",
                                        overflowX: "hidden",
                                        p: 2,
                                    }}
                                    spacing={2}
                                >
                                    {SubView !== undefined && <SubView />}
                                    {SSubView === SubViewType.NONE && this.renderDynSection()}
                                    {SSubView === SubViewType.COLLECTION && this.renderCollection()}
                                    {SSubView === SubViewType.SONG_RECOVERY_BY_SCORES && this.renderSongRecovery()}
                                    {SSubView === SubViewType.MAP_PACKS && this.renderMapPacks()}
                                    {SSubView === SubViewType.MAP_PICKER && this.renderMapPicker()}
                                    {SSubView === SubViewType.TRACKER && this.renderTracker()}
                                    {SSubView === SubViewType.DOWNLOAD_HISTORY && this.renderDownloadHistory()}
                                </Stack>
                            </Fade>
                        </Stack>
                    </Box>
                    {g.onboarding?.open && (
                        <OnboardingDialog
                            open={g.onboarding.open}
                            topic={g.onboarding.topic ?? ""}
                            onClose={() => g.setOnboarding(false)}
                        />
                    )}
                    {SDialog.show && (
                        <Dialog
                            sx={(theme) => ({ zIndex: theme.zIndex.drawer + 1 })}
                            open={SDialog.show}
                            onClose={() => this.controller.SetDialogState(false)}
                            maxWidth="lg"
                            fullWidth
                        >
                            <DialogTitle>{SDialog.title}</DialogTitle>
                            <DialogContent>
                                {SDialog.content !== undefined && this.renderDialogContent(SDialog.content)}
                                {SDialog.beatmaps && <BeatmapList {...SDialog.beatmaps} />}
                                {SDialog.compares && <CompareList {...SDialog.compares} />}
                                {SDialog.syncState && this.renderSyncState(SDialog.syncState)}
                            </DialogContent>
                            <DialogActions>
                                {SDialog.actions?.map((a) => (
                                    <Button onClick={a.callback} key={a.label} variant="contained">
                                        {a.label}
                                    </Button>
                                ))}
                            </DialogActions>
                        </Dialog>
                    )}
                    {SShowUserDialog && this.renderUserDialog()}
                    {g.duplicateConfirm.show && (
                        <Dialog
                            open={g.duplicateConfirm.show}
                            onClose={() => g.closeDuplicateConfirm(false)}
                            maxWidth="sm"
                            fullWidth
                        >
                            <DialogTitle>{__(I18nStrings.MAIN_DL_DUPLICATE_TITLE)}</DialogTitle>
                            <DialogContent>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: "text.secondary",
                                        mb: 2,
                                    }}
                                >
                                    {__(I18nStrings.MAIN_DL_DUPLICATE_DESC, { count: g.duplicateConfirm.items.length })}
                                </Typography>
                                <List dense>
                                    {g.duplicateConfirm.items.map((item) => (
                                        <ListItemText
                                            key={item.task?.id ?? item.filename}
                                            primary={`- ${item.filename}`}
                                        />
                                    ))}
                                </List>
                            </DialogContent>
                            <DialogActions>
                                <Button onClick={() => g.closeDuplicateConfirm(false)} color="inherit">
                                    {__(I18nStrings.BTN_SKIP)}
                                </Button>
                                <Button
                                    onClick={() => g.closeDuplicateConfirm(true)}
                                    color="primary"
                                    variant="contained"
                                >
                                    {__(I18nStrings.BTN_REDOWNLOAD)}
                                </Button>
                            </DialogActions>
                        </Dialog>
                    )}
                    <LoadingOverlay
                        open={this.controller.SLoading.loading}
                        message={this.controller.SLoading.message}
                        aborter={this.controller.SLoading.aborter}
                        onAbort={() => {
                            this.controller.SLoading.aborter?.abort();
                            g.setLoading(false);
                        }}
                    />
                    <Backdrop
                        sx={(theme) => ({ color: "#fff", zIndex: theme.zIndex.drawer + 3 })}
                        open={g.hasError()}
                        onClick={() => g.clearError()}
                    >
                        <Alert variant="filled" severity="error" onClick={(e) => e.stopPropagation()}>
                            {g.error?.message}
                        </Alert>
                    </Backdrop>
                    <Stack
                        spacing={1}
                        sx={{
                            position: "fixed",
                            bottom: 24,
                            left: 24,
                            zIndex: (theme) => theme.zIndex.snackbar,
                            maxWidth: 400,
                        }}
                    >
                        {g.notifies.map((n) => (
                            <NotifyItem key={n.id} notify={n} onClose={() => g.clearNotify(n.id)} />
                        ))}
                    </Stack>
                </Container>
                <DownloadIndicator
                    visible={this.controller.SSubView !== SubViewType.DOWNLOAD_HISTORY}
                    onOpenHistory={() => this.controller.SetSubView(SubViewType.DOWNLOAD_HISTORY)}
                />
            </ThemeProvider>
        );
    }

    renderDialogContent(content: React.ReactNode | (() => React.ReactNode)): React.ReactNode {
        if (content === undefined || content === null) return null;
        if (typeof content === "function") return this.renderDialogContent(content());
        if (typeof content === "string")
            return (
                <Typography component="div" sx={{ whiteSpace: "pre-line" }}>
                    {content}
                </Typography>
            );
        return content;
    }

    renderUserDialog() {
        const SyncPlayer =
            this.controller.SCachedVals.find((v) => v.key === "#sync_player")?.val.id.toString() ===
            this.controller.CSyncTargetId
                ? this.controller.SCachedVals.find((v) => v.key === "#sync_player")
                : undefined;

        return (
            <Dialog
                sx={(theme) => ({ zIndex: theme.zIndex.drawer + 1 })}
                open={this.controller.SShowUserDialog}
                onClose={() => this.controller.SetShowUserDialogState(false)}
                maxWidth="lg"
                fullWidth
            >
                <DialogContent>
                    <Stack
                        spacing={2}
                        useFlexGap
                        sx={{
                            alignItems: "center",
                        }}
                    >
                        <Typography variant="h4">
                            {SyncPlayer === undefined
                                ? __(I18nStrings.MAIN_SRS_PLAYER_WHO)
                                : __(I18nStrings.MAIN_SRS_PLAYER_YOU)}
                        </Typography>
                        <Avatar
                            sx={{ width: "25%", height: "25%" }}
                            src={SyncPlayer?.val.pic ?? "https://osu.ppy.sh/images/layout/avatar-guest@2x.png"}
                        />
                        <Typography variant="subtitle1">{SyncPlayer?.val.name}</Typography>
                        <TextField
                            fullWidth
                            size="small"
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start">https://osu.ppy.sh/users/</InputAdornment>
                                    ),
                                },
                            }}
                            value={this.controller.CSyncTargetId}
                            onChange={(e) => this.controller.OnSyncPlayerIdChanged(e.target.value)}
                        />
                        <Collapse in={this.controller.CSyncTargetId.length > 0} timeout={300} sx={{ width: "100%" }}>
                            <Box sx={{ display: "flex", gap: 1, width: "100%", overflowX: "hidden" }}>
                                <Box
                                    sx={{
                                        width: SyncPlayer !== undefined ? "50%" : "100%",
                                        transition: "width 300ms ease-in-out",
                                        flexShrink: 0,
                                    }}
                                >
                                    <Button
                                        variant="contained"
                                        onClick={() => this.controller.onBtnCheckUserIdClicked()}
                                        loading={this.controller.SLoading.loading}
                                        color={SyncPlayer === undefined ? "primary" : "error"}
                                        fullWidth
                                    >
                                        {__(I18nStrings.BTN_SRS_PLAYER_CHECK)}
                                    </Button>
                                </Box>
                                <Slide
                                    direction="left"
                                    in={SyncPlayer !== undefined}
                                    timeout={300}
                                    mountOnEnter
                                    unmountOnExit
                                >
                                    <Box sx={{ width: "50%", flexShrink: 0, pr: 1 }}>
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
        );
    }

    renderDynSection() {
        return (
            <>
                <Typography variant="h3">OLSync</Typography>
                <Divider />
                <Stack direction={"row"} spacing={1}>
                    <Typography variant="h4">{__(I18nStrings.MAIN_UPDATE_VERSION_CURRENT, { version: "" })}</Typography>
                    <Typography variant="h4" color="primary">
                        {this.controller.Version}
                    </Typography>
                </Stack>
                <Button
                    sx={{ width: "fit-content" }}
                    variant="contained"
                    onClick={() => this.controller.checkUpdate(true)}
                    startIcon={<HistoryOutlined />}
                >
                    {__(I18nStrings.BTN_UPDATE_CHECK)}
                </Button>
            </>
        );
    }

    renderSelectGroups() {
        const SGA = this.controller.VSelectGroupA;
        const SGB = this.controller.VSelectGroupB;
        const SGC = (SGV: any[] | undefined, title: string) => {
            const count_max = SGV?.length ?? 0;
            const count_selected = SGV?.filter((v) => v.is_selected).length ?? 0;
            return (
                <Card
                    sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <CardHeader
                        sx={{ px: 2, py: 1 }}
                        avatar={<Checkbox checked={count_max === count_selected && count_max !== 0} />}
                        title={title}
                        subheader={__(I18nStrings.MAIN_COLLECTION_SELECTED_COUNT, {
                            selected: count_selected,
                            total: count_max,
                        })}
                        disabled={count_max === 0}
                        onClick={() =>
                            SGV?.forEach((v) => {
                                this.controller.onBtnSelectItemClicked(v, count_max !== count_selected);
                            })
                        }
                    />
                    <Divider />
                    <List
                        sx={{
                            width: "100%",
                            bgcolor: "background.paper",
                            overflow: "auto",
                            minHeight: "16rem",
                            flexGrow: 1,
                            height: 0, // idk why, but it works :v
                        }}
                        dense
                        component="div"
                        role="list"
                    >
                        {SGI(SGV)}
                    </List>
                </Card>
            );
        };
        const SGI = (SGV: any[] | undefined) => {
            return SGV?.map((value) => {
                const labelId = value.key ?? value;
                const count_subs = value.subs?.length ?? 0;

                return (
                    <Stack direction={"column"} key={labelId}>
                        <Stack direction={"row"}>
                            <ListItemButton
                                onClick={() => this.controller.onBtnSelectItemClicked(value)}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    this.controller.onSelectItemContextMenu(value);
                                }}
                            >
                                <ListItemIcon>
                                    <Checkbox checked={value.is_selected} tabIndex={-1} disableRipple />
                                </ListItemIcon>
                                <ListItemText
                                    id={labelId}
                                    primary={labelId}
                                    secondary={
                                        count_subs > 0 &&
                                        __(I18nStrings.MAIN_COLLECTION_SUBS_COUNT, { count: count_subs })
                                    }
                                />
                            </ListItemButton>
                            {false && count_subs > 0 && (
                                <Button
                                    variant="outlined"
                                    onClick={() => this.controller.onBtnSelectItemSubClicked(value)}
                                >
                                    +
                                </Button>
                            )}
                        </Stack>
                        {false && count_subs > 0 && (
                            <Collapse
                                in={value.is_sub_selected}
                                timeout="auto"
                                unmountOnExit
                                sx={{ width: "100%", pl: 2 }}
                            >
                                {SGI(value.subs)}
                            </Collapse>
                        )}
                    </Stack>
                );
            });
        };
        return (
            <Grid
                container
                spacing={1}
                columns={2}
                sx={{
                    flexGrow: 1,
                }}
            >
                <Grid size={1}>{SGC(SGA, "Lazer")}</Grid>
                <Grid size={1}>{SGC(SGB, "Osu!Stable")}</Grid>
            </Grid>
        );
    }

    renderCachedVals() {
        const cv = this.controller.SCachedVals;
        const renderObj = (v: any, p?: string) =>
            p?.startsWith("#")
                ? undefined
                : typeof v === "object"
                  ? Object.keys(v)
                        .map((key) => `${p ? `${p}_` : ""}${key}: ${v[key]}`)
                        .join(" / ")
                  : `${p}: ${v}`;
        return (
            <>
                {cv && (
                    <Typography variant="subtitle1" component="div" sx={{ textAlign: "right" }}>
                        {cv
                            .map((v) => renderObj(v.val, v.key))
                            .filter((v) => v !== undefined)
                            .join(" / ")}
                    </Typography>
                )}
            </>
        );
    }

    renderCollection() {
        return (
            <>
                {this.controller.SMain === MainViewState.COLLECTION_IDLE && (
                    <Tooltip
                        title={
                            !this.controller.LazerPath && !this.controller.StablePath
                                ? __(I18nStrings.BTN_PATH_REQUIRED_TOOLTIP)
                                : ""
                        }
                        arrow
                        placement="top"
                    >
                        <span>
                            <Button
                                variant="contained"
                                onClick={this.controller.onBtnCollectionReadClicked}
                                fullWidth
                                disabled={!this.controller.LazerPath && !this.controller.StablePath}
                            >
                                {__(I18nStrings.BTN_COLLECTION_READ)}
                            </Button>
                        </span>
                    </Tooltip>
                )}
                {[MainViewState.COLLECTION_SELECT, MainViewState.COLLECTION_MERGE_CONFIRM].includes(
                    this.controller.SMain,
                ) ? (
                    <>
                        {this.renderSelectGroups()}
                        <Button variant="contained" onClick={this.controller.onBtnCollectionMergeClicked}>
                            {__(I18nStrings.BTN_COLLECTION_MERGE)}
                        </Button>
                    </>
                ) : null}
            </>
        );
    }

    renderSongRecovery() {
        return (
            <BeatmapRestorerView
                local_beatmaps={this.controller.LocalMaps}
                online_beatmaps={this.controller.OnlineMaps}
                local_scores={this.controller.LocalScores}
                onBtnSRSReadByOnlineClicked={this.controller.onBtnSRSReadByOnlineClicked}
                onBtnSRSReadClicked={this.controller.onBtnSRSReadClicked}
            />
        );
    }

    renderSyncState(state: NewSyncState) {
        return (
            <Grid container spacing={1}>
                <Grid size={3}>{__(I18nStrings.MAIN_SYNC_LAST_TIME)}</Grid>
                <Grid size={9}>
                    {state.last_updated ? (
                        <Tooltip title={formatDateTime(state.last_updated)} arrow>
                            <span>{formatTimeAgo(state.last_updated)}</span>
                        </Tooltip>
                    ) : (
                        "-"
                    )}
                </Grid>
                <Grid size={3}>{__(I18nStrings.MAIN_SYNC_LAST_COUNT)}</Grid>
                <Grid size={9}>{state.last_count ?? 0}</Grid>
                <Grid size={3}>{__(I18nStrings.MAIN_SYNC_LAST_OFFSET)}</Grid>
                <Grid size={9}>{state.last_offset ?? 0}</Grid>
                <Grid size={12}>
                    <Divider />
                </Grid>
                <Grid size={3}>{__(I18nStrings.MAIN_SYNC_TARGET_COUNT)}</Grid>
                <Grid size={9}>{state.new_count ?? 0}</Grid>
            </Grid>
        );
    }

    renderMapPacks() {
        return <BeatmapPackDownloadView />;
    }

    renderMapPicker() {
        return <BeatmapPickerView />;
    }

    renderTracker() {
        return <TrackerView />;
    }

    renderDownloadHistory() {
        return <DownloadHistoryView />;
    }
}
