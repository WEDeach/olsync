import { OnboardingTopic } from "../types";

export const topicLoaders: Record<string, () => Promise<{ default: OnboardingTopic }>> = {
    oauth2: () => import("./oauth2"),
    beatmap_picker: () => import("./beatmapPicker"),
    path_lazer: () => import("./pathLazer"),
    path_stable: () => import("./pathStable"),
};
