import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { absoluteUrl, canonicalLink, canonicalMeta, SITE_URL } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HankoSeal } from "@/components/HankoSeal";
import { StoreBadges } from "@/components/StoreBadges";
import { splitwiseDailyLimit } from "@/i18n/pages/splitwise-daily-limit";

/* ============================================================
   /splitwise-daily-limit — the explainer. The reader is annoyed
   and mid-decision, so the answer is the first paragraph and the
   pitch waits until the third section. No count and no price
   appear anywhere: both change, and a stale figure would cost
   the page the trust it exists to earn.
============================================================ */

const PATH = "/splitwise-daily-limit";
const EASE = [0.2, 0.7, 0.2, 1] as const;

// Derived from the array the page renders — never a second copy.
const FAQ_ITEMS = splitwiseDailyLimit.en.faq.items;

export const Route = createFileRoute("/splitwise-daily-limit")({
  head: () => ({
    meta: [
      { title: splitwiseDailyLimit.en.meta.title },
      { name: "description", content: splitwiseDailyLimit.en.meta.description },
      { property: "og:title", content: splitwiseDailyLimit.en.meta.title },
      { property: "og:description", content: splitwiseDailyLimit.en.meta.description },
      { name: "twitter:title", content: splitwiseDailyLimit.en.meta.title },
      { name: "twitter:description", content: splitwiseDailyLimit.en.meta.description },
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
                  name: splitwiseDailyLimit.en.hero.title,
                  item: absoluteUrl(PATH),
                },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ_ITEMS.map((it) => ({
                "@type": "Question",
                name: it.q,
                acceptedAnswer: { "@type": "Answer", text: it.a },
              })),
            },
          ],
        }),
      },
    ],
  }),
  component: DailyLimitPage,
});

function Section({
  id,
  labelledBy,
  children,
}: {
  id?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      aria-labelledby={labelledBy}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="border-t border-bone/10 py-20 lg:py-28"
    >
      {children}
    </motion.section>
  );
}

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-[clamp(32px,3.6vw,52px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone"
    >
      {children}
    </h2>
  );
}

/* The numbered list from the landing page's switching section: a mono index,
   a bone lead-in, a dim body. */
function NumberedList({
  items,
  tone = "ochre",
}: {
  items: Array<{ h: string; b: string }>;
  tone?: "ochre" | "shu";
}) {
  return (
    <ol className="space-y-6 text-bone-dim text-[15px] leading-[1.6]">
      {items.map((it, i) => (
        <li key={it.h} className="flex gap-5">
          <span
            className={`mono text-xs tabular-nums pt-1 w-8 shrink-0 ${tone === "shu" ? "text-shu" : "text-ochre"}`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <span>
            <span className="text-bone">{it.h}</span> {it.b}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <header className="pt-20 md:pt-28 pb-16">
      <p className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute">
        {t("splitwiseDailyLimit.hero.eyebrow")}
      </p>
      <h1 className="mt-6 max-w-4xl text-[clamp(40px,5.4vw,84px)] font-semibold tracking-[-0.038em] leading-[0.98] text-bone text-balance">
        {t("splitwiseDailyLimit.hero.title")}
      </h1>
      {/* The answer. Set at reading size, not lede size: it is the content. */}
      <p className="mt-10 max-w-2xl text-bone text-[clamp(18px,1.6vw,21px)] leading-[1.5]">
        {t("splitwiseDailyLimit.hero.answer")}
      </p>
    </header>
  );
}

function Shape() {
  const { t } = useTranslation();
  const items = t("splitwiseDailyLimit.shape.items", { returnObjects: true }) as Array<{
    h: string;
    b: string;
  }>;
  return (
    <Section id="shape" labelledBy="shape-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-10">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="shape-heading">{t("splitwiseDailyLimit.shape.title")}</H2>
        </div>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <NumberedList items={items} tone="shu" />
          <p className="mt-10 label text-[11px] uppercase tracking-[0.16em] text-bone-mute leading-[1.7]">
            {t("splitwiseDailyLimit.shape.checkNote")}
          </p>
        </div>
      </div>
    </Section>
  );
}

function Fair() {
  const { t } = useTranslation();
  return (
    <Section id="fair" labelledBy="fair-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-8">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="fair-heading">{t("splitwiseDailyLimit.fair.title")}</H2>
        </div>
        <blockquote className="col-span-12 lg:col-span-6 lg:col-start-7 border-l-2 border-ochre pl-8">
          <p className="text-bone text-[19px] leading-[1.5]">
            {t("splitwiseDailyLimit.fair.body")}
          </p>
        </blockquote>
      </div>
    </Section>
  );
}

function Options() {
  const { t } = useTranslation();
  const items = t("splitwiseDailyLimit.options.items", { returnObjects: true }) as Array<{
    h: string;
    b: string;
  }>;
  return (
    <Section id="options" labelledBy="options-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-10">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="options-heading">{t("splitwiseDailyLimit.options.title")}</H2>
        </div>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <NumberedList items={items} />
          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-3">
            <Link
              to="/splitwise-alternative"
              className="label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
            >
              {t("splitwiseDailyLimit.options.linkAlternatives")}
            </Link>
            <Link
              to="/vs/$slug"
              params={{ slug: "splitwise" }}
              className="label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
            >
              {t("splitwiseDailyLimit.options.linkVersus")}
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FAQ() {
  const { t } = useTranslation();
  const items = t("splitwiseDailyLimit.faq.items", { returnObjects: true }) as Array<{
    q: string;
    a: string;
  }>;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" labelledBy="faq-heading">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-4">
          <H2 id="faq-heading">{t("splitwiseDailyLimit.faq.title")}</H2>
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
                  <span className="flex-1 text-bone text-lg lg:text-xl tracking-[-0.02em] leading-snug">
                    {it.q}
                  </span>
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
      </div>
    </Section>
  );
}

function CTA() {
  const { t } = useTranslation();
  return (
    <section className="border-t border-bone/15 py-20 flex flex-wrap items-end justify-between gap-10">
      <div className="max-w-xl">
        <p className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute">
          {t("splitwiseDailyLimit.cta.eyebrow")}
        </p>
        <h2 className="mt-5 text-[clamp(32px,3.6vw,52px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
          {t("splitwiseDailyLimit.cta.title")}
        </h2>
        <p className="mt-5 text-bone-dim text-[16px] leading-[1.6]">
          {t("splitwiseDailyLimit.cta.body")}
        </p>
        <div className="mt-8">
          <StoreBadges />
        </div>
      </div>
      <HankoSeal size={56} />
    </section>
  );
}

function DailyLimitPage() {
  return (
    <div className="min-h-screen bg-indigo text-bone">
      <SiteHeader />
      <main className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-14">
        <Hero />
        <Shape />
        <Fair />
        <Options />
        <FAQ />
        <CTA />
      </main>
      <SiteFooter />
    </div>
  );
}
