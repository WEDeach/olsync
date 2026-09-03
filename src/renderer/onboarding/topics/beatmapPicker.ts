import { I18nStrings } from "../../../utils/typed/i18n";
import { OnboardingTopic } from "../types";

const topic: OnboardingTopic = {
    id: "beatmap_picker",
    titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_TITLE,
    steps: [
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_DESC,
        },
    ],
};

export default topic;
