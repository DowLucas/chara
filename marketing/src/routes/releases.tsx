import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { EyebrowIndex } from "@/components/EyebrowIndex";
import { HankoSeal } from "@/components/HankoSeal";
import { RegistrationMark } from "@/components/RegistrationMark";

export const Route = createFileRoute("/releases")({
  head: () => ({
    meta: [
      { title: "Chara — Release notes" },
      {
        name: "description",
        content:
          "The Chara release series — plate by plate. What shipped, when, and why it matters.",
      },
      { property: "og:title", content: "Chara — Release notes" },
      {
        property: "og:description",
        content:
          "A vertical series of dated plates. Each release, top to bottom, newest first.",
      },
      { property: "og:url", content: "/releases" },
    ],
    links: [{ rel: "canonical", href: "/releases" }],
  }),
  component: ReleasesPage,
});

type Release = {
  plate: string;
  version: string;
  date: string;
  title?: string;
  headline: string;
  bullets: string[];
};

const releases: Release[] = [
  {
    plate: "pl.09",
    version: "v1.3.0",
    date: "July 2026",
    title: "Home at a glance",
    headline: "Your balance, on the home screen.",
    bullets: [
      "Home-screen widgets for iOS and Android — per-currency balance and biggest open groups at a glance, without opening the app.",
      "Tap a group on the widget to jump straight in, or use the shortcut to add an expense.",
      "Smarter receipt splitting: assign scanned items to people, and “split the rest” evenly handles deposits (pant), rounding, and anything left over.",
      "A cleaner, calmer items screen when splitting a scanned receipt.",
    ],
  },
  {
    plate: "pl.08",
    version: "v1.2.0 – 1.2.1",
    date: "July 2026",
    title: "Set it and forget it",
    headline: "The bills that come back, come back on their own.",
    bullets: [
      "Recurring expenses — mark an expense to repeat automatically.",
      "Saved default splits — remember how a group usually divides things.",
      "Settle-up reminders — a gentle nudge when balances are outstanding.",
    ],
  },
  {
    plate: "pl.07",
    version: "v1.1.0",
    date: "July 2026",
    headline: "Smaller frictions, quietly filed off.",
    bullets: [
      "Edit an expense’s date after the fact.",
      "Simplified sign-in — removed the security-code app lock.",
    ],
  },
  {
    plate: "pl.06",
    version: "v1.0.13",
    date: "July 2026",
    headline: "Categories that know your group.",
    bullets: [
      "Group-scoped expense categories.",
      "AI and offline category suggestions.",
    ],
  },
  {
    plate: "pl.05",
    version: "v1.0.9 – 1.0.12",
    date: "June – July 2026",
    title: "Notifications & control",
    headline: "The app tells you. You decide.",
    bullets: [
      "Push notifications for group activity.",
      "Payer picker, spending stats, expense filtering, and draft expenses.",
      "Currency-conversion and receipt-scanning fixes.",
    ],
  },
  {
    plate: "pl.04",
    version: "v1.0.8",
    date: "June 2026",
    headline: "Old groups, out of the way.",
    bullets: [
      "Archive groups — excluded from totals, with a dedicated Archived groups screen.",
    ],
  },
  {
    plate: "pl.03",
    version: "v1.0.4 – 1.0.7",
    date: "June 2026",
    headline: "Stay signed in. Stay safe.",
    bullets: [
      "Long-lived sessions with silent, secure token refresh.",
      "Sturdier hosted-server handling.",
      "OS-aware invite links.",
    ],
  },
  {
    plate: "pl.02",
    version: "v1.0.0 – 1.0.3",
    date: "May – June 2026",
    title: "Chara launches",
    headline: "The first impression.",
    bullets: [
      "Sign in with Apple & Google.",
      "Group expenses with the guided expense wizard.",
      "Multi-currency with locked-in FX snapshots.",
      "AI receipt scanning (OCR).",
      "Swish settle-up, avatars, and an activity feed.",
      "Account deletion and full App Store / Play Store readiness.",
    ],
  },
];

function ReleasesPage() {
  const latest = releases[0];
  const rest = releases.slice(1);

  return (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />

      <main className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-14 py-20 md:py-28">
        {/* Series header */}
        <header className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-12 lg:col-span-8">
            <EyebrowIndex index="ed.rn" label="The print series" tone="ochre" />
            <h1 className="mt-6 text-5xl md:text-7xl font-semibold tracking-[-0.035em] leading-[0.96] text-bone break-words">
              Release notes.
            </h1>
            <p className="mt-8 max-w-xl text-bone-dim text-[15px] leading-[1.7]">
              A vertical series of dated plates. Each release is one
              impression — pulled, dated, and filed. Read top to bottom,
              newest first.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-4 flex lg:justify-end">
            <RegistrationMark />
          </div>
        </header>

        {/* Latest plate — ochre highlight, hanko */}
        <section className="mt-20">
          <PlateCard release={latest} highlight />
        </section>

        {/* Older plates */}
        <section className="mt-14 space-y-14">
          {rest.map((r) => (
            <PlateCard key={r.version} release={r} />
          ))}
        </section>

        <footer className="mt-24 flex items-end justify-between">
          <div className="mono text-xs uppercase tracking-[0.2em] text-bone-mute">
            Chara · Stockholm
          </div>
          <HankoSeal size={48} />
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}

function PlateCard({
  release,
  highlight = false,
}: {
  release: Release;
  highlight?: boolean;
}) {
  return (
    <article
      className={`paper-grain relative bg-indigo text-bone keyblock-sumi ${
        highlight ? "" : ""
      }`}
    >
      {highlight && (
        <div className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 z-10">
          <HankoSeal size={72} />
        </div>
      )}

      <div className="px-5 sm:px-8 md:px-14 lg:px-20 py-12 md:py-16 relative z-0">
        {/* Eyebrow: plate index · version · date */}
        <div className="mono text-[11px] uppercase tracking-[0.2em] flex flex-wrap items-center gap-x-4 gap-y-2 text-bone">
          <span className="tabular-nums">{release.plate}</span>
          <span aria-hidden="true" className="h-px w-8 bg-ochre opacity-80" />
          <span className="tabular-nums font-semibold text-sumi text-[12px]">{release.version}</span>
          <span aria-hidden="true" className="h-px w-8 bg-ochre opacity-80" />
          <span className="font-medium">{release.date}</span>
          {highlight && (
            <>
              <span aria-hidden="true" className="h-px w-8 bg-ochre opacity-80" />
              <span className="text-ochre">Latest impression</span>
            </>
          )}
        </div>


        {/* Optional series title */}
        {release.title && (
          <div className="mt-6 mono text-xs uppercase tracking-[0.22em] text-bone">
            “{release.title}”
          </div>
        )}


        {/* Headline */}
        <h2
          className={`mt-5 text-3xl md:text-5xl font-semibold tracking-[-0.03em] leading-[1.02] break-words hyphens-auto ${
            highlight ? "text-bone" : "text-bone"
          }`}
        >
          {release.headline}
        </h2>

        {/* Bullets */}
        <ul
          className={`mt-10 grid grid-cols-12 gap-x-8 gap-y-5 ${
            highlight ? "" : ""
          }`}
        >
          {release.bullets.map((b, i) => (
            <li
              key={i}
              className="col-span-12 md:col-span-10 md:col-start-2 flex gap-5"
            >
              <span className="mono text-[11px] tabular-nums pt-1 w-8 shrink-0 text-bone font-medium">

                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-bone text-[15px] leading-[1.7] break-words">
                {b}
              </p>
            </li>
          ))}
        </ul>

        {/* Footer rule */}
        <div className="mt-12 flex items-center justify-between border-t border-bone/25 pt-4">
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-bone">
            ōban · {release.date}
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-sumi font-semibold">
            {release.version}
          </span>
        </div>

      </div>
    </article>
  );
}
