import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/delete")({
  head: () => ({
    meta: [
      { title: "Delete your account — Chara" },
      { name: "description", content: "How to delete your Chara account and what happens to your data. Covers the in-app deletion flow and what is removed versus retained." },
      { property: "og:title", content: "Delete your account — Chara" },
      { property: "og:description", content: "Step-by-step account deletion instructions for Chara, plus a clear breakdown of what data is deleted and what is kept." },
      { property: "og:url", content: "/delete" },
    ],
    links: [{ rel: "canonical", href: "/delete" }],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.03" title="Account &amp; Data Deletion" updated="28 May 2026">
        <p className="lead text-lg leading-[1.55]">
          <strong>Chara</strong> is built by <strong>Dow Technology</strong>. If you no longer want to use the app, you can delete your account and most of your data will be permanently removed. This page explains exactly how.
        </p>

        <H2>How to delete your account</H2>
        <p>The quickest way is inside the app:</p>
        <ol className="list-decimal pl-6 space-y-2">
          <li>Open the <strong>Chara</strong> app.</li>
          <li>Go to the <strong>You</strong> tab (or the <strong>Accounts</strong> screen if you have multiple servers linked).</li>
          <li>Tap <strong>Delete account</strong> and confirm.</li>
        </ol>
        <p className="mt-4">
          <strong>Important:</strong> Deletion is blocked while you have any outstanding balance — money you owe or are owed — in any currency, in any group. You must settle all balances to zero first. This protects other group members from being left with balances against a deleted account.
        </p>

        <H2>What gets deleted</H2>
        <p>Once deletion is confirmed, the following is permanently erased:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Your name</li>
          <li>Your email address</li>
          <li>Your phone number</li>
          <li>Your profile photo</li>
          <li>Your push-notification tokens</li>
        </ul>

        <H2>What we keep, and why</H2>
        <p>
          Your past expense and settlement entries remain in the groups you were part of. They are shown to your former group members under a removed ("ghost") participant name. This is necessary to keep those groups' shared financial history accurate for the other members.
        </p>
        <p>
          There is no fixed retention timer for these records — they persist as long as those groups exist.
        </p>

        <H2>Can't access the app?</H2>
        <p>
          If you are using the <strong>hosted Chara service</strong> and cannot access the app, you can email us at <code>support@dowtech.dev</code> to request deletion. We will verify your identity and process the request within 30 days.
        </p>

        <H2>Self-hosted users</H2>
        <p>
          Chara can be self-hosted. On a self-hosted instance, account data lives on that instance's operator's server. The in-app deletion flow described above works against whichever server you are signed in to. If you need help with a self-hosted instance, contact the operator of that server directly.
        </p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-sumi">{children}</h2>;
}
