import { RespUserInfo,RespUserMostPlayedBeatmaps } from "../types/api_resp";
import BaseRoute from "./base";

export default class UsersRoute extends BaseRoute {

    async get_most_played_beatmaps_by_user_id(user_id: number,limit: number=200,offset: number=0): Promise<RespUserMostPlayedBeatmaps> {
        const url=this.url_with_prefix(`/users/${user_id}/beatmapsets/most_played`);
        const params={
            'limit': limit,
            'offset': offset
        }
        const response=await this.client.request<RespUserMostPlayedBeatmaps>('GET',url,undefined,params);
        if(response&&Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to get user most played beatmaps.");
    }

    async get_user_info(user_id: number|string): Promise<RespUserInfo> {
        const n=/^\d+$/.test(String(user_id));
        const url=this.url_with_prefix(`/users/${n? user_id:`@${user_id}`}`);
        const response=await this.client.request<RespUserInfo>('GET',url,undefined);
        if(response&&Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to get user info.");
    }
}

