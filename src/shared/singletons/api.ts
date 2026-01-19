import SingletonBase from './base';
import ApiClient from '../../api/v2/client';
import { RespBeatmapPack,RespUserMostPlayedBeatmap } from '../../api/v2/types/api_resp';
import { readJsonV2,saveJsonV2 } from '../../utils/file';
import { ServiceCode,SpaceId } from '../../utils/typed/file';
import { PackTypes } from '../../api/v2/routes/beatmaps';

export interface CachedBeatmapPack extends RespBeatmapPack {
    cached?: boolean
}

export default class Api extends SingletonBase {
    _client?: ApiClient;
    cached_beatmaps: Map<number,RespUserMostPlayedBeatmap>=new Map();
    cached_packs: Map<string,RespBeatmapPack>=new Map();



    async init(client_id: string,client_secret: string) {
        const client=new ApiClient(client_id,client_secret);
        await client.init_token();
        this._client=client;
        this.cached_beatmaps.clear();
    }

    async client() {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }
        return this._client
    }

    async get_user_most_played_beatmaps(user_id: number,limit: number=200,offset: number=0) {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }
        if(offset===0) {
            this.cached_beatmaps.clear();
        }
        const maps=await this._client.r_users.get_most_played_beatmaps_by_user_id(user_id,limit,offset);
        maps.forEach(map => {
            this.cached_beatmaps.set(map.beatmap_id,map);
        });
        return maps;
    }

    async save_cached_beatmaps(user_id: number,beatmap_ids: number[]) {
        if(this.cached_beatmaps.size>0) {
            const maps=Array.from(this.cached_beatmaps.values()).filter(map => beatmap_ids.includes(map.beatmap_id));
            await saveJsonV2(ServiceCode.Data,SpaceId.Beatmaps,`1.${user_id}.json`,maps);
        }
    }

    async get_cached_beatmaps(user_id: number) {
        this.cached_beatmaps.clear();
        const maps=await readJsonV2<RespUserMostPlayedBeatmap[]>(ServiceCode.Data,SpaceId.Beatmaps,`1.${user_id}.json`);
        if(maps!==null) {
            maps.forEach(map => this.cached_beatmaps.set(map.beatmap_id,map));
            return maps;
        }
        return [];
    }

    async get_user_info(user_id: number|string) {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }
        return this._client.r_users.get_user_info(user_id);
    }

    async get_dlink_by_beatmapset_id(beatmapset_id: number) {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }
        return this._client.r_beatmapsets.download(beatmapset_id,true);
    }

    async fetch_packs(type: PackTypes='standard',cursor_string?: string) {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }
        return this._client.r_beatmaps.fetch_packs(type,cursor_string);
    }

    async get_pack(tag_id: any): Promise<CachedBeatmapPack> {
        if(this._client===undefined) {
            throw new Error("API client has not been initialized.");
        }

        if(this.cached_packs.size===0) {
            // init cached packs
            const packs=await readJsonV2<RespBeatmapPack[]>(ServiceCode.Data,SpaceId.Packs,`1.json`);
            if(packs!==null) {
                packs.forEach(pack => this.cached_packs.set(pack.tag,pack));
            }
        }
        if(this.cached_packs.has(tag_id)) return { cached: true,...this.cached_packs.get(tag_id)! };

        const pack=await this._client.r_beatmaps.get_pack(tag_id);
        this.cached_packs.set(tag_id,pack);

        // TODO: save cached packs everytimes is bad idea hehe*
        if(this.cached_packs.size>0) {
            // HELL O WORLD*
            await saveJsonV2(ServiceCode.Data,SpaceId.Packs,`1.json`,[...this.cached_packs.values()]);
        }
        return pack;
    }
}