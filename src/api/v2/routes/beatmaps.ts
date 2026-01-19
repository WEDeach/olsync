import { RespBeatmapPack,RespBeatmapPacks } from "../types/api_resp";
import BaseRoute from "./base";

export type PackTypes='standard'|'featured'|'tournament'|'loved'|'chart'|'theme'|'artist';

export default class BeatmapsRoute extends BaseRoute {

    async fetch_packs(type: PackTypes='standard',cursor_string?: string): Promise<RespBeatmapPacks> {
        const query=cursor_string? {
            'cursor_string': cursor_string
        }:null;
        const response=await this.client.request<RespBeatmapPacks>(
            'GET',
            this.url_with_prefix("/beatmaps/packs"),
            undefined,
            {
                'type': type,
                ...query
            }
        );
        if(response&&Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to fetch beatmap packs.");
    }

    async get_pack(tag_id: any): Promise<RespBeatmapPack> {
        const response=await this.client.request<RespBeatmapPack>(
            'GET',
            this.url_with_prefix(`/beatmaps/packs/${tag_id}`)
        );
        if(response&&Object.keys(response)) {
            return response;
        }
        throw new Error(`Failed to get beatmap pack: ${tag_id}.`);
    }
}

