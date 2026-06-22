import { createRoot } from "react-dom/client";
import { IPC_LA_NAMES } from "../entrypoint/js/ipc/ns";
import { setDefaultLang, setI18n } from "../utils/i18n";
import { setDayjsLocale } from "../utils/time";
import App from "./main/main";
import g from "./state";

window.olsCore.on(IPC_LA_NAMES.I18N_CHANGED, async (_, lang: string) => {
    const data = await window.olsCore.getLang(lang);
    setI18n(lang, data);
    setDefaultLang(lang);
    setDayjsLocale(lang);
    g.bumpI18nVersion();
});
window.olsCore.send("fetch-i18n");

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
