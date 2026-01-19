import ApiClient from "../client";

export default class BaseRoute {
    public static readonly BASE_PATH="/api/v2";

    constructor(protected client: ApiClient) { }

    public url_with_prefix(endpoint: string) {
        return `${BaseRoute.BASE_PATH}${endpoint}`;
    }
}