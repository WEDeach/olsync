import Api from "./singletons/api";
import Config from "./singletons/config";
import DownloadManager from "./singletons/downloadManager";
import LazerReader from "./singletons/lazerReader";
import NativeHost from "./singletons/nativeHost";
import OnlineDbReader from "./singletons/onlineDbReader";
import StableReader from "./singletons/stable";
import StableIpcClient from "./singletons/stableIpc";
import StableIpcMonitor from "./singletons/stableIpcMonitor";
import StableScoreRecorder from "./singletons/stableScoreRecorder";
import Tracker from "./singletons/tracker";

const SharedManager = {
    lazerReader: LazerReader.getInstance as LazerReader,
    stableReader: StableReader.getInstance as StableReader,
    stableIpc: StableIpcClient.getInstance as StableIpcClient,
    stableIpcMonitor: StableIpcMonitor.getInstance as StableIpcMonitor,
    stableScoreRecorder: StableScoreRecorder.getInstance as StableScoreRecorder,
    config: Config.getInstance as Config,
    api: Api.getInstance as Api,
    nativeHost: NativeHost.getInstance as NativeHost,
    tracker: Tracker.getInstance as Tracker,
    downloadManager: DownloadManager.getInstance as DownloadManager,
    onlineDbReader: OnlineDbReader.getInstance as OnlineDbReader,
} as const;

export default SharedManager;
