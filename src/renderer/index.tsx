import { createRoot } from "react-dom/client";
import { setDefaultLang, setI18n } from "../utils/i18n";
import { stableIpcState } from "../utils/stableIpcState";
import { setDayjsLocale } from "../utils/time";
import App from "./main/main";
import g from "./state";

window.olsCore.onI18nChanged(async (lang: string) => {
    const data = await window.olsCore.getLang(lang);
    setI18n(lang, data);
    setDefaultLang(lang);
    setDayjsLocale(lang);
    g.bumpI18nVersion();
});
void window.olsCore.fetchCurrentI18n();

stableIpcState.start();

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
