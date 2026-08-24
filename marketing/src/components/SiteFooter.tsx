import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RegistrationMark } from "./RegistrationMark";
import { StoreBadges } from "./StoreBadges";
import hankoLogo from "@/assets/chara-hanko.png";

const legalRoutes: { to: "/privacy" | "/terms" | "/cookies" | "/dpa" | "/security" | "/support"; key: string }[] = [
  { to: "/privacy", key: "privacy" },
  { to: "/terms", key: "terms" },
  { to: "/cookies", key: "cookies" },
  { to: "/dpa", key: "dpa" },
  { to: "/security", key: "security" },
  { to: "/support", key: "support" },
];

export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-bone/10 mt-32">
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-20 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-5">
          <div className="flex items-center gap-3">
            <img
              src={hankoLogo}
              alt=""
              className="inline-block select-none"
              style={{ height: 40, width: "auto", objectFit: "contain" }}
              draggable={false}
            />
            <span className="mono text-sm tracking-[0.22em] text-bone">CHARA</span>
          </div>
          <p className="mt-6 text-bone-mute text-sm max-w-sm leading-relaxed">
            {t("footer.blurb")}
          </p>
          <StoreBadges size="sm" className="mt-6" />
        </div>

        <div className="col-span-6 md:col-span-3">
          <div className="mono text-[11px] uppercase tracking-[0.2em] text-bone-mute mb-5">{t("footer.legal")}</div>
          <ul className="space-y-3">
            {legalRoutes.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-bone hover:text-ochre transition-colors text-sm">
                  {t(`footer.${l.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-6 md:col-span-3">
          <div className="mono text-[11px] uppercase tracking-[0.2em] text-bone-mute mb-5">{t("footer.project")}</div>
          <ul className="space-y-3 text-sm">
            <li><a className="text-bone hover:text-ochre transition-colors" href="https://github.com/DowLucas/chara">{t("footer.github")}</a></li>
            <li><a className="text-bone hover:text-ochre transition-colors" href="/docs">{t("footer.docs")}</a></li>
            <li><Link to="/releases" className="text-bone hover:text-ochre transition-colors">{t("footer.releases")}</Link></li>
          </ul>
        </div>

        <div className="col-span-12 md:col-span-1 flex md:justify-end items-start">
          <RegistrationMark />
        </div>
      </div>

      <div className="border-t border-bone/10">
        <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-6 flex items-center justify-between mono text-[11px] uppercase tracking-[0.2em] text-bone-mute">
          <span>{t("footer.place")}</span>
          <span>{t("footer.license")}</span>
        </div>
      </div>
    </footer>
  );
}
