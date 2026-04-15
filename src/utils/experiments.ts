import g from "../renderer/state";
import { ConfigKey } from "./typed/config";

export const B__YinMoChance = Boolean(g.config?.[ConfigKey.EXPERIMENT_YINMO_CHANCE]) || true;
