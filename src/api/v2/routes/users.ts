import { RespUserInfo, RespUserMostPlayedBeatmaps, RespUserRecentScores } from "../types/api_resp";
import BaseRoute from "./base";

export default class UsersRoute extends BaseRoute {
    async get_most_played_beatmaps_by_user_id(
        user_id: number,
        limit: number = 200,
        offset: number = 0,
    ): Promise<RespUserMostPlayedBeatmaps> {
        const url = this.url_with_prefix(`/users/${user_id}/beatmapsets/most_played`);
        const params = {
            limit: limit,
            offset: offset,
        };
        const response = await this.client.request<RespUserMostPlayedBeatmaps>("GET", url, undefined, params);
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to get user most played beatmaps.");
    }

    async get_user_info(user_id: number | string): Promise<RespUserInfo> {
        const n = /^\d+$/.test(String(user_id));
        const url = this.url_with_prefix(`/users/${n ? user_id : `@${user_id}`}`);
        const response = await this.client.request<RespUserInfo>("GET", url, undefined);
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to get user info.");
    }

    async get_user_recent_scores(
        user_id: number,
        include_fails: boolean = true,
        legacy_only: boolean = true,
    ): Promise<RespUserRecentScores> {
        const url = this.url_with_prefix(`/users/${user_id}/scores/recent`);
        const response = await this.client.request<RespUserRecentScores>("GET", url, undefined, {
            include_fails: include_fails ? 1 : 0,
            legacy_only: legacy_only ? 1 : 0,
        });
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to get user recent scores.");
    }
}
