import g from "../renderer/state";
import { ConfigKey } from "./typed/config";

export const getYinMoChanceExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_YINMO_CHANCE]) ?? true; // 哪個傻B用 || true 的... 哈哈是我啦==
export const getDbMd5CheckExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_DB_MD5_CHECK]);
export const getPackRulesetByNmExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_PACK_RULESET_BY_NM]);
export const getUseApiMapAttrExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_USE_API_MAP_ATTR]);
