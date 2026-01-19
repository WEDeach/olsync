import { pathJoin,pData,readJson,saveJson } from "./file"

const p_config=pathJoin(pData,'config.json')
const base_config={
    "path": null
}

const GetLocalConfig=async () => {
    const localConfig=await readJson(p_config)
    if(!localConfig) return base_config;
    return localConfig;
}

const SaveLocalConfig=async (config: object) => {
    await saveJson(p_config,config)
}

export { GetLocalConfig,SaveLocalConfig }