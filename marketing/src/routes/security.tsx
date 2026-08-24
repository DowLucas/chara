import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — Chara" },
      { name: "description", content: "Discover Chara's security posture, including transport encryption, data protection at rest, authentication, and our responsible disclosure policy." },
      { property: "og:title", content: "Security — Chara" },
      { property: "og:description", content: "Security posture, transport encryption, at-rest protection, and responsible disclosure for the Chara platform." },
      { property: "og:url", content: "/security" },
    ],
    links: [{ rel: "canonical", href: "/security" }],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.05" title="Security" updated="22 May 2026">
        <p className="lead text-lg leading-[1.55]">
          We take security seriously, but we'd rather under-promise and ship than over-claim. This page describes what is actually in place today, and what is on the roadmap.
        </p>

        <H2>What is in place today</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Transport</strong>: TLS, terminated at Cloudflare in front of the service.</li>
          <li><strong>At rest</strong>: provider-level disk encryption on the volumes our Postgres database and object storage live on.</li>
          <li><strong>Auth</strong>: passwordless. Magic links are random 32-byte tokens, hashed at rest, valid for 15 minutes, single-use. Self-hosted instances can additionally use OIDC against any provider you choose (Authentik, Keycloak, Authelia, Pocket ID). Hosted accounts can additionally use Sign in with Google or Sign in with Apple.</li>
          <li><strong>Sessions</strong>: a signed JWT carried in the HTTP <code>Authorization</code> header — not a cookie. Tokens are held in the device's secure storage and cleared on sign-out.</li>
          <li><strong>Receipt access</strong>: receipts in object storage are served through an authenticated proxy route; the backend re-checks group membership on every request. Object URLs are never handed out to the client.</li>
          <li><strong>Money math</strong>: int64 minor units, decimal strings on the wire. Floats are forbidden.</li>
          <li><strong>Production access</strong>: limited to the on-call engineer. SSH keys only, no shared accounts.</li>
        </ul>

        <H2>What we don't do</H2>
        <ul className="list-disc pl-6 space-y-2">
          <li>We don't process payments. We won't ever ask for card data.</li>
          <li>We don't load third-party analytics, advertising, or chat widgets on app pages.</li>
          <li>We don't keep raw email content. Outbound mail is transactional; there is no marketing pipeline.</li>
          <li>We don't store contacts, location, or advertising identifiers.</li>
        </ul>

        <H2>On the roadmap (not in place yet)</H2>
        <p>We want to be straight about what we are still working on:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>HSTS preload, CSP, X-Frame-Options, X-Content-Type-Options — none of these are sent by the application server yet. Cloudflare handles some of this at the edge.</li>
          <li>Dependency vulnerability scanning in CI (<code>govulncheck</code>, Dependabot).</li>
          <li>Automatic 30-day rotation of request logs.</li>
          <li>Short-TTL presigned download URLs for receipts as an alternative to the proxy route.</li>
          <li>Documented restore-test cadence for backups.</li>
          <li>In-app account deletion and data export. Currently handled by email to <code>privacy@dowtech.dev</code>.</li>
        </ul>
        <p>This list is intentionally public. If something here matters to you, let us know — it sharpens prioritisation.</p>

        <H2>Self-host security notes</H2>
        <p>If you self-host, your security is your call. Some things worth doing:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Put the app behind a reverse proxy with TLS (Caddy is the obvious pick).</li>
          <li>Use a real OIDC provider — Authentik, Keycloak, Authelia, Pocket ID. Don't roll your own auth.</li>
          <li>Restrict the Postgres port to localhost or your private network.</li>
          <li>Rotate the JWT signing secret regularly; back up <code>./data</code> regularly.</li>
          <li>If you turn on the Gemini receipt OCR feature, remember that receipt images leave your server and go to Google. The feature is off by default.</li>
        </ul>

        <H2>Responsible disclosure</H2>
        <p>If you find a vulnerability, please email <code>security@dowtech.dev</code>. We aim to respond within 72 hours. We don't run a paid bug bounty yet, but we credit reporters in the changelog with permission. Please don't open public GitHub issues for security findings.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-bone">{children}</h2>;
}
