import { I18nStrings } from "../../utils/typed/i18n";

export interface OnboardingLink {
    textKey: I18nStrings;
    href: string;
}

export interface OnboardingStep {
    titleKey: I18nStrings;
    shortTitleKey: I18nStrings;
    descriptionKey: I18nStrings;
    image?: string;
    link?: OnboardingLink;
}

export interface OnboardingTopic {
    id: string;
    titleKey: I18nStrings;
    steps: OnboardingStep[];
}
