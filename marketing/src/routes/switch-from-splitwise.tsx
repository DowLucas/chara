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
import { switchFromSplitwise } from "@/i18n/pages/switch-from-splitwise";

/* ============================================================
   /switch-from-splitwise — the migration page.

   The reader is mid-switch, so this is procedure, not persuasion:
   three steps that mirror the app's importer, then a plain list of
   what comes over and what does not. The steps array is the single
   source for both the rendered list and the HowTo JSON-LD.
============================================================ */

const PATH = "/switch-from-splitwise";
const EASE = [0.2, 0.7, 0.2, 1] as const;

type Step = { h: string; b: string };
type FaqItem = { q: string; a: string };

export const Route = createFileRoute("/switch-from-splitwise")({
  head: () => {
    // The server renders in English (see i18n/config.ts), so the crawler-facing
    // head is built from the same `en` bundle the page renders with.
    const m = switchFromSplitwise.en;
    const steps = m.howTo.steps as Step[];
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
                    item: absoluteUrl("/splitwise-alternative"),
                  },
                  {
                    "@type": "ListItem",
                    position: 3,
                    name: "Switch from Splitwise",
                    item: absoluteUrl(PATH),
                  },
                ],
              },
              {
                "@type": "HowTo",
                name: m.h1,
                description: m.meta.description,
                step: steps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: s.h,
                  text: s.b,
                })),
              },
            ],
          }),
        },
      ],
    };
  },
  component: SwitchFromSplitwisePage,
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

function HowTo() {
  const { t } = useTranslation();
  const steps = t("switchFromSplitwise.howTo.steps", { returnObjects: true }) as Step[];
  return (
    <section className="mt-24" aria-labelledby="howto-title">
      <SectionTitle
        eyebrow={t("switchFromSplitwise.howTo.eyebrow")}
        title={t("switchFromSplitwise.howTo.title")}
      />
      <ol className="mt-14 border-t border-bone/15">
        {steps.map((s, i) => (
          <li key={s.h} className="grid grid-cols-12 gap-x-8 gap-y-4 py-10 border-b border-bone/15">
            <div className="col-span-12 lg:col-span-5 flex gap-5">
              <span className="mono text-sm text-ochre tabular-nums pt-2 w-8 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[clamp(22px,2.4vw,32px)] font-semibold tracking-[-0.03em] leading-[1.08] text-bone">
                {s.h}
              </h3>
            </div>
            <p className="col-span-12 lg:col-span-6 lg:col-start-7 text-bone-dim text-[16px] leading-[1.65]">
              {s.b}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WhatMoves() {
  const { t } = useTranslation();
  const comes = t("switchFromSplitwise.whatMoves.comes.items", { returnObjects: true }) as string[];
  const stays = t("switchFromSplitwise.whatMoves.stays.items", { returnObjects: true }) as string[];
  const columns = [
    {
      title: t("switchFromSplitwise.whatMoves.comes.title"),
      items: comes,
      glyph: "✓",
      color: "var(--moss)",
    },
    {
      title: t("switchFromSplitwise.whatMoves.stays.title"),
      items: stays,
      glyph: "✕",
      color: "var(--shu)",
    },
  ];
  return (
    <section className="mt-28" aria-labelledby="moves-title">
      <SectionTitle
        eyebrow={t("switchFromSplitwise.whatMoves.eyebrow")}
        title={t("switchFromSplitwise.whatMoves.title")}
      />
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-px bg-bone/15">
        {columns.map((col) => (
          <div key={col.title} className="bg-indigo px-8 py-9">
            <h3 className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute font-medium">
              {col.title}
            </h3>
            <ul className="mt-6 space-y-4">
              {col.items.map((item) => (
                <li key={item} className="flex gap-4 text-bone-dim text-[15px] leading-[1.6]">
                  <span
                    className="mono text-[13px] leading-[1.6] shrink-0"
                    style={{ color: col.color }}
                    aria-hidden
                  >
                    {col.glyph}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 max-w-2xl text-bone-mute text-[15px] leading-[1.65]">
        {t("switchFromSplitwise.whatMoves.note")}
      </p>
    </section>
  );
}

/* Same accordion as the landing page's FAQ — + / − toggle, sumi rules. */
function FAQ() {
  const { t } = useTranslation();
  const items = t("switchFromSplitwise.faq.items", { returnObjects: true }) as FaqItem[];
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mt-28 grid grid-cols-12 gap-8" aria-labelledby="faq-title">
      <div className="col-span-12 lg:col-span-4">
        <h2
          id="faq-title"
          className="text-[clamp(36px,4.6vw,64px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone"
        >
          {t("switchFromSplitwise.faq.titleA")}
          <br />
          {t("switchFromSplitwise.faq.titleB")}
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
                  {it.a}
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
          {t("switchFromSplitwise.cta.eyebrow")}
        </p>
        <h2 className="mt-5 text-[clamp(28px,3vw,44px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
          {t("switchFromSplitwise.cta.title")}
        </h2>
        <p className="mt-5 text-bone-dim text-[16px] leading-[1.6]">
          {t("switchFromSplitwise.cta.body")}
        </p>
        <div className="mt-8">
          <StoreBadges size="lg" />
        </div>
        <Link
          to="/splitwise-alternative"
          className="mt-8 inline-block label text-[11px] uppercase tracking-[0.2em] text-bone-mute hover:text-ochre transition-colors"
        >
          {t("switchFromSplitwise.cta.backLink")}
        </Link>
      </div>
      <HankoSeal size={56} />
    </section>
  );
}

function SwitchFromSplitwisePage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-indigo text-bone">
      <SiteHeader />

      <main className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-14 py-20 md:py-28">
        <EyebrowIndex index="ed.sw" label={t("switchFromSplitwise.eyebrow")} tone="ochre" />
        <h1 className="mt-6 max-w-4xl text-[clamp(40px,5.4vw,84px)] font-semibold tracking-[-0.038em] leading-[0.98] text-bone text-balance">
          {t("switchFromSplitwise.h1")}
        </h1>
        <p className="mt-10 max-w-2xl text-bone-dim text-[17px] leading-[1.62]">
          {t("switchFromSplitwise.lede")}
        </p>

        <HowTo />
        <WhatMoves />
        <FAQ />
        <CTA />
      </main>

      <SiteFooter />
    </div>
  );
}
