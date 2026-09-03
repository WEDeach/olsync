import g from "../renderer/state";
import { ConfigKey } from "./typed/config";

export const getYinMoChanceExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_YINMO_CHANCE]);
export const getDbMd5CheckExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_DB_MD5_CHECK]);
export const getPackRulesetByNmExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_PACK_RULESET_BY_NM]);
export const getUseApiMapAttrExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_USE_API_MAP_ATTR]);
export const getIncludeOnlineDbExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_INCLUDE_ONLINE_DB]);
export const getUseLazerModeExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_USE_LAZER_MODE]);
export const getClassicScoreExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_CLASSIC_SCORE]);
