import g from "../renderer/state";
import { ConfigKey } from "./typed/config";

export const getYinMoChanceExperiment = () => Boolean(g.config?.[ConfigKey.EXPERIMENT_YINMO_CHANCE]) || true;
