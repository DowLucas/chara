import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HankoSeal } from "@/components/HankoSeal";
import { StoreBadges, APP_STORE_URL, PLAY_STORE_URL } from "@/components/StoreBadges";

import sceneDinner from "@/assets/scene-dinner.png";
import sceneRent from "@/assets/scene-rent.png";
import sceneRoom from "@/assets/scene-room.png";
import sceneSelfHost from "@/assets/scene-selfhost.png";
import sceneCta from "@/assets/scene-cta.jpg";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ property: "og:url", content: "/" }],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Chara",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Any",
          description:
            "Open-source, self-hostable bill splitting. No ads, no daily cap, no bank linking.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: LandingPage,
});

const EASE = [0.2, 0.7, 0.2, 1] as const;

/* ============================================================
   Hero — Cinema (design 2b): the print edge to edge, headline
   centred low, everything read against the photograph.
============================================================ */
function Hero() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-claim">
      <div className="relative h-[min(92svh,720px)] min-h-[540px]">
        <img
          src={sceneDinner}
          alt={t("hero.alt")}
          className="absolute inset-0 w-full h-full object-cover select-none"
          style={{ objectPosition: "center 26%" }}
          draggable={false}
          fetchPriority="high"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--indigo) 82%, transparent) 0%, color-mix(in oklab, var(--indigo) 18%, transparent) 30%, color-mix(in oklab, var(--indigo) 55%, transparent) 62%, color-mix(in oklab, var(--indigo) 97%, transparent) 100%)",
          }}
        />

        <div className="absolute left-0 right-0 bottom-[52px] text-center px-6 sm:px-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
            className="mono text-xs font-medium tracking-[0.1em] text-ochre"
          >
            {t("hero.eyebrow")}
          </motion.div>
          <motion.h1
            id="hero-claim"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.14 }}
            className="mt-5 mx-auto max-w-[1080px] font-semibold text-bone text-[clamp(44px,7.4vw,100px)] leading-[0.9] tracking-[-0.052em] text-balance"
          >
            {t("hero.headline")}{" "}
            <span className="text-shu">{t("hero.headlineAccent")}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.24 }}
            className="mt-6 mx-auto max-w-[620px] text-bone-dim text-lg leading-[1.5] text-pretty"
          >
            {t("hero.body")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.34 }}
            className="mt-8 flex flex-wrap gap-3 justify-center"
          >
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-medium px-6 py-[15px] rounded-[6px] bg-shu text-indigo leading-none hover:opacity-90 transition-opacity"
            >
              {t("hero.ctaIos")}
            </a>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[15px] font-medium px-6 py-[15px] rounded-[6px] border-[0.5px] border-bone text-bone leading-none hover:bg-bone hover:text-indigo transition-colors"
            >
              {t("hero.ctaAndroid")}
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Price — one enormous number under the fold (design 2b):
   free stated as the whole feature list.
============================================================ */
function Price() {
  const { t } = useTranslation();
  const rows = t("price.rows", { returnObjects: true }) as Array<{ k: string; v: string }>;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="border-b border-bone/15"
    >
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-20 grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-x-16 gap-y-14 items-center">
        <div>
          <div className="mono font-medium text-bone leading-[0.8] tracking-[-0.06em] text-[clamp(120px,19vw,260px)]">
            {t("price.amount")}
            <span className="text-[0.37em] tracking-[-0.02em] text-shu"> {t("price.unit")}</span>
          </div>
          <div className="mt-4 mono text-xs font-medium tracking-[0.08em] text-bone-mute">
            {t("price.caption")}
          </div>
        </div>
        <div>
          <h2 className="mb-5 text-[clamp(36px,3.7vw,50px)] font-semibold tracking-[-0.04em] leading-[1.02] text-bone">
            {t("price.title")}
          </h2>
          <div className="flex flex-col">
            {rows.map((r, i) => (
              <div
                key={r.k}
                className={`flex justify-between items-baseline py-[15px] ${
                  i < rows.length - 1 ? "border-b-[0.5px] border-bone/15" : ""
                }`}
              >
                <span className="text-[16.5px] leading-none text-bone">{r.k}</span>
                <span className="mono text-sm font-medium leading-none text-moss">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

/* ============================================================
   Section primitive — fade-in on scroll, restrained.
============================================================ */
function Section({
  id,
  children,
  withSeal = true,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  withSeal?: boolean;
  className?: string;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`relative ${className}`}
    >
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-28 lg:py-36 relative">
        {children}
        {withSeal && (
          <div className="mt-20 flex justify-end">
            <HankoSeal size={40} />
          </div>
        )}
      </div>
      <div aria-hidden="true" className="mx-auto max-w-[1320px] px-8 lg:px-14">
        <div className="h-px bg-bone/10" />
      </div>
    </motion.section>
  );
}

/* ============================================================
   Value — four value pillars matching the "get paid back
   without being the nag" job story.
============================================================ */
function Value() {
  const { t } = useTranslation();
  const raw = t("value.items", { returnObjects: true });
  const items = (Array.isArray(raw) ? raw : []) as Array<{
    g: string;
    h: string;
    b: string;
    q: string;
  }>;
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <Section id="values">
      <div className="grid grid-cols-12 gap-8 items-end">
        <div className="col-span-12 lg:col-span-7">
          <div className="mono text-xs uppercase tracking-[0.2em] text-ochre">
            {t("value.eyebrow")}
          </div>
          <h2 className="mt-6 max-w-3xl text-[clamp(40px,5.2vw,80px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone">
            {t("value.titleA")}
            <br />
            {t("value.titleB")}
          </h2>
        </div>
        <p className="col-span-12 lg:col-span-5 text-bone-dim text-[15px] leading-[1.65] max-w-md">
          {t("value.intro")}
        </p>
      </div>

      <div className="mt-20 grid grid-cols-12 gap-8 lg:gap-16 border-t border-bone/15 pt-12">
        {/* List */}
        <ul className="col-span-12 lg:col-span-6 divide-y divide-bone/15">
          {items.map((it, i) => {
            const isActive = i === active;
            return (
              <li key={it.h}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className="group flex w-full items-baseline gap-5 py-6 text-left transition-colors"
                >
                  <span
                    className={`mono text-sm tabular-nums w-8 shrink-0 transition-colors ${
                      isActive ? "text-ochre" : "text-bone-mute"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-2xl lg:text-[28px] tracking-[-0.025em] leading-[1.15] font-medium transition-colors ${
                      isActive
                        ? "text-bone"
                        : "text-bone-mute group-hover:text-bone"
                    }`}
                  >
                    {it.h}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Detail */}
        <div className="col-span-12 lg:col-span-6 lg:sticky lg:top-28 self-start">
          {current ? (
            <div key={current.h} className="border-l border-ochre/60 pl-8">
              <div className="mono text-3xl text-ochre leading-none">
                {current.g}
              </div>
              <p className="mt-8 text-bone text-lg lg:text-xl leading-[1.55] tracking-[-0.01em]">
                {current.b}
              </p>
              <p className="mt-8 mono text-xs uppercase tracking-[0.18em] text-bone-mute">
                {current.q}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}




/* ============================================================
   Feature grid — six capabilities, mono glyph instead of icon
============================================================ */
function Features() {
  const { t } = useTranslation();
  const items = t("features.items", { returnObjects: true }) as Array<{ g: string; h: string; b: string }>;
  return (
    <Section id="features">
      <div className="flex items-baseline justify-between gap-8">
        <h2 className="text-[clamp(32px,3.2vw,44px)] font-semibold tracking-[-0.038em] leading-[1.02] text-bone">
          {t("features.title")}
        </h2>
        <span className="mono text-xs font-medium tracking-[0.06em] text-bone-mute shrink-0">
          {t("features.tag")}
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-bone/15">
        {items.map((it) => (
          <article key={it.h} className="bg-indigo px-8 py-[30px]">
            <div className="mono text-lg font-medium text-ochre leading-none">{it.g}</div>
            <h3 className="mt-3.5 mb-[7px] text-[21px] font-semibold leading-[1.14] tracking-[-0.026em] text-bone">{it.h}</h3>
            <p className="m-0 text-bone-mute text-sm leading-[1.55]">{it.b}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}


/* ============================================================
   Mitate: Hiroshige rain — diagonal energy from type and rules.
============================================================ */
function Belief() {
  const { t } = useTranslation();
  return (
    <section className="relative overflow-hidden border-y border-bone/10 bg-indigo">
      <img
        src={sceneRoom}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover select-none"
        draggable={false}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, color-mix(in oklab, var(--indigo) 82%, transparent) 0%, color-mix(in oklab, var(--indigo) 40%, transparent) 45%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-36 lg:py-56 relative">
        <div className="mono text-xs text-bone-mute flex items-center gap-3 uppercase tracking-[0.18em]"><span className="tabular-nums">ed.0a</span><span aria-hidden="true" className="h-px w-8 bg-current opacity-60" /><span>{t("belief.eyebrow")}</span></div>
        <blockquote className="mt-10 max-w-3xl">
          <p className="text-[clamp(36px,5vw,72px)] font-semibold tracking-[-0.03em] leading-[1.05] text-bone">
            <span className="text-[color:var(--shu)]">“</span>{t("belief.quoteA")}<br />
            {t("belief.quoteB")}<span className="text-[color:var(--shu)]">”</span>
          </p>
          <footer className="mt-12 mono text-xs uppercase tracking-[0.22em] text-bone-mute">
            {t("belief.source")}
          </footer>
        </blockquote>
      </div>
    </section>
  );
}


/* ============================================================
   Comparison table — Chara column tinted ochre.
============================================================ */
function Compare() {
  const { t } = useTranslation();
  const rows = t("compare.rows", { returnObjects: true }) as Array<{ k: string; sw: string; st: string; ch: string }>;


  return (
    <Section id="compare">
      <h2 className="max-w-3xl text-[clamp(40px,5.2vw,80px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone">
        {t("compare.titleA")}<br />{t("compare.titleB")}
      </h2>
      <p className="mt-8 max-w-xl text-bone-dim text-[15px] leading-[1.65]">
        {t("compare.intro")}
      </p>

      <div className="mt-16 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-bone/20">
              <th className="text-left py-5 px-4 mono text-[11px] uppercase tracking-[0.2em] text-bone-mute font-normal w-1/4">{t("compare.colFeature")}</th>
              <th className="text-left py-5 px-4 mono text-[11px] uppercase tracking-[0.2em] text-bone-mute font-normal w-1/4">{t("compare.colSplitwise")}</th>
              <th className="text-left py-5 px-4 mono text-[11px] uppercase tracking-[0.2em] text-bone-mute font-normal w-1/4">{t("compare.colSteven")}</th>
              <th
                className="text-left py-5 px-4 mono text-[11px] uppercase tracking-[0.2em] font-normal w-1/4 keyblock-sumi"
                style={{ background: "var(--ochre)", color: "var(--sumi)" }}
              >
                {t("compare.colChara")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.k} className={i % 2 === 0 ? "" : "bg-bone/[0.02]"}>
                <td className="py-5 px-4 text-bone text-sm align-top border-b border-bone/10">{r.k}</td>
                <td className="py-5 px-4 text-bone-mute text-sm align-top border-b border-bone/10">{r.sw}</td>
                <td className="py-5 px-4 text-bone-mute text-sm align-top border-b border-bone/10">{r.st}</td>
                <td
                  className="py-5 px-4 text-sm align-top font-medium border-x border-b border-sumi/30"
                  style={{ background: "color-mix(in oklab, var(--ochre) 22%, var(--indigo))", color: "var(--bone)" }}
                >
                  {r.ch}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}


/* ============================================================
   Self-host strip — terminal cream card with bokashi edge.
============================================================ */
function SelfHost() {
  const { t } = useTranslation();
  const items = t("selfHost.items", { returnObjects: true }) as Array<{ h: string; b: string }>;
  return (
    <Section id="self-host">
      <div className="grid grid-cols-12 gap-x-8 gap-y-12">
        <div className="col-span-12 lg:col-span-5">
          <h2 className="text-[clamp(40px,5.2vw,80px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone">
            {t("selfHost.titleA")}<br />{t("selfHost.titleB")}
          </h2>
          <ul className="mt-12 space-y-5 text-bone-dim text-[15px] leading-[1.6]">
            {items.map((it, i) => (
              <li key={it.h} className="flex gap-5">
                <span className="mono text-ochre text-xs tabular-nums pt-1 w-8 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span><span className="text-bone">{it.h}</span> {it.b}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-12 lg:col-span-7 lg:col-start-6 self-start lg:mt-10">
          <div className="paper-grain bg-indigo text-bone keyblock-sumi bokashi-edge">
            <div className="flex items-center justify-between border-b border-bone/15 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="block w-2.5 h-2.5 bg-bone/40" />
                <span className="block w-2.5 h-2.5 bg-bone/40" />
                <span className="block w-2.5 h-2.5 bg-bone/40" />
              </div>
              <span className="mono text-[10px] uppercase tracking-[0.2em] text-bone-mute">~/chara</span>
            </div>
            <pre className="px-6 py-8 text-[13px] leading-[1.85] mono whitespace-pre overflow-x-auto"><code><span className="text-bone-mute">$</span> curl -fsSL chara.dev/install | sh
<span className="text-bone-mute">$</span> cd chara
<span className="text-bone-mute">$</span> docker compose up -d

<span className="text-ochre">✓</span> postgres        {t("selfHost.terminalReady")}
<span className="text-ochre">✓</span> chara-web       {t("selfHost.terminalReady")}  :3000
<span className="text-ochre">✓</span> chara-worker    {t("selfHost.terminalReady")}
<span className="text-ochre">✓</span> minio           {t("selfHost.terminalReady")}  :9000

<span className="text-bone-mute">→</span> {t("selfHost.terminalOpen")}  http://localhost:3000
</code></pre>
          </div>
        </div>
      </div>
    </Section>
  );
}


/* ============================================================
   FAQ — hand-set accordion. + / − toggle, sumi rules.
============================================================ */
function FAQ() {
  const { t } = useTranslation();
  const items = t("faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-4">
          <h2 className="text-[clamp(40px,5.2vw,72px)] font-semibold tracking-[-0.035em] leading-[0.98] text-bone">
            {t("faq.titleA")}<br />{t("faq.titleB")}
          </h2>
        </div>

        <div className="col-span-12 lg:col-span-8 border-t border-bone/15">
          {items.map((it, i) => {
            const isOpen = open === i;
            return (
              <div key={it.q} className="border-b border-bone/15">
                <button
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


/* ============================================================
   Final CTA — vermillion seal-block.
============================================================ */
function FinalCTA() {
  const { t } = useTranslation();
  return (
    <section
      id="download"
      className="relative bg-cover bg-center"
      style={{ background: `var(--shu) url(${sceneCta}) center/cover no-repeat` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--shu)]/85 via-[var(--shu)]/55 to-transparent pointer-events-none" />
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-32 lg:py-48 relative">
        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-12 lg:col-span-8">
            <div className="mono text-[11px] uppercase tracking-[0.22em] text-indigo/70">{t("cta.pre")}</div>
            <h2 className="mt-6 text-[clamp(48px,7vw,112px)] font-semibold tracking-[-0.04em] leading-[0.94] text-indigo">
              {t("cta.titleA")}<br />
              {t("cta.titleB")}
            </h2>
            <div className="mt-10">
              <StoreBadges size="lg" />
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 items-start lg:items-end" />
        </div>
      </div>
    </section>
  );
}

function Diptych() {
  const { t } = useTranslation();
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative border-y border-bone/10"
    >
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-24 lg:py-32">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10 items-end">
          <div className="col-span-12 lg:col-span-4">
            <h2 className="text-[clamp(32px,3.6vw,52px)] font-semibold tracking-[-0.03em] leading-[1.02] text-bone">
              {t("diptych.title")}
            </h2>
            <p className="mt-6 text-bone-dim text-[15px] leading-[1.65] max-w-md">
              {t("diptych.body")}
            </p>
            <div className="mt-10 mono text-[10px] uppercase tracking-[0.22em] text-bone-mute">
              {t("diptych.caption")}
            </div>
          </div>
          <figure className="col-span-12 lg:col-span-8 keyblock-sumi bg-indigo">
            <img
              src={sceneRent}
              alt={t("diptych.alt")}
              className="block w-full h-auto select-none"
              draggable={false}
            />
          </figure>
        </div>
      </div>
    </motion.section>
  );
}

function SelfHostPlate() {
  const { t } = useTranslation();
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="relative border-y border-bone/10"
    >
      <div className="mx-auto max-w-[1320px] px-8 lg:px-14 py-24 lg:py-32">
        <div className="grid grid-cols-12 gap-x-8 gap-y-10 items-end">
          <div className="col-span-12 lg:col-span-4">
            <h2 className="text-[clamp(32px,3.6vw,52px)] font-semibold tracking-[-0.03em] leading-[1.02] text-bone">
              {t("selfHostPlate.title")}
            </h2>
            <p className="mt-6 text-bone-dim text-[15px] leading-[1.65] max-w-md">
              {t("selfHostPlate.body")}
            </p>
            <div className="mt-10 mono text-[10px] uppercase tracking-[0.22em] text-bone-mute">
              {t("selfHostPlate.caption")}
            </div>
          </div>
          <figure className="col-span-12 lg:col-span-8 keyblock-sumi bg-indigo">
            <img
              src={sceneSelfHost}
              alt={t("selfHostPlate.alt")}
              className="block w-full h-auto select-none"
              draggable={false}
            />
          </figure>
        </div>
      </div>
    </motion.section>
  );
}


function LandingPage() {
  return (
    <div className="min-h-screen bg-indigo text-bone">
      <SiteHeader />
      <Hero />
      <Price />
      <Value />
      <Features />
      <Diptych />
      <Belief />
      <Compare />
      <SelfHost />
      <SelfHostPlate />
      <FAQ />
      <FinalCTA />
      <SiteFooter />
    </div>
  );
}
