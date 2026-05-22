# Chara — marketing site

Static marketing site for [chara.app](https://chara.app). Plain HTML + CSS + a tiny bit of JS — no build step, no framework. Designed to be portable to Astro later (per `CLAUDE.md`'s stated stack) without rewrites.

## Run locally

```sh
cd marketing
python3 -m http.server 4321
# open http://localhost:4321
```

Or any other static server (`npx serve .`, `caddy file-server`, etc).

## What's here

| Page | Purpose |
|------|---------|
| `index.html` | Landing — hero, values, features, comparison, self-host, FAQ, CTA |
| `privacy.html` | GDPR-aligned privacy policy for the hosted tier |
| `terms.html` | Terms of service |
| `cookies.html` | Cookie disclosure (we use almost none) |
| `dpa.html` | Data processing addendum for team / company accounts |
| `security.html` | Security overview + responsible-disclosure process |
| `support.html` | Where to reach us |
| `robots.txt`, `sitemap.xml` | SEO essentials |
| `.well-known/security.txt` | RFC 9116 security contact |

## Design

Pulls tokens directly from `../docs/design-system/colors_and_type.css`:

- **Sand dune** `#F0E5CC` — main surface
- **Dark coffee** `#2D1F1A` — text, rule lines
- **Tomato jam** `#B83D3D` — primary CTA, accents
- **Palm leaf** `#8FA055` — positive amounts
- **Honey bronze** `#E0A040` — highlights, underline accent
- Type stack: SN Pro / Inter for display + body, JetBrains Mono for numerals and labels

## Animations

- Hero balance card: gentle floating + cursor parallax (disabled on `prefers-reduced-motion`)
- Animated counter on the hero amount
- Staggered ledger row reveal
- Scroll-triggered fades via `IntersectionObserver`
- Hover micro-interactions on buttons, feature cards, FAQ accordions

## Deploy

Any static host works — Cloudflare Pages, Netlify, Vercel, S3+CloudFront, Caddy. No environment variables required.

```sh
# Cloudflare Pages example
wrangler pages deploy ./marketing --project-name=chara-marketing
```

## Before launch — checklist

- [ ] Replace placeholder GitHub link (`lucasdow/chara`) with the real org URL once published
- [ ] Add Open Graph image at `/assets/og.png` (1200×630)
- [ ] Add favicon set (`/favicon.svg`, `/apple-touch-icon.png`)
- [ ] Confirm Chara AB legal entity name + registered address in `privacy.html` / `terms.html`
- [ ] Confirm processor list in `privacy.html` and `dpa.html` matches the deployed stack
- [ ] Publish security PGP key referenced by `.well-known/security.txt`
- [ ] Hook up `status.chara.app` and `app.chara.app` DNS
- [ ] Set up the inboxes referenced (`hello@`, `privacy@`, `security@`, `press@`)
