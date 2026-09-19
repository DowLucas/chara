import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { detectPreferredLang, setLang } from "@/i18n/config";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  // Here rather than in the root: route components hydrate after the root, so
  // switching from the root's effect re-renders the page body in the new
  // language before it has hydrated. This lives inside every page's header.
  useEffect(() => {
    i18n.changeLanguage(detectPreferredLang());
  }, [i18n]);
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("sv") ? "sv" : "en";

  return (
    <div
      role="group"
      aria-label="Language"
      className="mono text-[11px] uppercase tracking-[0.2em] inline-flex items-center border border-bone/30"
    >
      {(["en", "sv"] as const).map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => setLang(lng)}
            aria-pressed={active}
            className={
              "px-3 py-2 transition-colors " +
              (active
                ? "bg-bone text-indigo"
                : "text-bone-mute hover:text-bone")
            }
          >
            {t(`lang.${lng}`)}
          </button>
        );
      })}
    </div>
  );
}
