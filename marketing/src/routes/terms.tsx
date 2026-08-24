import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms — Chara" },
      { name: "description", content: "Read the terms of service for the Chara hosted bill-splitting platform, covering account usage, acceptable use, content, and liability." },
      { property: "og:title", content: "Terms — Chara" },
      { property: "og:description", content: "Plain terms of service for Chara hosted, covering accounts, acceptable use, and your rights as a user." },
      { property: "og:url", content: "/terms" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.02" title="Terms" updated="26 May 2026">
        <p className="lead text-lg leading-[1.55]">
          Last Updated: 26 May 2026
        </p>
        <p className="text-lg leading-[1.55]">
          These terms govern the Chara hosted service, operated by <strong>Dow Technology</strong>, a Swedish <em>enskild firma</em>. By creating an account, you agree to these terms. The underlying software applications are open source under their respective source-code licenses.
        </p>

        <H2>1 · The Service</H2>
        <p>Chara is a tool for tracking shared expenses between individuals who choose to form a group. Chara does <strong>not</strong> process, hold, or move money. All financial settlements happen directly between users via external third-party payment applications (such as Swish or bank transfers). We are not a payment service provider, money transmitter, or regulated financial institution.</p>
        <p>By using Chara, you also agree to our <a href="/privacy" className="underline">Privacy Policy</a>, which is fully incorporated into these Terms.</p>

        <H2>2 · Scope: Hosted Service vs. Self-Hosting</H2>
        <p>These Terms apply strictly to the hosted Chara service operated by Dow Technology (and its associated official mobile apps connecting to it).</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Self-Hosted Instances:</strong> If you run your own instance of the Chara server, the software&apos;s open-source license governs your deployment. These Terms do not apply to your server.</li>
          <li><strong>No Support or Liability for Self-Hosting:</strong> Dow Technology provides the open-source code &quot;as-is&quot;. We offer no technical support, uptime guarantees, or maintenance for self-hosted deployments. You are entirely responsible for your own data backups, security configurations, and compliance with local laws.</li>
          <li><strong>Absolute Waiver for Underlying Code:</strong> To the maximum extent permitted by applicable law, Dow Technology and Lucas Dow disclaim all liability arising from the underlying open-source code itself&mdash;including bugs, defects, vulnerabilities, security exploits, calculation errors, or data loss&mdash;regardless of whether the code is run on our hosted infrastructure or on infrastructure operated by you or a third party. Your sole remedy for any defect in the open-source code is to stop using it or to modify it under the terms of its open-source license.</li>
          <li><strong>Trademark Restrictions:</strong> Granting access to the open-source code does not grant you any license or right to use the &quot;Chara&quot; name, branding, logos, or associated official domains for public or commercial hosting services. You may not represent a self-hosted instance as being affiliated with, or endorsed by, Dow Technology.</li>
        </ul>


        <H2>3 · Your Account</H2>
        <p>You are entirely responsible for keeping your sign-in credentials secure. You may not share an account identity with another person; instead, utilize the in-app invite system to add members to a group. You must be old enough to enter into a legally binding contract in your jurisdiction (and at least 13 years of age in all cases).</p>

        <H2>4 · Acceptable Use</H2>
        <p>You agree not to use the hosted Chara service to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Track or record debts arising from activities that violate local laws (e.g., unlicensed lending, illegal gambling, fraudulent schemes).</li>
          <li>Upload, store, or transmit content that you do not hold rights to, or material that is unlawful, harassing, defamatory, or harmful.</li>
          <li>Attempt to disrupt, scrape at scale, probe, or compromise the infrastructure of the service.</li>
          <li>Send unsolicited or automated invitations and notifications.</li>
          <li>Abuse system rate limits, free-tier OCR receipt scanning quotas, or invitation mechanisms.</li>
          <li>Attempt to access data, groups, or accounts belonging to other users without explicit authorization.</li>
        </ul>
        <p>To report security vulnerabilities responsibly, please contact <code>security@dowtech.dev</code>.</p>

        <H2>5 · Your Content &amp; Data License</H2>
        <p>You retain full ownership of all data you upload into the service&mdash;including expense entries, receipts, group names, and avatars. You grant Dow Technology a limited, worldwide, non-exclusive license to process, store, transmit, and display this content solely to deliver the service to you and your groups (including transmitting receipts to Google's Gemini API if you opt-in to the receipt OCR scanning feature).</p>

        <H2>6 · Pricing &amp; Beta Terms</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Beta Limitations:</strong> During its beta phase, the hosted service is provided free of charge without uptime, calculation accuracy, or permanent data-retention guarantees. While we maintain system backups, Chara should not be relied upon as your sole or definitive record of financial liabilities.</li>
          <li><strong>Future Tiers:</strong> After version 1.0, we may introduce paid tiers for advanced features (e.g., priority support, extended history retention). Core bill-splitting functionalities will remain free. Pricing updates will be communicated at least 30 days in advance.</li>
          <li><strong>OCR Limits:</strong> Receipt scanning is subject to rate caps (currently 3 scans per user per month) to manage third-party API processing costs.</li>
        </ul>


        <H2>7 · Account Closure &amp; Termination</H2>
        <p>You can delete your account at any time via the app (<strong>Profile &rarr; Delete Account</strong>) or by contacting <code>privacy@dowtech.dev</code>. All active balances associated with your account on the hosted instance must be settled before deletion can be completed. We reserve the right to suspend or terminate accounts that breach these Terms, providing notice where security considerations allow.</p>

        <H2>8 · Financial &amp; Technical Disclaimers</H2>
        <p>Chara is provided strictly on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law, we disclaim all warranties, whether express or implied.</p>
        <p><strong>User Verification Required:</strong> All figures, splits, and totals displayed within the application are derived directly from user inputs. We do not audit or verify transactions.</p>
        <p><strong>OCR Parsing:</strong> Receipt parsing via the Gemini API is a best-effort automated tool. It can misread characters or totals. You are strictly responsible for checking and confirming line items before committing them to a group log.</p>
        <p><strong>Foreign Exchange Rates:</strong> Currency conversion indicators rely on European Central Bank reference rates updated daily. These rates are purely indicative, do not constitute financial advice, and should not be treated as real-time trading quotes.</p>

        <H2>9 · Limitation of Liability</H2>
        <p>To the maximum extent permitted by applicable law, Dow Technology and Lucas Dow shall not be liable for any indirect, incidental, special, consequential, or exemplary damages&mdash;including but not limited to loss of profits, loss of data, calculation discrepancies, or financial disputes arising between group members. This limitation applies to both the hosted Chara service and the distribution and use of the underlying open-source software, whether deployed by us, by you, or by any third party.</p>
        <p>Our aggregate liability for all claims arising out of or relating to the hosted service or the underlying software is strictly limited to the total amount paid by you to us in the twelve (12) months preceding the incident, or &euro;100, whichever is greater.</p>


        <H2>10 · Changes to Terms</H2>
        <p>We may update these terms from time to time. Material modifications will be announced via email and in-app notifications at least 30 days before taking effect. Continued use of the service past the effective date constitutes acceptance of the revised terms.</p>

        <H2>11 · Governing Law &amp; Jurisdiction</H2>
        <p>These Terms are governed entirely by Swedish law. Any disputes arising from or relating to these terms shall be subject to the exclusive jurisdiction of the courts of Stockholm, Sweden, unless mandatory local consumer-protection laws provide you with the legal right to settle disputes in your local jurisdiction.</p>

        <H2>12 · Apple App Store Terms</H2>
        <p>If you installed Chara via the Apple App Store, you acknowledge that:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Apple Inc. is not a party to these Terms and has no obligation to provide maintenance, support, or warranty services for the app.</li>
          <li>Dow Technology is solely responsible for addressing any product claims or support requests regarding the software.</li>
          <li>Apple acts as a third-party beneficiary of these Terms and possesses the right to enforce them against you upon your acceptance.</li>
        </ul>

        <H2>13 · Miscellaneous Legal Provisions</H2>
        <p><strong>Severability:</strong> If any provision of these Terms is deemed unenforceable by a court, the remaining provisions will continue in full force and effect.</p>
        <p><strong>No Waiver:</strong> A failure to enforce a specific right or provision does not constitute a waiver of that right.</p>
        <p><strong>Force Majeure:</strong> We are not liable for operational failures or data delays resulting from conditions beyond our reasonable control (including third-party cloud platform outages, upstream API failures, or network disruptions).</p>
        <p><strong>Assignment:</strong> You may not transfer or assign these Terms. Dow Technology reserves the right to assign or transfer its rights and obligations under these Terms to a corporate entity or successor organization in the future.</p>
        <p><strong>Entire Agreement:</strong> These Terms, alongside the Privacy Policy, represent the complete and exclusive agreement between you and Dow Technology regarding the hosted service.</p>

        <H2>14 · Contact</H2>
        <p>For support, feedback, or general questions, please contact: <code>hello@dowtech.dev</code>.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-sumi">{children}</h2>;
}
