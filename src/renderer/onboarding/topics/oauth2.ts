import { I18nStrings } from "../../../utils/typed/i18n";
import oauth1 from "../../assets/onboarding/oauth-1.png";
import oauth2 from "../../assets/onboarding/oauth-2.png";
import oauth3 from "../../assets/onboarding/oauth-3.png";
import oauth4 from "../../assets/onboarding/oauth-4.png";
import { OnboardingTopic } from "../types";

const topic: OnboardingTopic = {
    id: "oauth2",
    titleKey: I18nStrings.ONBOARDING_OAUTH2_TITLE,
    steps: [
        {
            titleKey: I18nStrings.ONBOARDING_OAUTH2_STEP1_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_OAUTH2_STEP1_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_OAUTH2_STEP1_DESC,
            image: oauth1,
            link: {
                textKey: I18nStrings.ONBOARDING_OAUTH2_STEP1_LINK,
                href: "https://osu.ppy.sh/home/account/edit",
            },
        },
        {
            titleKey: I18nStrings.ONBOARDING_OAUTH2_STEP2_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_OAUTH2_STEP2_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_OAUTH2_STEP2_DESC,
            image: oauth2,
        },
        {
            titleKey: I18nStrings.ONBOARDING_OAUTH2_STEP3_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_OAUTH2_STEP3_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_OAUTH2_STEP3_DESC,
            image: oauth3,
        },
        {
            titleKey: I18nStrings.ONBOARDING_OAUTH2_STEP4_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_OAUTH2_STEP4_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_OAUTH2_STEP4_DESC,
            image: oauth4,
        },
    ],
};

export default topic;
