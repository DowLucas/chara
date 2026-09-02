import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, canonicalMeta } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing Addendum — Chara" },
      { name: "description", content: "Review the Data Processing Addendum for organizations using the Chara hosted service to ensure GDPR-compliant handling of personal data." },
      { property: "og:title", content: "Data Processing Addendum — Chara" },
      { property: "og:description", content: "GDPR Data Processing Addendum for organisations and teams using the Chara hosted bill-splitting service." },
      ...canonicalMeta("/dpa"),
    ],
    links: [canonicalLink("/dpa")],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.04" title="DPA" updated="22 May 2026">
        <p className="lead text-lg leading-[1.55]">
          This addendum applies when you use Chara in a way that makes you a data controller — for example, a team or company account where your colleagues' personal data is processed. It supplements the terms of service.
        </p>

        <H2>1 · Roles</H2>
        <p>You are the <strong>controller</strong>. Dow Technology is the <strong>processor</strong>. We process personal data only on your documented instructions, which include the act of using the service as designed.</p>

        <H2>2 · Subject matter and duration</H2>
        <p>We process personal data on your behalf for the duration of your account, plus the deletion windows specified in the privacy policy.</p>

        <H2>3 · Nature and purpose</H2>
        <p>Storing, transmitting, and displaying expense data and attached receipts among the users you invite to your groups; running optional receipt OCR; sending notifications you trigger; supporting your account.</p>

        <H2>4 · Categories of data</H2>
        <p>Names, email addresses, optional phone numbers, optional avatar URLs, locale, expense entries (amount, currency, date, description, group members), settlements, receipts you upload, the activity log of changes within each group, push tokens, magic-link tokens, and request logs. We do not request or expect special categories of data; if you upload them in receipts, that's your decision and your responsibility.</p>

        <H2>5 · Sub-processors</H2>
        <p>The current list is maintained in the privacy policy and covers the hosting provider, Cloudflare, Expo / EAS, the email provider, Google (Gemini API — receipt images and, if you use voice input, audio, which we process transiently and do not retain), Google (Sign in with Google), Apple (Sign in with Apple), the European Central Bank, and Google Fonts on the marketing site. We give 30 days' notice before adding a new sub-processor. You may object; if we can't resolve the objection, you may terminate the affected service.</p>

        <H2>6 · Security measures</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li>TLS in transit, terminated at Cloudflare.</li>
          <li>Provider-level disk encryption for Postgres and object storage volumes.</li>
          <li>Production access limited to the on-call engineer.</li>
          <li>Magic-link tokens hashed at rest with a short TTL.</li>
          <li>Money values handled as integers (minor units) end-to-end; no floats.</li>
          <li>Incident response with notification to you within 72 hours of a confirmed breach.</li>
        </ul>
        <p>Items on the security roadmap (HSTS / CSP headers, dependency vulnerability scanning in CI, automated log retention, presigned download URLs, restore-test cadence) are listed in the security overview and are not yet in place.</p>

        <H2>7 · International transfers</H2>
        <p>Primary processing is in the EU. Sub-processors located outside the EU rely on Standard Contractual Clauses with supplementary measures as required under EU law and the EDPB's recommendations.</p>

        <H2>8 · Assistance</H2>
        <p>We assist you, taking the nature of processing into account, with: responding to data subject requests; security obligations; breach notifications; DPIAs where applicable.</p>

        <H2>9 · Audits</H2>
        <p>We make available the information needed to demonstrate compliance and allow reasonable audits on request, at your cost.</p>

        <H2>10 · Deletion</H2>
        <p>On termination, we delete or return personal data per your instruction, within the windows in the privacy policy, unless retention is required by law.</p>

        <H2>11 · Sign it</H2>
        <p>If you need a countersigned copy for your records, email <code>privacy@dowtech.dev</code>.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-bone">{children}</h2>;
}
