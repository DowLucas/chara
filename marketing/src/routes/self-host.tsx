import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { absoluteUrl, canonicalLink, canonicalMeta, SITE_URL } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { EyebrowIndex } from "@/components/EyebrowIndex";
import { HankoSeal } from "@/components/HankoSeal";
import { StoreBadges } from "@/components/StoreBadges";
import { selfHost } from "@/i18n/pages/self-host";

/* ============================================================
   /self-host — for the reader who opens the compose file before
   the copy. Every command, port, variable and file name below is
   literal and taken from deploy/ in the repo; the prose lives in
   i18n/pages/self-host.ts.
============================================================ */

const GITHUB_URL = "https://github.com/DowLucas/chara";
const README_URL = "https://github.com/DowLucas/chara/blob/main/deploy/README.md";

/* Verbatim from deploy/README.md. */
const INSTALL = [
  "git clone https://github.com/DowLucas/chara.git",
  "cd chara/deploy",
  "./setup.sh",
];
const MANUAL = [
  "cp .env.example .env",
  "docker compose up -d",
  "curl http://localhost:8080/api/health/readiness",
];
const BACKUP =
  "docker run --rm -v deploy_postgres_data:/v -v $PWD:/b alpine tar czf /b/postgres.tgz -C /v .";

const SERVICES = [
  { id: "postgres", name: "chara-postgres", image: "postgres:16-alpine" },
  { id: "minio", name: "chara-minio", image: "minio/minio" },
  { id: "api", name: "chara-api", image: "ghcr.io/dowlucas/chara-backend" },
] as const;

const EVERYDAY = [
  { id: "logs", cmd: "docker compose logs -f" },
  { id: "update", cmd: "docker compose pull && docker compose up -d" },
  { id: "stop", cmd: "docker compose down" },
  { id: "reconfigure", cmd: "./setup.sh" },
  { id: "reset", cmd: "docker compose down -v" },
] as const;

const ADDONS = [
  { id: "caddy", file: "docker-compose.caddy.yml" },
  { id: "build", file: "docker-compose.build.yml" },
] as const;

const PATH = "/self-host";
const EASE = [0.2, 0.7, 0.2, 1] as const;

// The FAQ markup is derived from the array the page renders, so the two can
// never disagree. head() runs before i18n picks a language, so it reads the
// English bundle directly — the same object t() resolves on an English page.
const FAQ_ITEMS = selfHost.en.faq.items;

export const Route = createFileRoute("/self-host")({
  head: () => ({
    meta: [
      { title: selfHost.en.meta.title },
      { name: "description", content: selfHost.en.meta.description },
      { property: "og:title", content: selfHost.en.meta.title },
      { property: "og:description", content: selfHost.en.meta.description },
      { name: "twitter:title", content: selfHost.en.meta.title },
      { name: "twitter:description", content: selfHost.en.meta.description },
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
                  name: "Self-host",
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
  component: SelfHostPage,
});

/* ============================================================
   Primitives — the landing page's rhythm, without its seal on
   every block. One hanko, at the end, like a print.
============================================================ */
function Section({
  id,
  children,
  labelledBy,
}: {
  id?: string;
  children: React.ReactNode;
  labelledBy?: string;
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

/* The terminal block from the landing page's self-host strip, minus the
   bokashi edge (the stylesheet reserves that for one use). */
function Terminal({ lines, copyText }: { lines: readonly string[]; copyText?: string }) {
  return (
    <div className="paper-grain bg-indigo text-bone keyblock-sumi">
      <div className="flex items-center justify-between border-b border-bone/15 px-5 py-3">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="block w-2.5 h-2.5 bg-bone/40" />
          <span className="block w-2.5 h-2.5 bg-bone/40" />
          <span className="block w-2.5 h-2.5 bg-bone/40" />
        </div>
        {copyText ? <CopyButton text={copyText} /> : null}
      </div>
      <pre className="px-6 py-7 text-[13px] leading-[1.85] mono whitespace-pre overflow-x-auto">
        <code>
          {lines.map((line) => (
            <div key={line}>
              <span className="text-bone-mute">$</span> {line}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        );
      }}
      aria-label={t("selfHost.install.copyLabel")}
      className="label text-[10px] uppercase tracking-[0.2em] text-bone-mute hover:text-bone transition-colors"
    >
      {copied ? t("selfHost.install.copied") : t("selfHost.install.copy")}
    </button>
  );
}

/* ============================================================
   Sections
============================================================ */
function Hero() {
  const { t } = useTranslation();
  return (
    <header className="pt-20 md:pt-28 pb-16">
      <EyebrowIndex index="ed.sh" label={t("selfHost.hero.eyebrow")} tone="ochre" />
      <h1 className="mt-6 max-w-4xl text-[clamp(44px,7vw,104px)] font-semibold tracking-[-0.045em] leading-[0.94] text-bone">
        {t("selfHost.hero.title")}
      </h1>
      <p className="mt-10 max-w-2xl text-bone-dim text-[17px] leading-[1.62]">
        {t("selfHost.hero.lede")}
      </p>
    </header>
  );
}

function Install() {
  const { t } = useTranslation();
  const modes = t("selfHost.install.modes", { returnObjects: true }) as Array<{
    h: string;
    b: string;
  }>;

  return (
    <Section id="install" labelledBy="install-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-12">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="install-heading">{t("selfHost.install.title")}</H2>
          <p className="mt-8 max-w-md text-bone-dim text-[15px] leading-[1.65]">
            {t("selfHost.install.body")}
          </p>
        </div>
        <div className="col-span-12 lg:col-span-7">
          <Terminal lines={INSTALL} copyText={INSTALL.join("\n")} />
        </div>
      </div>

      <div className="mt-20 border-t border-bone/15 pt-12">
        <p className="label text-[11px] uppercase tracking-[0.2em] text-ochre">
          {t("selfHost.install.questionsTitle")}
        </p>

        {/* Q1 — reverse-proxy mode: the three answers, side by side */}
        <h3 className="mt-6 text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.03em] leading-[1.1] text-bone">
          <span className="mono text-ochre text-[0.7em] tabular-nums mr-4">01</span>
          {t("selfHost.install.reachTitle")}
        </h3>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-px bg-bone/15">
          {modes.map((m, i) => (
            <article key={m.h} className="bg-indigo px-7 py-7">
              <div className="mono text-lg font-medium text-ochre leading-none">
                {String.fromCharCode(97 + i)}
              </div>
              <h4 className="mt-4 text-[19px] font-semibold leading-[1.15] tracking-[-0.024em] text-bone">
                {m.h}
              </h4>
              <p className="mt-2 text-bone-mute text-sm leading-[1.6]">{m.b}</p>
            </article>
          ))}
        </div>

        {/* Q2, Q3 */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          <div>
            <h3 className="text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.03em] leading-[1.1] text-bone">
              <span className="mono text-ochre text-[0.7em] tabular-nums mr-4">02</span>
              {t("selfHost.install.emailTitle")}
            </h3>
            <p className="mt-5 text-bone-dim text-[15px] leading-[1.65]">
              {t("selfHost.install.emailBody")}
            </p>
          </div>
          <div>
            <h3 className="text-[clamp(22px,2.2vw,30px)] font-semibold tracking-[-0.03em] leading-[1.1] text-bone">
              <span className="mono text-ochre text-[0.7em] tabular-nums mr-4">03</span>
              {t("selfHost.install.geminiTitle")}
            </h3>
            <p className="mt-5 text-bone-dim text-[15px] leading-[1.65]">
              {t("selfHost.install.geminiBody")}
            </p>
          </div>
        </div>

        <p className="mt-12 label text-[11px] uppercase tracking-[0.16em] text-bone-mute">
          {t("selfHost.install.after")}
        </p>
      </div>
    </Section>
  );
}

function Stack() {
  const { t } = useTranslation();
  return (
    <Section id="stack" labelledBy="stack-heading">
      <H2 id="stack-heading">{t("selfHost.stack.title")}</H2>
      <p className="mt-6 max-w-xl text-bone-dim text-[15px] leading-[1.65]">
        {t("selfHost.stack.intro")}
      </p>

      <div className="mt-12 border-t border-bone/15">
        {SERVICES.map((s) => (
          <div
            key={s.id}
            className="grid grid-cols-12 gap-x-8 gap-y-3 py-7 border-b border-bone/15"
          >
            <div className="col-span-12 md:col-span-4">
              <div className="mono text-bone text-[15px]">{s.name}</div>
              <div className="mt-1.5 mono text-[12px] text-bone-mute break-all">{s.image}</div>
            </div>
            <p className="col-span-12 md:col-span-8 text-bone-dim text-[15px] leading-[1.65] max-w-2xl">
              {t(`selfHost.stack.services.${s.id}`)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-20 grid grid-cols-12 gap-x-8 gap-y-12">
        <div className="col-span-12 lg:col-span-5">
          <h3 className="text-[clamp(26px,2.8vw,40px)] font-semibold tracking-[-0.032em] leading-[1.05] text-bone">
            {t("selfHost.stack.appsTitle")}
          </h3>
          <p className="mt-6 max-w-md text-bone-dim text-[15px] leading-[1.65]">
            {t("selfHost.stack.appsBody")}
          </p>
          <StoreBadges size="sm" className="mt-8" />
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <p className="label text-[11px] uppercase tracking-[0.2em] text-ochre">
            {t("selfHost.stack.everydayTitle")}
          </p>
          <dl className="mt-6 border-t border-bone/15">
            {EVERYDAY.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-12 gap-x-6 gap-y-1 py-4 border-b border-bone/15 items-baseline"
              >
                <dt className="col-span-12 sm:col-span-5 text-bone-dim text-sm leading-[1.5]">
                  {t(`selfHost.stack.everyday.${row.id}`)}
                </dt>
                <dd className="col-span-12 sm:col-span-7 mono text-[13px] text-bone break-all">
                  {row.cmd}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  );
}

function Manual() {
  const { t } = useTranslation();
  return (
    <Section id="manual" labelledBy="manual-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-12">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="manual-heading">{t("selfHost.manual.title")}</H2>
          <p className="mt-8 max-w-md text-bone-dim text-[15px] leading-[1.65]">
            {t("selfHost.manual.body")}
          </p>

          <p className="mt-12 label text-[11px] uppercase tracking-[0.2em] text-ochre">
            {t("selfHost.manual.addonsTitle")}
          </p>
          <ul className="mt-5 space-y-5">
            {ADDONS.map((a) => (
              <li key={a.id}>
                <div className="mono text-[13px] text-bone">{a.file}</div>
                <p className="mt-1.5 text-bone-mute text-sm leading-[1.6] max-w-md">
                  {t(`selfHost.manual.addons.${a.id}`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-12 lg:col-span-7 self-start">
          <Terminal lines={MANUAL} copyText={MANUAL.join("\n")} />
        </div>
      </div>
    </Section>
  );
}

function Limits() {
  const { t } = useTranslation();
  const items = t("selfHost.limits.items", { returnObjects: true }) as Array<{
    h: string;
    b: string;
  }>;
  return (
    <Section id="limits" labelledBy="limits-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-10">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="limits-heading">{t("selfHost.limits.title")}</H2>
          <p className="mt-6 max-w-md text-bone-dim text-[15px] leading-[1.65]">
            {t("selfHost.limits.intro")}
          </p>
        </div>
        <ul className="col-span-12 lg:col-span-6 lg:col-start-7 space-y-6 text-bone-dim text-[15px] leading-[1.6]">
          {items.map((it, i) => (
            <li key={it.h} className="flex gap-5">
              <span className="mono text-shu text-xs tabular-nums pt-1 w-8 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="text-bone">{it.h}</span> {it.b}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Source() {
  const { t } = useTranslation();
  return (
    <Section id="source" labelledBy="source-heading">
      <div className="grid grid-cols-12 gap-x-8 gap-y-8">
        <div className="col-span-12 lg:col-span-5">
          <H2 id="source-heading">{t("selfHost.source.title")}</H2>
          <div className="mt-8 mono text-[13px] uppercase tracking-[0.2em] text-ochre">
            AGPL-3.0
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <p className="text-bone-dim text-[15px] leading-[1.65]">{t("selfHost.source.body")}</p>
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3">
            <a
              href={GITHUB_URL}
              className="label text-[11px] uppercase tracking-[0.2em] text-ochre hover:text-bone transition-colors"
            >
              {t("selfHost.source.link")}
            </a>
            <a
              href={README_URL}
              className="label text-[11px] uppercase tracking-[0.2em] text-bone-mute hover:text-bone transition-colors"
            >
              {t("selfHost.source.readme")}
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}

function FAQ() {
  const { t } = useTranslation();
  const items = t("selfHost.faq.items", { returnObjects: true }) as Array<{ q: string; a: string }>;
  const [open, setOpen] = useState<number | null>(0);
  const last = items.length - 1;

  return (
    <Section id="faq" labelledBy="faq-heading">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-4">
          <H2 id="faq-heading">{t("selfHost.faq.title")}</H2>
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
                    <p>{it.a}</p>
                    {/* The backup answer ends by pointing at this line. */}
                    {i === last ? (
                      <pre className="mt-5 mono text-[12px] leading-[1.7] text-bone whitespace-pre-wrap break-all">
                        <code>
                          <span className="text-bone-mute">$</span> {BACKUP}
                        </code>
                      </pre>
                    ) : null}
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
          {t("selfHost.cta.eyebrow")}
        </p>
        <h2 className="mt-5 text-[clamp(32px,3.6vw,52px)] font-semibold tracking-[-0.035em] leading-[1.02] text-bone">
          {t("selfHost.cta.title")}
        </h2>
        <p className="mt-5 text-bone-dim text-[16px] leading-[1.6]">{t("selfHost.cta.body")}</p>
        <div className="mt-8">
          <StoreBadges />
        </div>
      </div>
      <HankoSeal size={56} />
    </section>
  );
}

function SelfHostPage() {
  return (
    <div className="min-h-screen bg-indigo text-bone">
      <SiteHeader />
      <main className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-14">
        <Hero />
        <Install />
        <Stack />
        <Manual />
        <Limits />
        <Source />
        <FAQ />
        <CTA />
      </main>
      <SiteFooter />
    </div>
  );
}
