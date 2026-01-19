import { RespOAuthToken } from "../types/api_resp";
import BaseRoute from "./base";

export default class OauthRoute extends BaseRoute {

    async get_token(): Promise<RespOAuthToken> {
        const cc=this.client.client_credentials;
        const response=await this.client.request<RespOAuthToken>('POST','/oauth/token',{
            'grant_type': 'client_credentials',
            'client_id': cc.client_id,
            'client_secret': cc.client_secret,
            'scope': 'public'
        });
        if(response&&Object.keys(response)) {
            response.expires_in+=Date.now()/1000;
            return response;
        }
        throw new Error("Failed to get token.");
    }
}

