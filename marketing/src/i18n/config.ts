import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { sv } from "./sv";

const STORAGE_KEY = "chara.lang";

function detectInitialLang(): "en" | "sv" {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "sv") return stored;
  const nav = window.navigator.language?.toLowerCase() ?? "";
  return nav.startsWith("sv") ? "sv" : "en";
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        sv: { translation: sv },
      },
      lng: detectInitialLang(),
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      returnNull: false,
    });
}

export function setLang(lang: "en" | "sv") {
  i18n.changeLanguage(lang);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang);
  }
}

export default i18n;
