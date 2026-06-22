import g from "../renderer/state";
import { ConfigKey } from "./typed/config";

export const getClientId = (): string => g.cacheVal.str_client_id ?? "";
export const getClientSecret = (): string => g.cacheVal.str_client_secret ?? "";
export const getStablePath = (): string => g.config?.[ConfigKey.PATH_STABLE_DIR] ?? "";
export const getLazerPath = (): string => g.config?.[ConfigKey.PATH_LAZER_REALM] ?? "";
