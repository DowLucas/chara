import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Chara" },
      { name: "description", content: "How to get help with Chara — for self-hosters and hosted users alike." },
      { property: "og:title", content: "Support — Chara" },
      { property: "og:description", content: "Chara support channels: docs, GitHub issues, email." },
      { property: "og:url", content: "/support" },
    ],
    links: [{ rel: "canonical", href: "/support" }],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.06" title="Support" updated="May 2026">
        <p className="lead text-lg leading-[1.55]">
          Three ways to reach us, in order of how fast you'll get a useful answer.
        </p>

        <H2>01 · Docs</H2>
        <p>Read <code>docs.chara.dev</code> first. We write the documentation before we write the feature. The install guide, the migration guide from Splitwise, and the OIDC cookbook cover most of what people ask.</p>

        <H2>02 · GitHub issues</H2>
        <p>For bugs, feature requests, and self-host weirdness, open an issue at <code>github.com/DowLucas/chara/issues</code>. We triage every weekday morning Stockholm time and respond within two working days. Public issues get fixed faster than private email — the community helps.</p>

        <H2>03 · Email</H2>
        <p>For hosted-account problems, billing, or anything you can't put in public, write to <code>hi@chara.dev</code>. One human reads it; the same human writes back. Response within one business day.</p>

        <H2>What we don't have</H2>
        <p>No live chat. No on-call phone line. No support tiers. If your business needs a 24/7 SLA, self-host Chara and run your own on-call rotation — the AGPL license entitles you to do exactly that, with no per-seat surcharge.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-sumi">{children}</h2>;
}
