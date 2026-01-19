
import SingletonBase from './base';
import { ServiceCode,SpaceId } from '../../utils/typed/file';
import { SyncState } from '../../utils/typed/config';
import { GetLocalConfig,SaveLocalConfig } from '../../utils/config';
import { readJsonV2,saveJsonV2 } from '../../utils/file';

export default class Config extends SingletonBase {
    _config?: { [key: string]: any };
    _syncStates?: SyncState[];


    async init() {
        if(this._config===undefined) {
            this._config=await GetLocalConfig();
        }
    }

    get(k: string) {
        if(this._config===undefined) {
            throw new Error("Config has not been initialized.");
        }
        return this._config[k]
    }

    get_all() {
        if(this._config===undefined) {
            throw new Error("Config has not been initialized.");
        }
        return this._config;
    }

    async save(k: string,v: any) {
        if(this._config===undefined) {
            throw new Error("Config has not been initialized.");
        }
        console.log(`save config for ${k}: ${v}`);
        this._config[k]=v;
        await SaveLocalConfig(this._config);
    }

    async init_sync_state() {
        if(this._syncStates!==undefined) {
            throw new Error("The sync state has already been initialized.");
        }
        this._syncStates=[];
        const ss_data=await readJsonV2<SyncState[]>(ServiceCode.Data,SpaceId.SyncState,"1.json");
        if(ss_data!==null) {
            this._syncStates=ss_data;
        }
    }

    async save_sync_state(player_id: number,last_count: number,last_offset: number,last_updated: number) {
        if(this._syncStates===undefined) {
            await this.init_sync_state();
        }
        const index=this._syncStates!.findIndex(s => s.player_id===player_id);
        const newState: SyncState={
            player_id,
            last_count,
            last_offset,
            last_updated
        };
        if(index!==-1) {
            this._syncStates![index]=newState;
        } else {
            this._syncStates!.push(newState);
        }
        await saveJsonV2(ServiceCode.Data,SpaceId.SyncState,"1.json",this._syncStates!);
    }

    async get_sync_state(player_id: number) {
        if(this._syncStates===undefined) {
            await this.init_sync_state();
        }
        return this._syncStates!.find(s => s.player_id===player_id);
    }
}