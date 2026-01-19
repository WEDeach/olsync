import { I18nStrings } from "./typed/i18n";

type I18nMap=Partial<Record<I18nStrings,string>>;

const i18n: Record<string,I18nMap>={
    'zh-TW': {
        [I18nStrings.MAIN_DATA_READING]: '讀取資料中...',
        [I18nStrings.BTN_COLLECTION_READ]: '閱讀收藏',
    },
    'en-US': { [I18nStrings.BTN_COLLECTION_READ]: 'Read Collection' }
};
var defaultLang='zh-TW';

export function setI18n(lang: string,json: { [key: string]: any }) {
    i18n[lang]={ ...i18n[lang] }
    const _setter=(o: any,pk: string) => {
        Object.keys(o).forEach(k => {
            const value=o[k];
            k=pk? `${pk}.${k}`:k;

            if(typeof value==='object'&&value!==null&&!Array.isArray(value)) {
                _setter(value,k);
            } else {
                i18n[lang][k as I18nStrings]=String(value);
            }
        });
    }
    _setter(json,'');
}

export function getLangs() {
    return Object.entries(i18n).reduce((acc,[lang,data]) => {
        acc[lang]=data.__LANG__??lang;
        return acc;
    },{} as Record<string,string>);
}

export function getLang(lang: string) {
    return i18n[lang]??{};
}

export function setDefaultLang(lang: string) {
    defaultLang=lang;
}

export default function __(key: I18nStrings,exts?: { [key: string]: any },lang?: string) {
    lang=lang??defaultLang;
    const _i18n=i18n[lang];
    let text=_i18n?.[key]??`${lang}.${key}`;
    if(exts&&Object.keys(exts).length>0) {
        text=text.replace(/:(\w+)/g,(match,key) => {
            let value=exts[key];
            if(value===undefined||value===null) {
                return match;
            }
            return String(value);
        });
    }
    return text;
}