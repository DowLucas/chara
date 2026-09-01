import { createFileRoute } from "@tanstack/react-router";
import { canonicalLink, canonicalMeta } from "@/lib/site";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPrint } from "@/components/LegalPrint";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookies — Chara" },
      { name: "description", content: "Chara keeps cookies and storage to the bare minimum." },
      { property: "og:title", content: "Cookies — Chara" },
      { property: "og:description", content: "No banner, because there's nothing to consent to." },
      ...canonicalMeta("/cookies"),
    ],
    links: [canonicalLink("/cookies")],
  }),
  component: () => (
    <div className="min-h-screen bg-indigo">
      <SiteHeader />
      <LegalPrint index="lg.03" title="Cookies" updated="22 May 2026">
        <p className="lead text-lg leading-[1.55]">
          Chara keeps cookies and storage to the bare minimum. We don't run analytics scripts and we don't load advertising tags. There's no cookie banner because there's nothing to consent to.
        </p>

        <H2>The marketing site (this page)</H2>
        <p>The marketing site is static. It sets no cookies and uses no localStorage. It does load webfonts from <strong>Google Fonts</strong> (<code>fonts.googleapis.com</code> and <code>fonts.gstatic.com</code>); Google Fonts does not set cookies, but Google can see your IP and user agent when those files load.</p>

        <H2>The app</H2>
        <p>The Chara app authenticates you with a JSON Web Token sent in the HTTP <code>Authorization</code> header. It is <strong>not</strong> a cookie. The token is held in the mobile app's secure storage (Expo SecureStore on iOS / Android, or browser storage on web) and is never visible to third parties.</p>
        <p>The web client may use localStorage for small UI preferences — language and theme. Those values stay on your device and are not sent to the server.</p>

        <H2>Third parties</H2>
        <p>We sit behind Cloudflare. Cloudflare may set <code>__cf_bm</code> (bot management, up to 30 minutes) and, on challenged requests, <code>cf_clearance</code>. Neither contains personal data; both are set by Cloudflare, not by us.</p>
        <p>That's the whole list. If you spot anything we missed, write to <code>privacy@dowtech.dev</code>.</p>
      </LegalPrint>
      <SiteFooter />
    </div>
  ),
});

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 mb-3 text-2xl font-semibold tracking-[-0.025em] text-bone">{children}</h2>;
}
