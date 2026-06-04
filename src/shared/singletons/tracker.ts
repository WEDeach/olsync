import path from "path";
import { TrackerUserSummary } from "../../defines/tracker_types";
import { getAllFiles, pathExistsSync, pRoot, readJsonV2, saveJsonV2 } from "../../utils/file";
import { ServiceCode, SpaceId } from "../../utils/typed/file";
import SingletonBase from "./base";

export default class Tracker extends SingletonBase {
    async get_user_summary(userName: string): Promise<TrackerUserSummary | null> {
        return readJsonV2<TrackerUserSummary>(ServiceCode.Tracker, SpaceId.TrackerUserData, `${userName}.json`);
    }

    async save_user_summary(data: TrackerUserSummary): Promise<void> {
        await saveJsonV2(ServiceCode.Tracker, SpaceId.TrackerUserData, `${data.userName}.json`, data);
    }

    async list_user_summaries(): Promise<TrackerUserSummary[]> {
        const dir = path.join(pRoot, ServiceCode.Tracker, SpaceId.TrackerUserData);
        if (!pathExistsSync(dir)) return [];
        const files = getAllFiles(dir).filter((f) => f.endsWith(".json"));
        const summaries: TrackerUserSummary[] = [];
        for (const f of files) {
            const userName = f.replace(".json", "");
            const summary = await this.get_user_summary(userName);
            if (summary) summaries.push(summary);
        }
        return summaries;
    }
}
