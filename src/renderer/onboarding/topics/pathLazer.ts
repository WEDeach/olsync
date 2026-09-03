import { I18nStrings } from "../../../utils/typed/i18n";
import pathLazer1 from "../../assets/onboarding/path-lazer-1.png";
import pathLazer2 from "../../assets/onboarding/path-lazer-2.png";
import pathLazer3 from "../../assets/onboarding/path-lazer-3.png";
import pathLazer4 from "../../assets/onboarding/path-lazer-4.png";
import pathLazer5 from "../../assets/onboarding/path-lazer-5.png";
import { OnboardingTopic } from "../types";

const topic: OnboardingTopic = {
    id: "path_lazer",
    titleKey: I18nStrings.ONBOARDING_PATH_LAZER_TITLE,
    steps: [
        {
            titleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP1_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP1_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP1_DESC,
            image: pathLazer1,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP2_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP2_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP2_DESC,
            image: pathLazer2,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP3_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP3_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP3_DESC,
            image: pathLazer3,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP4_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP4_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP4_DESC,
            image: pathLazer4,
        },
        {
            titleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP5_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP5_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_PATH_LAZER_STEP5_DESC,
            image: pathLazer5,
        },
    ],
};

export default topic;
