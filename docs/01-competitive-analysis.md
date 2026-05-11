# 01. Competitive Analysis

This document is the unvarnished view of every meaningful competitor. The goal is to understand which features are table stakes, which are paywalled, where the incumbents are weak, and where the OSS field has gaps.

## Splitwise (the incumbent)

**Status:** Industry standard since 2011. ~10M+ users. New York / Providence based, founded by Jon Bittner.

**Free tier (degraded as of 2024):**
- Limited to roughly 3 expenses per day before being throttled with delays and ads
- Banner ads throughout the interface
- No receipt scanning
- No charts or category breakdown
- No expense search
- Basic split methods only (equal, unequal, percentage)

**Splitwise Pro (~$3/month or ~$30/year):**
- Unlimited expenses, no ads
- Receipt scanning via OCR (cloud)
- Itemization (line-item splits from a receipt)
- 10 GB cloud storage for receipts
- Currency conversion via Open Exchange Rates
- Spending by category, time-series charts
- Full history search
- JSON backups
- Connect a credit or debit card to see purchases (US only)
- Save default splits

**Native apps:** iOS, Android, Web. The mobile apps are mature with offline-mode, push notifications, contact integration, and home-screen widgets.

**Strengths:**
- Network effects (everyone has it)
- Mature offline-first mobile clients
- Brand trust for a finance-adjacent product
- 100+ supported currencies
- Splitwise import/export ecosystem (many tools build off their JSON)

**Weaknesses:**
- Increasingly user-hostile pricing changes
- No self-hosting, no data portability beyond a manual export
- Closed source, opaque on data handling
- No native Nordic payment rail integration (no Swish, no Vipps, no MobilePay)
- Bank integration is US-only and limited

**Strategic takeaway:** Splitwise is feature-rich but commercially aggressive. Its free tier is now bad enough that users are actively looking for alternatives. This is the global comparison product. Quits's marketing should always have a "vs Splitwise" page.

## Steven (the Swedish incumbent)

**Status:** Founded ~2016 by Steven AB. As of 2022, claimed 165,000 users and 100,000 expenses per month, with a goal of 250,000 users by year-end. Raised via crowdfunding. Pivoted to a fintech model with a Mastercard-branded card and Minna Technologies subscription-management partnership.

**Core features:**
- Group expense splitting
- Swish integration for settling up (Sweden only). This is the single most important feature in the Swedish market
- Mastercard-branded card that auto-imports purchases into expenses
- Subscription tracking via Minna Technologies
- BankID-based auth
- Contact sync, location pinning of expenses
- Automatic reminders to people who owe money
- In-app chat support
- Multi-currency

**Pricing:**
- Free tier with ads
- Steven Premium: ad-free experience, additional features (price not transparently published, varies by region)

**Native apps:** iOS, Android.

**Current state (this matters):**
- App Store reviews are deeply negative. Recurring complaints: backend goes down for days at a time, app is slow, text fields disappear, login (SMS auth) is unreliable, zero communication from developers during outages
- Multiple long-time users in 2024-2025 reviews explicitly saying they have churned or are looking for alternatives
- Last meaningful update was 11 months before recent reviews, suggesting development has slowed dramatically
- The pivot to fintech (card + bank integrations + subscriptions) appears to have crowded out core reliability work

**Strengths:**
- Swish integration is the defining feature in Sweden and has no open source equivalent
- Mastercard card creates auto-import that no app can match without a similar deal
- Brand recognition in Sweden ("Steven" is a verb in friend groups)

**Weaknesses:**
- Operational reliability has collapsed
- Sweden only; cannot expand effectively without Vipps/MobilePay support and proper EU footprint
- Fintech monetization has soaked development capacity
- Closed source, no self-host option, single point of failure

**Strategic takeaway:** Steven is the most important competitor for Quits because (a) the Nordic wedge is the strongest GTM path, (b) Steven users are actively churning right now, and (c) Steven is unlikely to recover because the company appears resource-constrained. Quits's Swedish positioning is "the open source bill splitter that doesn't go down."

## Spliit (OSS, sebastien castiel)

**Repository:** [spliit-app/spliit](https://github.com/spliit-app/spliit), 2.6k stars, 402 forks, MIT license, ~91 contributors, 25 releases, primarily one maintainer.

**Stack:** Next.js, TailwindCSS, shadcn/UI, Prisma, Postgres, Vercel hosting for the official instance. TypeScript ~98%.

**Features:**
- Web PWA only, no native iOS or Android apps
- Group expense splitting with shareable group links (Tricount model: no signup required)
- Equal, percentage, share, exact, adjustment splits
- Categories, currencies, dates, image attachments via S3
- Receipt OCR via GPT-4 Vision (requires user-provided OpenAI key)
- Category inference from title via OpenAI (opt-in)
- Reimbursement expenses
- Search
- Mark group as favorite
- Weblate-based i18n with active translation community

**Strengths:**
- Mature web PWA, polished UI
- No-signup group sharing is genuinely useful for one-off trips
- Active maintainer with consistent release cadence
- Good i18n foundation

**Weaknesses:**
- No native apps (PWA on iOS is fundamentally limited: no real push, no contact integration, no widgets)
- No real auth model (group secrets are the access control)
- No multi-currency conversion of balances
- No recurring expenses
- No bank or payment rail integration
- No debt simplification
- Single-maintainer pace, limited bandwidth for big features

**Strategic takeaway:** Spliit is the lightest of the three OSS options and serves the "one-off trip with friends" use case well. It is not a Splitwise replacement.

## SplitPro (OSS, oss-apps)

**Repository:** [oss-apps/split-pro](https://github.com/oss-apps/split-pro), 1.1k stars, 130 forks, MIT license, ~56 contributors, 97 releases (active development).

**Stack:** Next.js, tRPC, Prisma, Postgres with `pg_cron` extension, NextAuth, TailwindCSS. TypeScript ~97%.

**Features:**
- Web PWA only, no native iOS or Android apps, but PWA supports push notifications
- Authenticated multi-user model (NextAuth: magic link, Google OAuth, OIDC via Authentik/Keycloak/custom)
- Splits: equal, percentage, share, exact, adjustments, settlements
- Categories, currencies, dates, receipts (stored on local disk, not S3)
- Negative expenses (refunds/corrections)
- Activity feed with edits and deletes
- Detailed balances per person and per group
- Optional group debt simplification
- Splitwise import (friends and groups only, expenses not yet imported)
- Data export from balances view and account settings
- Weblate-based i18n
- Recurring transactions via `pg_cron` extension (requires custom Postgres image)
- Bank transaction integration (Plaid, contributed by @alexanderwassbjer, likely Swedish given the surname)
- Currency conversion with multiple rate providers
- Self-hostable via Docker Compose, prebuilt images on Docker Hub and GHCR

**Technical notes worth stealing:**
- All money stored as BigInt, no floats anywhere
- Leftover pennies distributed deterministically across participants based on amount and date
- Balances computed on-the-fly from expenses via Postgres views (expenses are the source of truth)
- Push notifications via PWA (no Apple/Google API keys needed)

**Strengths:**
- The most technically serious of the three OSS options
- Real auth model with OIDC support
- Active two-maintainer development
- Already has recurring expenses, bank integration, currency conversion
- Honest documentation, well-architected for self-hosting

**Weaknesses:**
- No native apps, and PWA on iOS still loses to native (push notification reliability is worse, no contact picker, no location, no widgets)
- Bank integration is Plaid-centric (US-focused), no Tink or GoCardless BAD for EU
- No Swish, Vipps, or MobilePay integration
- Receipts on local disk are a footgun for self-hosters who do not understand persistent volumes
- No receipt OCR
- No charts/insights
- No widgets, no Apple Watch, no Wear OS

**Strategic takeaway:** SplitPro is Quits's closest comp and the most useful reference codebase. The architecture is sound; the gap is native mobile and Nordic payments. Worth seriously considering whether to fork rather than greenfield (see [03-technical-architecture.md](./03-technical-architecture.md) for the analysis).

## Splito (OSS, canopas)

**Repository:** [canopas/splito](https://github.com/canopas/splito), ~600 stars, iOS-only.

**Stack:** Swift, SwiftUI, Combine, Firebase backend.

**Features:**
- iOS-only native app
- Group expense splitting, automatic split calculations, group management
- Polished SwiftUI interface (the best-looking of the three OSS options)
- MVVM architecture, modular structure

**Strengths:**
- Genuinely well-designed native iOS app
- Good reference for SwiftUI patterns if a native iOS layer is ever needed

**Weaknesses:**
- iOS only, no Android
- Firebase backend means it cannot be self-hosted without rewriting the entire backend layer
- No web client
- Less active than SplitPro

**Strategic takeaway:** Splito is a UI reference, not a strategic competitor. The Firebase choice is a dealbreaker for self-hosting. The architecture cannot be evolved into what Quits needs to be.

## Tricount (BNP Paribas, free)

**Status:** Acquired by BNP Paribas in 2022. Free, ad-free, no premium tier as of 2024.

**Features:**
- Group expense splitting with no signup required (shareable link model)
- Equal, percentage, share splits
- Multi-currency
- Simple, clean, "European" UX
- Native iOS, Android, Web

**Strengths:**
- Free and ad-free, no subscription pressure
- No signup is genuinely frictionless for one-off trips
- Strong in continental Europe (Belgium, France, Germany, Italy)

**Weaknesses:**
- Owned by a bank, which raises long-term direction questions
- Fewer power features than Splitwise (no receipt scanning, no charts, no detailed history search, no bank integration)
- No self-hosting
- No native Nordic payment rails

**Strategic takeaway:** Tricount is the "good enough and free" choice for casual users. Quits's MVP should match Tricount's frictionless group-link model as a feature, not compete with it on simplicity. Tricount users are not Quits's target.

## Other apps worth knowing exist

- **Splitterup** (2026 launch): another open source-adjacent Splitwise competitor, currently early. First 1,000 users get premium-for-life.
- **Settle Up**: Czech, freemium, weaker mobile experience.
- **Splid** (formerly Splidshare): German, popular for trips, web + mobile, free with ads.
- **Cospender**, **Splittr**, **Plates**, **Beem It**: smaller players, mostly mobile-only.

None of these threaten Quits's positioning.

## Feature matrix summary

| Feature | Splitwise Pro | Steven Premium | Spliit | SplitPro | Splito | Tricount | **Quits target** |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Open source | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Self-hostable | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Native iOS app | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Native Android app | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Web client | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Equal / unequal splits | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Percentage / share splits | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Itemized (line-item) splits | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P1) |
| Recurring expenses | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (P1) |
| Receipt scanning / OCR | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ (P1) |
| Multi-currency w/ conversion | ✅ | ✅ | partial | ✅ | ✅ | ✅ | ✅ |
| Debt simplification | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Activity feed | ✅ | ✅ | partial | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Charts / insights | ✅ | ✅ | ❌ | ❌ | ❌ | partial | ✅ (P2) |
| Swish integration (SE) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (P0 differentiator) |
| Vipps / MobilePay (NO/DK/FI) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P1) |
| Bank transaction import | partial (US) | ✅ (SE) | ❌ | ✅ (Plaid) | ❌ | ❌ | ✅ (P2: Tink + GoCardless) |
| Splitwise importer | n/a | ❌ | ❌ | partial | ❌ | ❌ | ✅ (P0) |
| OIDC / SSO | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| End-to-end encryption | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P3 stretch) |
| Apple Watch / Wear OS | ✅ (Watch) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P2) |
| Home screen widgets | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (P2) |
| Multilingual / Weblate | partial | partial | ✅ | ✅ | ❌ | partial | ✅ |

## Conclusion

Quits's defensible positioning is the intersection of: open source, self-hostable, native iOS + Android, and Nordic payment rails. No other product hits all four. Splitwise hits two (native apps + web). Steven hits two (native apps + Swish). The OSS field hits one or two each but none all four.

The Nordic wedge is the most defensible because Steven is the only competitor in that intersection and Steven is collapsing. The global play comes after.
