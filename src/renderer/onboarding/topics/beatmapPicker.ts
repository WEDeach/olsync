import { I18nStrings } from "../../../utils/typed/i18n";
import picker1 from "../../assets/onboarding/picker-1.png";
import picker2 from "../../assets/onboarding/picker-2.png";
import picker3 from "../../assets/onboarding/picker-3.png";
import picker4 from "../../assets/onboarding/picker-4.png";
import picker5 from "../../assets/onboarding/picker-5.png";
import pickerFlow from "../../assets/onboarding/picker-flow.svg";
import { OnboardingTopic } from "../types";

const topic: OnboardingTopic = {
    id: "beatmap_picker",
    titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_TITLE,
    steps: [
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP1_DESC,
            image: pickerFlow,
        },
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP2_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP2_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP2_DESC,
            image: picker1,
        },
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP3_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP3_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP3_DESC,
            image: picker2,
        },
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP4_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP4_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP4_DESC,
            image: picker3,
        },
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP5_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP5_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP5_DESC,
            image: picker4,
        },
        {
            titleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP6_TITLE,
            shortTitleKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP6_SHORT,
            descriptionKey: I18nStrings.ONBOARDING_BEATMAP_PICKER_STEP6_DESC,
            image: picker5,
        },
    ],
};

export default topic;
