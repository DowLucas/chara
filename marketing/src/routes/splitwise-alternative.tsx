import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { EyebrowIndex } from "@/components/EyebrowIndex";
import { HankoSeal } from "@/components/HankoSeal";
import { StoreBadges } from "@/components/StoreBadges";
import { absoluteUrl, canonicalLink, canonicalMeta, SITE_URL } from "@/lib/site";
import { COMPETITORS } from "@/lib/competitors";
import { splitwiseAlternative } from "@/i18n/pages/splitwise-alternative";

/* ============================================================
   /splitwise-alternative — the pillar page for the head term.

   Five apps, each with the case for it (including against us), each
   linked to its /vs/ page. The FAQ block below is the single source
   for both the rendered accordion and the FAQPage JSON-LD.
============================================================ */

const PATH = "/splitwise-alternative";
const EASE = [0.2, 0.7, 0.2, 1] as const;

type FaqItem = { q: string; a: string; more?: { href: string; label: string } };
type Step = { h: string; b: string };
type AppCopy = { tag: string; body: string; link: string };

/* The five entries, in reading order. Chara has no /vs/ page of its own, so
   its link goes to the Splitwise comparison — the one a reader of this page
   is actually weighing. Names come from the competitor records, never from
   the translation bundle, so the two languages cannot spell them apart. */
const APPS: Array<{ key: string; name: string; slug: string }> = [
  { key: "chara", name: "Chara", slug: "splitwise" },
  ...COMPETITORS.filter((c) => c.slug !== "splitwise").map((c) => ({
    key: c.slug,
    name: c.name,
    slug: c.slug,
  })),
];

export const Route = createFileRoute("/splitwise-alternative")({
  head: () => {
    // The server renders in English (see i18n/config.ts), so the crawler-facing
    // head is built from the same `en` bundle the page renders with.
    const m = splitwiseAlternative.en;
    const faq = m.faq.items as FaqItem[];
    return {
      meta: [
        { title: m.meta.title },
        { name: "description", content: m.meta.description },
        { property: "og:title", content: m.meta.title },
        { property: "og:description", content: m.meta.description },
        { name: "twitter:title", content: m.meta.title },
        { name: "twitter:description", content: m.meta.description },
        ...canonicalMeta(PATH),
      ],
      links: [canonicalLink(PATH)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Chara", item: SITE_URL },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "Splitwise alternatives",
                    item: absoluteUrl(PATH),
                  },
                ],
              },
              {
                "@type": "FAQPage",
                mainEntity: faq.map((it) => ({
                  "@type": "Question",
                  name: it.q,
                  acceptedAnswer: { "@type": "Answer", text: it.a },
                })),
              },
            ],
          }),
        },
      ],
    };
  },
  component: SplitwiseAlternativePage,
});

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <p className="label text-[11px] uppercase tracking-[0.2em] text-ochre">{eyebrow}</p>
      <h2 className="mt-5 max-w-3xl text-[clamp(30px,3.6vw,54px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
        {title}
      </h2>
    </>
  );
}

function Criteria() {
  const { t } = useTranslation();
  const items = t("splitwiseAlternative.criteria.items", { returnObjects: true }) as Step[];
  return (
    <section className="mt-24" aria-labelledby="criteria-title">
      <SectionTitle
        eyebrow={t("splitwiseAlternative.criteria.eyebrow")}
        title={t("splitwiseAlternative.criteria.title")}
      />
      <ol className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-px bg-bone/15">
        {items.map((it, i) => (
          <li key={it.h} className="bg-indigo px-8 py-9">
            <span className="mono text-xs text-ochre tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 text-[21px] font-semibold leading-[1.14] tracking-[-0.026em] text-bone">
              {it.h}
            </h3>
            <p className="mt-3 text-bone-mute text-[15px] leading-[1.6]">{it.b}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Apps() {
  const { t } = useTranslation();
  const copy = t("splitwiseAlternative.apps.items", { returnObjects: true }) as Record<
    string,
    AppCopy
  >;
  return (
    <section className="mt-28" aria-labelledby="apps-title">
      <SectionTitle
        eyebrow={t("splitwiseAlternative.apps.eyebrow")}
        title={t("splitwiseAlternative.apps.title")}
      />
      <p className="mt-6 max-w-xl text-bone-dim text-[15px] leading-[1.65]">
        {t("splitwiseAlternative.apps.intro")}
      </p>

      <div className="mt-14 border-t border-bone/15">
        {APPS.map((app, i) => {
          const c = copy[app.key];
          if (!c) return null;
          return (
            <article
              key={app.key}
              className="grid grid-cols-12 gap-x-8 gap-y-6 py-12 border-b border-bone/15"
            >
              <div className="col-span-12 lg:col-span-4">
                <span className="mono text-xs text-ochre tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.03em] leading-[1.02] text-bone">
                  {app.name}
                </h3>
                <p className="mt-4 label text-[11px] uppercase tracking-[0.18em] text-bone-mute">
                  {c.tag}
                </p>
              </div>
              <div className="col-span-12 lg:col-span-7 lg:col-start-6">
                <p className="text-bone-dim text-[16px] leading-[1.65]">{c.body}</p>
                <Link
                  to="/vs/$slug"
                  params={{ slug: app.slug }}
                  className="mt-6 inline-block label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
                >
                  {c.link}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CharaCase() {
  const { t } = useTranslation();
  return (
    <section className="mt-28 grid grid-cols-12 gap-x-8 gap-y-10">
      <div className="col-span-12 lg:col-span-5">
        <SectionTitle
          eyebrow={t("splitwiseAlternative.charaCase.eyebrow")}
          title={t("splitwiseAlternative.charaCase.title")}
        />
      </div>
      <div className="col-span-12 lg:col-span-6 lg:col-start-7">
        <p className="text-bone text-[17px] leading-[1.6]">
          {t("splitwiseAlternative.charaCase.body1")}
        </p>
        <p className="mt-6 text-bone-dim text-[16px] leading-[1.65]">
          {t("splitwiseAlternative.charaCase.body2")}
        </p>
        <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3">
          <Link
            to="/switch-from-splitwise"
            className="label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
          >
            {t("splitwiseAlternative.charaCase.switchLink")}
          </Link>
          {/* Plain anchor: /self-host is another page's route and may not be in
              the generated tree when this file is typechecked. */}
          <a
            href="/self-host"
            className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute hover:text-bone transition-colors"
          >
            {t("splitwiseAlternative.charaCase.selfHostLink")}
          </a>
        </div>
      </div>
    </section>
  );
}

/* Same accordion as the landing page's FAQ — + / − toggle, sumi rules. */
function FAQ() {
  const { t } = useTranslation();
  const items = t("splitwiseAlternative.faq.items", { returnObjects: true }) as FaqItem[];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mt-28 grid grid-cols-12 gap-8" aria-labelledby="faq-title">
      <div className="col-span-12 lg:col-span-4">
        <h2
          id="faq-title"
          className="text-[clamp(36px,4.6vw,64px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone"
        >
          {t("splitwiseAlternative.faq.titleA")}
          <br />
          {t("splitwiseAlternative.faq.titleB")}
        </h2>
      </div>

      <div className="col-span-12 lg:col-span-8 border-t border-bone/15">
        {items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={it.q} className="border-b border-bone/15">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full text-left py-7 flex items-start gap-6 group"
                aria-expanded={isOpen}
              >
                <span className="mono text-xs text-ochre tabular-nums pt-2 w-10 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="flex-1 text-bone text-lg lg:text-xl font-normal tracking-[-0.02em] leading-snug">
                  {it.q}
                </h3>
                <span className="mono text-xl text-bone-mute group-hover:text-ochre transition-colors pt-1 shrink-0 w-6 text-right">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              <motion.div
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="pb-8 pl-16 pr-6 text-bone-dim text-[15px] leading-[1.7] max-w-2xl">
                  <p>{it.a}</p>
                  {it.more ? (
                    <a
                      href={it.more.href}
                      className="mt-4 inline-block label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
                    >
                      {it.more.label}
                    </a>
                  ) : null}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CTA() {
  const { t } = useTranslation();
  return (
    <section className="mt-28 border-t border-bone/15 pt-14 flex flex-wrap items-end justify-between gap-10">
      <div className="max-w-xl">
        <p className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute">
          {t("splitwiseAlternative.cta.eyebrow")}
        </p>
        <h2 className="mt-5 text-[clamp(28px,3vw,44px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
          {t("splitwiseAlternative.cta.title")}
        </h2>
        <p className="mt-5 text-bone-dim text-[16px] leading-[1.6]">
          {t("splitwiseAlternative.cta.body")}
        </p>
        <div className="mt-8">
          <StoreBadges size="lg" />
        </div>
      </div>
      <HankoSeal size={56} />
    </section>
  );
}

function SplitwiseAlternativePage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-indigo text-bone">
      <SiteHeader />

      <main className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-14 py-20 md:py-28">
        <EyebrowIndex index="ed.alt" label={t("splitwiseAlternative.eyebrow")} tone="ochre" />
        <h1 className="mt-6 max-w-4xl text-[clamp(40px,5.4vw,84px)] font-semibold tracking-[-0.038em] leading-[0.98] text-bone text-balance">
          {t("splitwiseAlternative.h1")}
        </h1>
        <p className="mt-10 max-w-2xl text-bone-dim text-[17px] leading-[1.62]">
          {t("splitwiseAlternative.lede")}
        </p>

        <Criteria />
        <Apps />
        <CharaCase />
        <FAQ />
        <CTA />
      </main>

      <SiteFooter />
    </div>
  );
}
