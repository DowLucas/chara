import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "./LanguageToggle";
import hankoLogo from "@/assets/chara-hanko.png";

export function SiteHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-50 backdrop-blur-[2px]" style={{ background: "color-mix(in oklab, var(--indigo) 88%, transparent)" }}>
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-5 flex items-center justify-between border-b border-bone/10">
        <Link to="/" className="flex items-center group">
          <img
            src={hankoLogo}
            alt="Chara"
            className="inline-block select-none"
            style={{ height: 56, width: "auto", objectFit: "contain" }}
            draggable={false}
          />
        </Link>
        <nav className="hidden md:flex items-center gap-10 mono text-[11px] uppercase tracking-[0.2em] text-bone-mute">
          <a href="/#values" className="hover:text-bone transition-colors">{t("nav.why")}</a>
          <a href="/#features" className="hover:text-bone transition-colors">{t("nav.features")}</a>
          <a href="/#compare" className="hover:text-bone transition-colors">{t("nav.compare")}</a>
          <a href="/#self-host" className="hover:text-bone transition-colors">{t("nav.selfHost")}</a>
          <a href="/#faq" className="hover:text-bone transition-colors">{t("nav.faq")}</a>
          <Link to="/releases" className="hover:text-bone transition-colors">{t("nav.releases")}</Link>
        </nav>
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <a
            href="https://github.com/DowLucas/chara"
            className="hidden sm:inline-flex mono text-[11px] uppercase tracking-[0.2em] text-bone border border-bone/30 px-4 py-2 hover:border-bone hover:bg-bone hover:text-indigo transition-colors"
          >
            {t("nav.source")}
          </a>
        </div>
      </div>
    </header>
  );
}
