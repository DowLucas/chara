import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HankoSeal } from "@/components/HankoSeal";
import { StoreBadges } from "@/components/StoreBadges";
import { absoluteUrl, canonicalLink, canonicalMeta, SITE_URL } from "@/lib/site";
import {
  COMPARE_AS_OF,
  COMPETITORS,
  competitorBySlug,
  type CompareRow,
  type Competitor,
  type Verdict,
} from "@/lib/competitors";

/* ============================================================
   /vs/<competitor> — one page per app people weigh us against.

   Five near-identical pages would be five files drifting apart, so the
   shape lives here once and the substance lives in lib/competitors.ts.
   Each page still gets its own title, description, canonical and
   JSON-LD, which is the part search engines actually read.
============================================================ */

type Lang = "en" | "sv";

function langOf(code: string): Lang {
  return code.startsWith("sv") ? "sv" : "en";
}

/** Same vocabulary as the landing-page table, so a reader who arrives here
 *  from the homepage is not learning a second set of symbols. */
const VERDICT_MARK: Record<Verdict, { glyph: string; color: string }> = {
  good: { glyph: "✓", color: "var(--moss)" },
  bad: { glyph: "✕", color: "var(--shu)" },
  mixed: { glyph: "◐", color: "var(--ochre)" },
  soon: { glyph: "○", color: "var(--bone-mute)" },
};

export const Route = createFileRoute("/vs/$slug")({
  loader: ({ params }) => {
    const competitor = competitorBySlug(params.slug);
    if (!competitor) throw notFound();
    return { competitor };
  },
  // Derived from `params`, not `loaderData`: head() can run before the loader
  // has resolved, and a head built from undefined loader data silently emits
  // no title, canonical or JSON-LD at all. The slug is in the URL, so the
  // lookup needs nothing async.
  head: ({ params }) => {
    const c = competitorBySlug(params.slug);
    if (!c) return {};
    const path = `/vs/${c.slug}`;
    const url = absoluteUrl(path);
    return {
      meta: [
        { title: c.title.en },
        { name: "description", content: c.description.en },
        { property: "og:title", content: c.title.en },
        { property: "og:description", content: c.description.en },
        ...canonicalMeta(path),
      ],
      links: [canonicalLink(path)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  {
                    "@type": "ListItem",
                    position: 1,
                    name: "Chara",
                    item: SITE_URL,
                  },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "Splitwise alternatives",
                    item: absoluteUrl("/splitwise-alternative"),
                  },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name: `Chara vs ${c.name}`,
                    item: url,
                  },
                ],
              },
              {
                "@type": "WebPage",
                name: c.title.en,
                description: c.description.en,
                url,
                // The page is a comparison, and saying so is more honest to a
                // crawler than dressing it up as a product page.
                about: [
                  { "@type": "SoftwareApplication", name: "Chara" },
                  { "@type": "SoftwareApplication", name: c.name },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: VersusPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <main className="mx-auto max-w-[1320px] px-8 lg:px-14 py-32">
        <h1 className="text-[clamp(32px,4vw,56px)] font-semibold tracking-[-0.035em] text-bone">
          No comparison on file.
        </h1>
        <Link
          to="/splitwise-alternative"
          className="mt-8 inline-block label text-[11px] uppercase tracking-[0.2em] text-ochre"
        >
          All alternatives →
        </Link>
      </main>
      <SiteFooter />
    </div>
  ),
});

function Cell({ verdict, children }: { verdict: Verdict; children: string }) {
  const mark = VERDICT_MARK[verdict];
  return (
    <span className="flex gap-2.5">
      <span
        className="mono text-[13px] leading-[1.55] shrink-0"
        style={{ color: mark.color }}
        aria-hidden
      >
        {mark.glyph}
      </span>
      <span>{children}</span>
    </span>
  );
}

const TINT_WIN = "color-mix(in oklab, var(--ochre) 22%, var(--indigo))";
const TINT_HELD = "color-mix(in oklab, var(--ochre) 7%, var(--indigo))";

function CompareTable({ c, lang }: { c: Competitor; lang: Lang }) {
  const { t } = useTranslation();
  return (
    <div className="mt-14 overflow-x-auto">
      <table className="w-full border-collapse min-w-[640px]">
        <caption className="sr-only">{`Chara compared with ${c.name}`}</caption>
        <thead>
          <tr className="border-y border-bone/20">
            <th className="text-left py-5 pr-4 w-[34%] label text-[11px] uppercase tracking-[0.2em] text-bone-mute font-medium">
              {t("versus.tableFeature")}
            </th>
            <th className="text-left py-5 px-4 w-[33%] label text-[11px] uppercase tracking-[0.2em] text-bone-mute font-medium">
              {c.columnName[lang]}
            </th>
            <th
              className="text-left py-5 px-4 w-[33%] label text-[11px] uppercase tracking-[0.2em] font-medium"
              style={{ background: "var(--ochre)", color: "var(--sumi)" }}
            >
              {t("versus.tableUs")}
            </th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r: CompareRow) => {
            const held = r.us.verdict !== "good";
            return (
              <tr key={r.k.en}>
                <td className="py-4 pr-4 text-bone text-[15px] align-top border-b border-bone/10">
                  {r.k[lang]}
                </td>
                <td className="py-4 px-4 text-bone-mute text-sm leading-[1.5] align-top border-b border-bone/10">
                  <Cell verdict={r.them.verdict}>{r.them[lang]}</Cell>
                </td>
                <td
                  className={`py-4 px-4 text-sm leading-[1.5] align-top border-b border-bone/30 ${held ? "" : "font-medium"}`}
                  style={{
                    background: held ? TINT_HELD : TINT_WIN,
                    color: held ? "var(--bone-dim)" : "var(--bone)",
                  }}
                >
                  <Cell verdict={r.us.verdict}>{r.us[lang]}</Cell>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VersusPage() {
  const { competitor: c } = Route.useLoaderData();
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);

  return (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />

      <main className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-14 py-20 md:py-28">
        <p className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute">
          {t("versus.eyebrow")}
        </p>
        <h1 className="mt-6 max-w-4xl text-[clamp(40px,5.4vw,84px)] font-semibold tracking-[-0.038em] leading-[0.98] text-bone">
          {c.h1[lang]}
        </h1>
        <p className="mt-10 max-w-2xl text-bone-dim text-[17px] leading-[1.62]">{c.lede[lang]}</p>

        {/* The verdict, printed large enough to be the thing people quote. */}
        <blockquote className="mt-16 max-w-3xl border-l-2 border-ochre pl-8">
          <p className="text-bone text-[21px] leading-[1.45]">{c.verdict[lang]}</p>
        </blockquote>

        <section aria-labelledby="table-heading" className="mt-24">
          <h2
            id="table-heading"
            className="text-[clamp(28px,3vw,44px)] font-semibold tracking-[-0.035em] leading-[1.04] text-bone"
          >
            {`Chara vs ${c.name}`}
          </h2>
          <p className="mt-6 max-w-xl text-bone-dim text-[15px] leading-[1.65]">
            {t("versus.intro")}
          </p>
          <CompareTable c={c} lang={lang} />
          <p className="mt-6 label text-[11px] uppercase tracking-[0.16em] text-bone-mute">
            {t("versus.asOf", { date: COMPARE_AS_OF[lang] })}
          </p>
        </section>

        {/* Every comparison concedes something. A page that sweeps every row
            reads as an advert and converts worse than one that does not. */}
        <section className="mt-24 max-w-2xl">
          <h2 className="text-[clamp(24px,2.4vw,34px)] font-semibold tracking-[-0.03em] leading-[1.08] text-bone">
            {`Where ${c.name} wins`}
          </h2>
          <p className="mt-6 text-bone-dim text-[16px] leading-[1.65]">{c.theyWin[lang]}</p>
        </section>

        <section className="mt-24 max-w-2xl">
          <h2 className="text-[clamp(24px,2.4vw,34px)] font-semibold tracking-[-0.03em] leading-[1.08] text-bone">
            {t("versus.switchTitle")}
          </h2>
          <p className="mt-6 text-bone-dim text-[16px] leading-[1.65]">
            {t("versus.switchBody", { name: c.name })}
          </p>
          <Link
            to="/switch-from-splitwise"
            className="mt-8 inline-block label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
          >
            {t("versus.backToAll")}
          </Link>
        </section>

        <section className="mt-24 border-t border-bone/15 pt-14">
          <h2 className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute">
            {t("versus.alsoTitle")}
          </h2>
          <ul className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {others.map((o) => (
              <li key={o.slug}>
                <Link
                  to="/vs/$slug"
                  params={{ slug: o.slug }}
                  className="text-bone text-[17px] hover:text-ochre transition-colors"
                >
                  {`Chara vs ${o.name}`}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/splitwise-alternative"
                className="text-ochre text-[17px] hover:text-bone transition-colors"
              >
                {t("versus.backToAll")}
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-24 border-t border-bone/15 pt-14 flex flex-wrap items-end justify-between gap-10">
          <div className="max-w-xl">
            <h2 className="text-[clamp(28px,3vw,44px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
              {t("versus.ctaTitle")}
            </h2>
            <p className="mt-5 text-bone-dim text-[16px] leading-[1.6]">{t("versus.ctaBody")}</p>
            <div className="mt-8">
              <StoreBadges />
            </div>
          </div>
          <HankoSeal size={56} />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
