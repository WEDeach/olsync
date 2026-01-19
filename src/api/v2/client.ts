import BeatmapsetsRoute from "./routes/beatmapsets";
import OauthRoute from "./routes/oauth";
import UsersRoute from "./routes/users";
import { RespOAuthToken } from "./types/api_resp";
import APIException from "./types/exceptions";
import { pathJoin,pCache,readJson,saveJson } from "../../utils/file";
import BeatmapsRoute from "./routes/beatmaps";


export default class ApiClient {
    private client_id: string;
    private client_secret: string;
    private auth_token?: string;

    public r_oauth: OauthRoute;
    public r_users: UsersRoute;
    public r_beatmapsets: BeatmapsetsRoute;
    public r_beatmaps: BeatmapsRoute;

    constructor(client_id: string,client_secret: string) {
        this.client_id=client_id;
        this.client_secret=client_secret;

        this.r_oauth=new OauthRoute(this);
        this.r_users=new UsersRoute(this);
        this.r_beatmapsets=new BeatmapsetsRoute(this);
        this.r_beatmaps=new BeatmapsRoute(this);
    }

    async init_token() {
        if(this.client_id?.length===0||this.client_secret?.length===0) {
            throw new Error('Invalid client id or client secret.');
        }
        const unit_token_key=`client_${this.client_id}`;
        const json=await readJson(pathJoin(pCache,unit_token_key)) as RespOAuthToken|null;
        if(json===null||json.expires_in<=Date.now()/1000) {
            const token=await this.r_oauth.get_token();
            this.auth_token=token.access_token;
            await saveJson(pathJoin(pCache,unit_token_key),token);
        }
        else {
            this.auth_token=json.access_token;
        }
    }

    async request<T>(method: string,endpoint: string,data?: any,params?: any,options?: RequestInit): Promise<T> {
        let url=`https://osu.ppy.sh${endpoint}`;

        const ops: RequestInit={
            ...options,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(this.auth_token&&{ 'Authorization': `Bearer ${this.auth_token}` })
            }
        };

        if(data) {
            if(method==='GET') {
                console.error(`GET method does not support data: ${endpoint}, ${data}`);

            } else {
                ops.body=JSON.stringify(data);
            }
        }

        if(params) {
            const _ps=new URLSearchParams(params);
            url+=`?${_ps}`;
        }

        const response=await fetch(url,ops);
        console.log(`[API] (${response.status} ${response.statusText}) ${endpoint}`);
        const headers: Record<string,string>={};
        response.headers.forEach((value,key) => {
            headers[key]=value;
        });
        const rate_limit=headers['x-ratelimit-limit']||'-';
        const rate_remaining=headers['x-ratelimit-remaining']||'-';
        console.log(`   >> ${rate_remaining}/${rate_limit}`);
        if(options?.redirect==='manual') {
            return response as any;
        }
        const json=await response.json();

        if('error' in json) {
            throw new APIException(json);
        }

        return json;
    }

    get client_credentials() {
        return {
            client_id: this.client_id,
            client_secret: this.client_secret
        };
    }
}