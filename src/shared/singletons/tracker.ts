import { TrackerUserSummary } from "../../defines/tracker_types";
import { readJsonV2, saveJsonV2 } from "../../utils/file";
import { ServiceCode, SpaceId } from "../../utils/typed/file";
import SingletonBase from "./base";

export default class Tracker extends SingletonBase {
    async get_user_summary(userName: string): Promise<TrackerUserSummary | null> {
        return readJsonV2<TrackerUserSummary>(ServiceCode.Tracker, SpaceId.TrackerUserData, `${userName}.json`);
    }

    async save_user_summary(data: TrackerUserSummary): Promise<void> {
        await saveJsonV2(ServiceCode.Tracker, SpaceId.TrackerUserData, `${data.userName}.json`, data);
    }
}
