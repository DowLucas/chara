import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Chara" },
      { name: "description", content: "Learn how Chara handles your data, what we collect, where it lives, and how we protect your privacy as a self-hosted or hosted user." },
      { property: "og:title", content: "Privacy — Chara" },
      { property: "og:description", content: "Plainspoken privacy policy covering what Chara collects, why, and how your data is stored and protected." },
      { property: "og:url", content: "/privacy" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.01" title="Privacy" updated="26 May 2026">
        <p className="lead text-lg leading-[1.55]">
          This policy covers the <strong>Chara hosted service operated by Dow Technology</strong>. If you self-host Chara on your own server, you are the data controller and this policy does not apply — you set your own.
        </p>

        <H2>0 · What this policy covers</H2>
        <p>
          This policy applies to the <strong>Chara hosted service operated by Dow Technology</strong>. If you connect the Chara app to a self-hosted server run by someone else, the operator of that server is the data controller for data stored on it; this policy does not cover that data. Your local device data (PIN, Face ID, cached avatars) is processed by your operating system on your device — Chara never sees it.
        </p>

        <H2>1 · Who we are</H2>
        <p>This service is operated by <strong>Dow Technology</strong>, a Swedish <em>enskild firma</em> owned by Lucas Dow, who acts as the data controller. We are not required to appoint a formal Data Protection Officer; privacy inquiries are handled directly by the data controller at <code>privacy@dowtech.dev</code>.</p>

        <H2>2 · What we collect</H2>
        <p>Stored against your account:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Email address</strong> — required to sign in.</li>
          <li><strong>Display name</strong> — shown to people in your groups.</li>
          <li><strong>Avatar URL</strong> — optional.</li>
          <li><strong>Phone number</strong> — optional; used so people can pay you back via Swish or a similar app. We do not send SMS.</li>
          <li><strong>Locale</strong> — your preferred language, defaulted from your device.</li>
        </ul>
        <p>Stored against your groups and expenses:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Expense entries</strong> — amount, currency, date, description, payer, split, and group members.</li>
          <li><strong>Settlements</strong> — who paid whom and when.</li>
          <li><strong>Receipts</strong> — any photos or PDFs you choose to attach. If you opt in to receipt scanning, the image is sent to Google's Gemini API for text extraction; the extracted text is stored next to the receipt.</li>
          <li><strong>Activity log</strong> — for each group we record what changed so the group has a coherent history.</li>
        </ul>
        <p>Stored for operations:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Push tokens</strong> — an opaque identifier from Expo, plus platform and last-used timestamp.</li>
          <li><strong>Magic-link tokens</strong> — one-time random tokens, hashed at rest, valid 15 minutes, deleted after use.</li>
          <li><strong>Request logs</strong> — IP, user agent, path, and status code. Retained for security monitoring and operational diagnostics.</li>
        </ul>
        <p>Product analytics and diagnostics:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Pseudonymous product-interaction events</strong> via PostHog (host: <code>eu.i.posthog.com</code>, EU region). Pseudonymous user ID only; no IDFA, no cross-app tracking. Can be disabled in Settings → Privacy.</li>
          <li><strong>Crash diagnostics</strong> — stack traces, device model, OS version. Not linked to your identity.</li>
        </ul>
        <p>We do <strong>not</strong> collect: your contacts, your location, advertising identifiers, or payment card data.</p>
        <p>
          <strong>Sign in with Apple.</strong> If you sign in via Apple's Hide My Email, your relay address (<code>*@privaterelay.appleid.com</code>) is stored like any other email. You can revoke the link at any time via iOS Settings → Apple ID → Sign in with Apple → Chara.
        </p>
        <p>
          <strong>Biometric data.</strong> Face ID, Touch ID, and the optional in-app PIN are processed entirely on your device by iOS or Android. Chara never sees them or transmits them. The PIN is stored hashed in the device's secure enclave.
        </p>

        <H2>3 · Why we collect it (lawful basis)</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Contract</strong> (GDPR Art. 6(1)(b)) — to provide the service you signed up for.</li>
          <li><strong>Legitimate interest</strong> (Art. 6(1)(f)) — request logs for security, abuse prevention, and debugging.</li>
          <li><strong>Consent</strong> (Art. 6(1)(a)) — push notifications, product analytics, and the optional Gemini receipt-scanning feature.</li>
        </ul>
        <p>Where processing is based on consent, you have the right to withdraw your consent at any time without penalty. You can do so in <strong>Settings → Privacy</strong> (analytics), <strong>Settings → Notifications</strong> (push), or by simply not using the receipt-scanning feature. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.</p>

        <H2>4 · Who sees your data</H2>
        <p>The people you share groups with see the expenses in those groups. Outside that, we use these subprocessors:</p>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-sumi/30">
                <th className="text-left py-2 px-2 font-semibold">Subprocessor</th>
                <th className="text-left py-2 px-2 font-semibold">Purpose</th>
                <th className="text-left py-2 px-2 font-semibold">Region</th>
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr]:border-sumi/15">
              <tr><td className="py-2 px-2">Dow Technology private infrastructure (Stockholm, Sweden)</td><td className="py-2 px-2">Primary hosting, database, file storage</td><td className="py-2 px-2">Sweden / EU</td></tr>
              <tr><td className="py-2 px-2">Cloudflare</td><td className="py-2 px-2">DNS, edge, email routing</td><td className="py-2 px-2">US / global</td></tr>
              <tr><td className="py-2 px-2">Brevo (Sendinblue SAS)</td><td className="py-2 px-2">Transactional email delivery (magic links)</td><td className="py-2 px-2">France / EU</td></tr>
              <tr><td className="py-2 px-2">Expo (EAS)</td><td className="py-2 px-2">Mobile app builds, push notification delivery</td><td className="py-2 px-2">US</td></tr>
              <tr><td className="py-2 px-2">PostHog Cloud EU</td><td className="py-2 px-2">Product analytics</td><td className="py-2 px-2">Germany / EU</td></tr>
              <tr><td className="py-2 px-2">Google (Gemini API)</td><td className="py-2 px-2">Optional receipt OCR</td><td className="py-2 px-2">US</td></tr>
              <tr><td className="py-2 px-2">Apple Sign In</td><td className="py-2 px-2">Optional sign-in</td><td className="py-2 px-2">US</td></tr>
              <tr><td className="py-2 px-2">Google Sign In</td><td className="py-2 px-2">Optional sign-in</td><td className="py-2 px-2">US</td></tr>
              <tr><td className="py-2 px-2">European Central Bank</td><td className="py-2 px-2">Public FX rates (no PII sent)</td><td className="py-2 px-2">EU</td></tr>
              <tr><td className="py-2 px-2">Google Fonts</td><td className="py-2 px-2">Marketing site fonts only</td><td className="py-2 px-2">US</td></tr>
            </tbody>
          </table>
        </div>
        <p>US transfers rely on Standard Contractual Clauses and the EU–US Data Privacy Framework where the recipient is certified. We do not sell, rent, license, or trade personal data.</p>
        <p>The marketing website (<code>getchara.lovable.app</code>) loads Google Fonts and is hosted on Lovable; it does not run product analytics or advertising trackers.</p>

        <H2>5 · Where your data lives</H2>
        <p>Primary storage and backups are in the EU. Transfers to US-based processors rely on Standard Contractual Clauses with supplementary measures as required under EU law.</p>

        <H2>6 · How long we keep it</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Active accounts</strong>: as long as the account exists.</li>
          <li><strong>Account deletion</strong>: on request to <code>privacy@dowtech.dev</code> or in-app (Profile → Delete Account). We action requests within 30 days; backups rotate out within 90 days.</li>
          <li><strong>Request logs</strong>: retained for security monitoring and operational diagnostics.</li>
          <li><strong>Billing records</strong>: not applicable while the service is free. Once paid plans launch, 7 years per Swedish accounting law.</li>
        </ul>

        <H2>7 · Your rights</H2>
        <p>Under GDPR you can access your data, correct it, export it, restrict processing, object, withdraw consent, and delete your account. Email <code>privacy@dowtech.dev</code>; we respond to verified requests within 30 days. You may also complain to your local supervisory authority — in Sweden, that's Integritetsskyddsmyndigheten (IMY).</p>
        <p>You can delete your account from inside the app: <strong>Profile → Delete Account</strong>. All open balances on a server must be settled before deletion is allowed on that server.</p>
        <p><strong>Automated decision-making.</strong> We do not use your data for automated decision-making or profiling that produces legal or similarly significant effects. The optional receipt OCR feature extracts text from images you submit; it does not make decisions about you.</p>

        <H2>8 · Security</H2>
        <p>Transport is TLS, terminated at the network edge. Database and object storage volumes are encrypted at rest using industry-standard encryption. Access to production environments is restricted to authorized administrative personnel. Magic-link tokens are random and hashed at rest. See the security overview for the full picture.</p>

        <H2>9 · Children</H2>
        <p>Chara is not directed at children under 13. If you believe a child has signed up, contact us and we'll remove the account.</p>

        <H2>10 · California residents</H2>
        <p>If you are a California resident, you have the rights described in §7 (access, correction, portability, deletion, restriction, objection). We do not "sell" or "share" personal information as those terms are defined under the CCPA/CPRA. Contact <code>privacy@dowtech.dev</code> to exercise your rights.</p>

        <H2>11 · Changes</H2>
        <p>If we change this policy materially, we'll email active users and post a notice in-app. The "last updated" date above always reflects the current version.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-sumi">{children}</h2>;
}
