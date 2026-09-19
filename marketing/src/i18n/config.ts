import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { sv } from "./sv";
import { mergePageResources } from "./pages";

const STORAGE_KEY = "chara.lang";

// Called after the page hydrates, never at module load: the server always renders
// English, so starting the client in any other language breaks hydration
// (React #418) and throws away the server-rendered HTML.
export function detectPreferredLang(): "en" | "sv" {
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
        // Page bundles sit alongside the shell catalogue in the same
        // `translation` namespace, so a page key reads exactly like any other.
        en: { translation: mergePageResources("en", en) },
        sv: { translation: mergePageResources("sv", sv) },
      },
      lng: "en",
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
