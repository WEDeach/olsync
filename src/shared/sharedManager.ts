import StableReader from "./singletons/stable";
import Config from "./singletons/config";
import LazerReader from "./singletons/lazerReader";
import Api from "./singletons/api";
import NativeHost from "./singletons/nativeHost";

export default class SharedManager {
    static lazerReader=LazerReader.getInstance as LazerReader;
    static stableReader=StableReader.getInstance as StableReader;
    static config=Config.getInstance as Config;
    static api=Api.getInstance as Api;
    static nativeHost=NativeHost.getInstance as NativeHost;
}