import { I18nStrings } from "../../../utils/typed/i18n";
import pathStable1 from "../../assets/onboarding/path-stable-1.png";
import pathStable2 from "../../assets/onboarding/path-stable-2.png";
import pathStable3 from "../../assets/onboarding/path-stable-3.png";
import { OnboardingTopic } from "../types";

const topic: OnboardingTopic = {
    id: "path_stable",
    titleKey: I18nStrings.ONBOARDING_PATH_STABLE_TITLE,
    steps: [
        {
            titleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP1_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP1_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP1_DESC,
            image: pathStable1,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP2_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP2_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP2_DESC,
            image: pathStable2,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP3_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP3_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_STABLE_STEP3_DESC,
            image: pathStable3,
        },
    ],
};

export default topic;
