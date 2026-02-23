import Api from "./singletons/api";
import Config from "./singletons/config";
import LazerReader from "./singletons/lazerReader";
import NativeHost from "./singletons/nativeHost";
import StableReader from "./singletons/stable";

const SharedManager = {
    lazerReader: LazerReader.getInstance as LazerReader,
    stableReader: StableReader.getInstance as StableReader,
    config: Config.getInstance as Config,
    api: Api.getInstance as Api,
    nativeHost: NativeHost.getInstance as NativeHost,
} as const;

export default SharedManager;
