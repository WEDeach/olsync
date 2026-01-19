import BaseRoute from "./base";

export default class BeatmapsetsRoute extends BaseRoute {

    async download(beatmapset_id: number,with_link: boolean=false): Promise<string|ArrayBuffer> {
        const response=await this.client.request<any>(
            'GET',
            this.url_with_prefix(`/beatmapsets/${beatmapset_id}/download`),
            undefined,
            undefined,
            {
                redirect: !with_link? 'follow':'manual'
            }
        );
        if(with_link) {
            const location=response.headers.get('Location');
            if(!location) {
                throw new Error('Could not get download link.');
            }
            return location;
        } else {
            if(!response.ok) {
                throw new Error(`Download failed: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer=await response.arrayBuffer();
            return arrayBuffer;
        }
    }
}

