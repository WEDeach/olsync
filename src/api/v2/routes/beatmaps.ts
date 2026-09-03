import {
    RespBeatmapAttributes,
    RespBeatmapLookup,
    RespBeatmapPack,
    RespBeatmapPacks,
    RespBeatmapUserScore,
} from "../types/api_resp";
import BaseRoute from "./base";

export type PackTypes = "standard" | "featured" | "tournament" | "loved" | "chart" | "theme" | "artist";
type LookupQueryKeys = "id" | "checksum" | "filename";

export default class BeatmapsRoute extends BaseRoute {
    async fetch_packs(type: PackTypes = "standard", cursor_string?: string): Promise<RespBeatmapPacks> {
        const query = cursor_string
            ? {
                  cursor_string: cursor_string,
              }
            : null;
        const response = await this.client.request<RespBeatmapPacks>(
            "GET",
            this.url_with_prefix("/beatmaps/packs"),
            undefined,
            {
                type: type,
                ...query,
            },
        );
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error("Failed to fetch beatmap packs.");
    }

    async get_pack(tag_id: any): Promise<RespBeatmapPack> {
        const response = await this.client.request<RespBeatmapPack>(
            "GET",
            this.url_with_prefix(`/beatmaps/packs/${tag_id}`),
        );
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error(`Failed to get beatmap pack: ${tag_id}.`);
    }

    async get_attributes(beatmapId: number, mods: number, rulesetId: number): Promise<RespBeatmapAttributes> {
        return await this.client.request<RespBeatmapAttributes>(
            "POST",
            this.url_with_prefix(`/beatmaps/${beatmapId}/attributes`),
            { mods, ruleset_id: rulesetId },
        );
    }

    async lookup(params: Partial<Record<LookupQueryKeys, string | number>>): Promise<RespBeatmapLookup> {
        const response = await this.client.request<RespBeatmapLookup>(
            "GET",
            this.url_with_prefix("/beatmaps/lookup"),
            undefined,
            params,
        );
        if (response && Object.keys(response)) {
            return response;
        }
        throw new Error(`Failed to lookup beatmap with params: ${JSON.stringify(params)}.`);
    }

    async get_beatmap_user_score(
        beatmap_id: number,
        user_id: number,
        legacy_only?: boolean,
    ): Promise<RespBeatmapUserScore> {
        const params: Record<string, number> = {};
        if (legacy_only !== undefined) {
            params.legacy_only = legacy_only ? 1 : 0;
        }
        const response = await this.client.request<RespBeatmapUserScore>(
            "GET",
            this.url_with_prefix(`/beatmaps/${beatmap_id}/scores/users/${user_id}`),
            undefined,
            Object.keys(params).length > 0 ? params : undefined,
        );
        if (response?.score) {
            return response;
        }
        throw new Error(`Failed to get beatmap user score: ${beatmap_id}, ${user_id}.`);
    }
}
