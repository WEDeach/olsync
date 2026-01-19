import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./main/main";
import { setI18n } from "../utils/i18n";

window.olsCore.on("i18n-updated",async (_,lang) => {
    const data=await window.olsCore.getLang(lang);
    setI18n(lang,data);
});
window.olsCore.send("fetch-i18n");

const rootElement=document.getElementById("root");
const root=createRoot(rootElement!);
root.render(<App />);