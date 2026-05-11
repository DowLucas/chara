# 02. Product Strategy

## Vision

Quits is the bill-splitting application that respects the user. Open code, self-hostable, native on every device, and integrated with how people actually move money in their region. It is what Splitwise would be if it had been built by Bitwarden's team in Stockholm.

## Three-line positioning

> Quits is an open source bill splitter that runs on your server or ours. Native iOS and Android apps, real Swish and Vipps integration, and your data never leaves your control. The Splitwise replacement for people who care where their data lives.

## Target audiences (in priority order)

### Audience 1: Nordic users abandoning Steven

- **Who:** Swedes, increasingly Norwegians and Danes, currently on Steven or considering it. Active in groups of friends/colleagues, primary use case is restaurant bills, weekend trips, shared apartments.
- **Pain:** Steven's reliability has collapsed. Recent reviews show users actively churning. Subscription fatigue. Distrust of the fintech pivot.
- **Acquisition channel:** Reddit (r/sweden, r/swedishpersonalfinance, r/svenskpolitik tangentially), Twitter/X Swedish tech crowd, Mastodon FOSS Nordics, HackerNews when ready.
- **Why we win:** Swish integration, Swedish-language UI, open source ("inte ännu en app som plötsligt går ner"), better reliability story.
- **Price sensitivity:** Low for the hosted tier. Steven users were paying ~50 SEK/month and got worse service.

### Audience 2: Self-hosters globally

- **Who:** The r/selfhosted, r/homelab, Awesome-Selfhosted demographic. People running Immich, Bitwarden/Vaultwarden, Authentik, Paperless-ngx, Nextcloud. Technical, privacy-motivated, willing to read docs.
- **Pain:** Splitwise is not self-hostable. SplitPro is, but lacks native apps. They want a clean Docker Compose, ARM support, OIDC integration with their existing identity provider.
- **Acquisition channel:** r/selfhosted, r/homelab, Awesome-Selfhosted PR, NetworkChuck/TechHut/Sloth YouTube coverage, HN show-and-tell, FOSS Mastodon.
- **Why we win:** First-class native apps that work with self-hosted instances, real OIDC, single-command deploy, no Plaid-only assumptions.
- **Price sensitivity:** Zero for self-host. Will donate or sponsor if the project earns it.

### Audience 3: Splitwise refugees globally

- **Who:** Splitwise users who have hit the 3-expenses-per-day cap, are tired of ads, or are angry about the paywall changes. Cross-cuts demographics and geographies.
- **Pain:** Splitwise charges them for what used to be free. The free tier is now deliberately broken.
- **Acquisition channel:** Search SEO ("Splitwise alternative free"), Reddit (r/Splitwise complaints threads, r/personalfinance, r/budget), Product Hunt launch later.
- **Why we win:** Truly free hosted tier (with sane limits) + self-host option + one-click Splitwise import.
- **Price sensitivity:** Medium. Willing to pay ~$2 to undercut Splitwise Pro $3.

### Audience 4 (later, much later): Small teams and households

- **Who:** Roommates, families, small office groups, retreat organizers.
- **Pain:** Splitwise free tier no longer works for ongoing households.
- **Acquisition channel:** Word of mouth from primary audiences.
- **This is not an early-stage focus.** It is where the audience funnel naturally lands once core is solid.

## Explicit non-goals

These are real choices. Each one represents temptation that should be resisted in v1 and possibly forever.

1. **Not a budgeting app.** No "spending by category" envelope budgeting, no YNAB-style. Splitwise wandered into this and it diluted the core. Insights and charts are fine, but Quits is about settling shared expenses, not personal finance.
2. **Not a payments processor.** Quits never holds money. All settlements happen via external rails (Swish, Vipps, MobilePay, PayPal, manual). No KYC, no AML, no licensing exposure. Important for staying out of regulatory scope.
3. **Not a bank.** No issued card, no debit accounts, no PSD2 license. Steven walked this path and it consumed them.
4. **Not a B2B SaaS.** No "Quits for Teams" with seats, SCIM, audit logs. The self-host story is the answer for organizations that need control. Open core paid-SSO has a track record of poisoning OSS goodwill (see Bitwarden's grumbles).
5. **Not a chat app.** Comments on expenses, yes. General messaging, no. Splitwise tried; nobody uses it.
6. **Not a social network.** No public profiles, no feeds, no "Splitwise wrapped" virality unless it is opt-in and shareable.

## MVP definition (P0 only)

The MVP must be embarrassingly small. If it ships in 3 months it is on track. If it ships in 6 months it is late but salvageable. If it ships in 9 months the project has failed and should be quietly archived.

### MVP scope

**Web app + Expo iOS + Expo Android (TypeScript/React Native frontend), Go backend API, deployable as one Docker Compose stack.**

- User auth: email magic link + Google OAuth + Apple Sign In (hosted tier); email magic link + OIDC (self-hosted)
- Create a group, invite by email or shareable link (Tricount-style for the link case)
- Add expense: title, amount, currency (group default), date, payer, participants
- Split methods: equal, exact amounts, percentage (skip shares and adjustments for v1)
- Reimbursements / settlements (mark as paid)
- Per-person balances within a group
- Cross-group total balance per friend (the "you owe X total" summary)
- Activity feed with edit/delete
- Search expenses within a group
- Receipt image attachment (S3-compatible storage, with MinIO bundled in Compose)
- Swedish, English, Norwegian Bokmål, Danish UI translations (Weblate from day 1)
- Currency: per-expense currency, displayed in group default, no FX conversion in v1
- Push notifications via Expo's free service when a new expense or settlement involves you
- Swish request-to-pay deep linking (Sweden only) at settle-up time: tap "Settle with Swish" → opens Swish app pre-filled
- Splitwise importer (one-click, full: friends, groups, expenses)
- Single-binary Docker Compose, ARM and AMD64 images, OIDC for self-hosters
- Web client for desktop usage (Expo web target)

That is the v1. Everything else is later.

### Things explicitly cut from v1

- Multi-currency conversion of balances
- Recurring expenses
- Receipt OCR
- Charts / spending insights
- Bank transaction integration
- Vipps / MobilePay (Norway, Denmark, Finland post-merger)
- Debt simplification (just show raw balances; simplification is P1)
- Itemized line-item splits
- Apple Watch / Wear OS
- Widgets
- Categories beyond a small fixed set
- Custom split templates
- End-to-end encryption
- Federation / multi-instance

These are listed in the feature matrix below with target phases.

## Feature priority matrix

P0 = MVP (must ship). P1 = within 6 months of MVP. P2 = within 12 months of MVP. P3 = nice to have, after sustainability is proven.

### Core expense management

| Feature | Priority | Notes |
|---------|:---:|---|
| Equal split | P0 | |
| Exact-amount split | P0 | |
| Percentage split | P0 | |
| Share-based split | P1 | "Alice gets 2 shares, others get 1" |
| Adjustment split | P1 | "Equal but Alice owes 50 SEK extra" |
| Itemized line-item splits | P2 | Requires OCR or manual line entry, complex UI |
| Negative expenses (refunds) | P1 | SplitPro does this; useful |
| Recurring expenses | P1 | `pg_cron` or in-app scheduler |
| Custom categories | P1 | Default set in P0, custom in P1 |
| Tags | P2 | |
| Notes per expense | P0 | |
| Saved split templates | P2 | |
| Per-expense currency | P0 | No conversion in P0 |
| Currency conversion of balances | P1 | ECB or Frankfurter API |
| Date in past or future | P0 | |

### Balances and settlement

| Feature | Priority | Notes |
|---------|:---:|---|
| Per-group balance | P0 | |
| Per-person balance across groups | P0 | "You owe Alice 240 SEK total" |
| Mark as settled | P0 | |
| Partial settlement | P1 | |
| Debt simplification | P1 | Minimum cash flow algorithm; opt-in per group |
| Settle-up suggestions | P1 | |

### Receipts and inputs

| Feature | Priority | Notes |
|---------|:---:|---|
| Image attachment via S3-compatible | P0 | MinIO bundled for self-host |
| Receipt OCR (cloud users) | P1 | GPT-4V or Gemini Flash |
| Receipt OCR (self-host) | P2 | Optional Ollama profile w/ Qwen2.5-VL |
| Category inference from title | P2 | Cloud-tier feature |
| Itemized line extraction | P2 | Couples with OCR |

### Activity, search, discovery

| Feature | Priority | Notes |
|---------|:---:|---|
| Activity feed per group | P0 | |
| Edit / delete audit trail | P0 | Critical for trust |
| Search within group | P0 | |
| Global search across groups | P1 | |
| Filter by category, date, payer | P1 | |

### Native mobile

| Feature | Priority | Notes |
|---------|:---:|---|
| Native iOS app (Expo) | P0 | |
| Native Android app (Expo) | P0 | |
| Web client (Expo web target) | P0 | |
| Push notifications | P0 | Via Expo push service |
| Offline mode with sync | P1 | Optimistic queue then full local-first in P2 |
| Contact picker for invites | P1 | |
| Location pinning of expenses | P2 | |
| Share Sheet integration (Photos → expense) | P1 | High ROI on iOS |
| Siri Shortcuts / Android intents | P2 | |
| Home screen widgets | P2 | "Balance with X" widget |
| Apple Watch quick-add | P3 | |
| Wear OS quick-add | P3 | |

### Payment rails (the wedge)

| Feature | Priority | Notes |
|---------|:---:|---|
| Swish deep-link request-to-pay (SE) | P0 | The Nordic wedge |
| Vipps deep-link (NO/DK/FI post-merger) | P1 | |
| MobilePay deep-link (DK, until Vipps merge fully complete) | P1 | |
| PayPal deep-link | P1 | |
| Generic payment link field | P0 | "Pay me here: [URL]" |
| Manual mark-as-settled | P0 | |
| Stripe Payment Links (hosted tier) | P2 | |
| Open banking auto-import (Tink, GoCardless BAD) | P2 | EU focus |
| Plaid (US) | P3 | |

### Insights

| Feature | Priority | Notes |
|---------|:---:|---|
| Group total over time | P1 | |
| Spending by category | P2 | |
| Year-end summary | P2 | "Quits Wrapped" potential |
| Per-person spending trends | P2 | |
| Budget tracking | P3 | Bordering on non-goal |

### Self-hosting and ops

| Feature | Priority | Notes |
|---------|:---:|---|
| Single Docker Compose | P0 | |
| Multi-arch images (AMD64 + ARM64) | P0 | RPi 5 and Apple Silicon mini servers |
| OIDC / SSO | P0 | `coreos/go-oidc` |
| Magic link auth | P0 | |
| Passkeys | P1 | WebAuthn via `go-webauthn/webauthn` |
| Admin dashboard | P1 | User management, audit log |
| Backup / restore CLI | P0 | `quits backup`, `quits restore` |
| Healthcheck endpoints | P0 | |
| OpenAPI schema | P1 | |
| Webhook system | P2 | |
| End-to-end encryption | P3 | Major architectural lift |

### Migration and importers

| Feature | Priority | Notes |
|---------|:---:|---|
| Splitwise importer (full) | P0 | Friends + groups + expenses; the wedge for global users |
| Steven importer | P1 | Will require reverse-engineering their export; high ROI in SE |
| Spliit importer | P2 | Goodwill move |
| SplitPro importer | P2 | Goodwill move |
| Tricount importer | P2 | |
| Generic CSV importer | P1 | |
| CSV / JSON export | P0 | Data portability is mandatory for trust |

### i18n

| Feature | Priority | Notes |
|---------|:---:|---|
| Weblate integration | P0 | |
| Swedish | P0 | Primary target market |
| English | P0 | |
| Norwegian Bokmål | P0 | Vipps market |
| Danish | P0 | Vipps/MobilePay market |
| Finnish | P1 | |
| German | P1 | |
| French | P1 | |
| Spanish | P1 | |
| RTL support | P2 | Arabic, Hebrew |

## Differentiation summary

If a journalist asks "how is Quits different from Splitwise?" the answer is three sentences:

1. **You own your data.** Open source, self-hostable, full export, no lock-in.
2. **Native Nordic payments.** One tap to settle via Swish, Vipps, or MobilePay.
3. **Free in self-host, sane in hosted.** No paywalls on adding expenses or searching history.

If a Swedish user asks "how is Quits different from Steven?" the answer is two:

1. **It is open source and not run by a struggling fintech.** Multiple maintainers, transparent uptime, you can host it yourself if you want.
2. **It works the same way Steven did before it broke.** Reliable Swish integration, simple group splits, fast.

## What success looks like

Year 1 success metrics (in priority order):

1. **1,000+ active self-hosted instances** (telemetry opt-in or community survey signal).
2. **5,000+ hosted-tier signups, of which 500+ paying**.
3. **Top 3 GitHub result for "self-hosted splitwise alternative"**.
4. **Mentions in r/selfhosted, NetworkChuck, awesome-selfhosted, Mastodon FOSS communities**.
5. **One credible Swedish media mention** (Breakit, Di Digital, Computer Sweden, Ny Teknik).
6. **No Splitwise/Steven-style outages logged**.

Year 2 success metrics:

1. **10,000+ self-hosted instances**.
2. **Hosted tier covers core developer costs (1 FTE or distributed across 2 contributors)**.
3. **Active second maintainer with merge rights**.
4. **Feature parity with Splitwise Pro on all P1 items**.
5. **Vipps/MobilePay launched, Norwegian and Danish user bases live**.
