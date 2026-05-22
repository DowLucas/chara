# 05. Business Model

This is where most open source projects fail: they ship great software, gain a community, and then quietly burn out their maintainers or pivot in a way that breaks trust. The model below is designed to avoid both.

## Guiding principles

1. **Self-host is the gift.** The full product is free under AGPLv3 for self-host. No feature is held back. No "open core" with premium SSO. This is how trust is built and held.
2. **Hosted is the business.** The hosted tier is a real, paid product that pays for development. Pricing it must respect users while sustaining maintainers.
3. **Transparency wins.** Public financials, public roadmap, public decision-making. Immich-style.
4. **Sustainability beats growth.** A project that pays one full-time maintainer for 10 years is more valuable to its users than a project that hits 100k users in 18 months and dies.

## Licensing

### Application code: AGPLv3

The right choice. Reasons:

- **Protects against SaaS-clone forks.** AWS-style "take the code, run it as a managed service, never contribute back" is legally messy under AGPL. This was the lesson MongoDB, Elastic, and Redis learned the hard way. Immich, Grafana, Mastodon all chose AGPL.
- **Self-host is unaffected.** Personal and organizational self-hosting is fully permitted. AGPL only triggers obligations when you provide network access to modified versions, which is exactly the SaaS-clone case.
- **Compatible with the audience.** The self-hosting community knows AGPL and accepts it. Some commercial users might balk but they were never the target.
- **Forces honest dual-licensing options.** If a commercial entity ever wants to build a proprietary derivative, they can pay for a commercial license. This is real revenue (rare but meaningful).

Counter-arguments worth knowing:

- "AGPL scares off corporate contributors." True for some companies (Google's policy famously forbids AGPL). But Chara's audience is individuals and small orgs, not Google.
- "MIT/Apache is friendlier." True, but invites the SaaS-clone failure mode. Spliit and SplitPro are MIT; both could theoretically be cloned and resold tomorrow.

### Mobile binaries: Same code, different distribution

The mobile apps are AGPL-licensed source code, distributed as binaries through the App Store and Play Store. The compilation toolchain, signing, and store presence are operated by the Chara project. Anyone can build their own version from source and distribute it (this is what F-Droid versions would be).

### Trademark: Reserved

The name "Chara" and the logo are not under AGPLv3. They are trademarks held by the project entity (see governance below). Forks must rename. This is the Bitwarden / Vaultwarden pattern and is well-understood by the community.

### CLA: Yes, minimal

Contributors sign a Contributor License Agreement that:

- Confirms they have the right to contribute the code
- Grants the project a non-exclusive perpetual license to use the contribution
- **Does NOT transfer copyright.** Contributors retain copyright in their work.
- Allows the project to dual-license future versions (e.g. an exception for an org that wants AGPL with a specific waiver).

This is the Apache CLA pattern, not the Canonical pattern. The latter is hated for good reason. The former is uncontroversial.

## Monetization streams (in priority order)

### Stream 1: Hosted tier ("Chara Cloud"), primary revenue

The reliable, recurring revenue driver. Pricing must be:

- **Cheaper than Splitwise Pro** (~$3/month). Target €2 / 25 SEK / month with annual discount to €18 / 200 SEK.
- **Free tier real but limited** to drive evaluation. Unlimited expenses (we don't gate the core), but generous-but-finite cloud storage (say, 500 MB for receipts) and OCR usage (say, 20 receipts/month).
- **Family/group plan**: €5 / 50 SEK for up to 6 accounts.

**What the paid tier gets you over self-host:**

- We run it. No maintenance.
- Receipt OCR included (we eat the API costs).
- 10 GB receipt storage (vs 500 MB free).
- Email support.
- EU-hosted, GDPR-compliant infrastructure.
- Custom domain for organizations (e.g. expenses.yourcompany.com) at a higher tier.

Critically, the hosted tier is not feature-gated against self-host. **A self-hoster gets every feature**. They just have to run it. This is the trust commitment.

### Stream 2: GitHub Sponsors + OpenCollective, community support

The supplementary revenue from individual donors and corporate sponsors.

- **Individual tiers**: €5, €10, €25/month
- **Corporate tiers**: €100, €500/month with logo visibility
- **One-time donation** via Stripe and OpenCollective
- **"Chara Supporter" badge** visible in their app instance for $50+ one-time or $5+/month recurring

Estimated revenue at scale (year 2): 200-500 sponsors at average $5/month = $1,000-2,500/month. Real money, not enough to live on, but a meaningful supplement.

### Stream 3: Grants and institutional funding, wildcard

Apply to:

- **FUTO**: this is the model. They funded Immich into stable full-time development without forcing closed features.
- **NLnet** (EU): grants for open internet projects. Bill splitting is a stretch but the data-portability angle works.
- **Vinnova** (Sweden): innovation funding, especially for Nordic-focused projects.
- **Nordics-specific accelerators**: EQT Foundation Ventures, Stockholm-specific tech grants.

None of these are reliable, all of them are real. Plan for none, celebrate any you get.

### Stream 4: Commercial license sales, minor

Companies that want to use Chara code in proprietary software (e.g. embedding the splitting engine in a closed-source app) can purchase a commercial license. Pricing is "ask us", typically €2,000-€10,000 one-time depending on use.

Reality check: this might happen 1-2 times a year. Not a real revenue line, but a real option to leave open.

### Stream 5: Marketplace fees, explicitly avoided

We do NOT take a cut of payments processed through Chara. Chara does not hold money. This is non-negotiable: the moment we touch the money flow, we are subject to PSD2, AML, KYC, and the regulatory burden destroys the project. Steven's pivot here is the cautionary tale.

## Pricing comparison

| Product | Free tier | Paid tier (monthly) |
|---------|-----------|---------------------|
| Splitwise | Capped at ~3 expenses/day, ads | ~$3.00 |
| Steven | Ads | ~$3-5 (varies) |
| Tricount | Fully free, ad-free | n/a |
| **Chara self-host** | **Fully free, full features** | **n/a** |
| **Chara hosted (planned)** | **Free, real limits on OCR + storage** | **€2 / 25 SEK / month, family plan €5 / 50 SEK** |

## Year 1-3 revenue projection (low/mid/high)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Hosted paying users (low) | 100 | 800 | 2,500 |
| Hosted paying users (mid) | 300 | 2,000 | 6,000 |
| Hosted paying users (high) | 700 | 5,000 | 15,000 |
| MRR @ mid (€2 ARPU) | €600 | €4,000 | €12,000 |
| Sponsors @ mid | 50 | 200 | 500 |
| Sponsor MRR (€5 avg) | €250 | €1,000 | €2,500 |
| **Mid total MRR** | **€850** | **€5,000** | **€14,500** |
| **Mid annual revenue** | **~€10k** | **~€60k** | **~€175k** |

These numbers are conservative compared to Immich's growth (Immich went from 0 to ~100k users in ~3 years pre-FUTO). The Nordic wedge plus a working Splitwise importer plausibly hits the mid line.

Year 1 revenue is not enough to support full-time development. Year 2 supports 0.5 FTE at Swedish rates. Year 3 supports 1 FTE comfortably or 2 FTE at distributed-team rates. FUTO grants or similar would bring this forward 12-18 months.

## Cost structure (hosted tier)

Per-user marginal costs at scale, in euros per month:

- Compute (Fly.io / Hetzner): €0.10
- Postgres (Neon EU): €0.05
- Object storage (R2): €0.02
- Email (Resend): €0.02
- OCR API (Gemini Flash, 20 receipts/mo cap): €0.20
- Bandwidth: €0.05
- **Total marginal cost: ~€0.45/user/month**

At €2 ARPU, that is ~€1.55 gross margin per user per month, or 77% gross margin. Healthy for a SaaS, and well within the band where the business can fund itself once volume builds.

Fixed costs (mostly negligible until scale):

- Domain registrations: €50/year
- App Store + Play developer accounts: €120/year
- Error tracking (Sentry team plan): €300/year
- Status page (Better Uptime): €120/year
- **Total fixed: ~€600/year**

These are decimals on the revenue line. Real costs are people, which is why the project must reach the €5k+ MRR mark before considering quitting day jobs.

## Sustainability path

The honest staircase from side-project to sustainable project:

### Stage 1: Side project (Months 0-12)

Lucas builds nights and weekends, paid nothing. Hosted tier revenue is reinvested entirely in infrastructure and OCR API credits. Sponsor income covers domain costs.

**Risk**: burnout. Mitigation: ruthless scope, a co-maintainer brought on by Month 6 even if part-time, dogfooding to keep motivation real.

### Stage 2: Sponsored part-time (Months 12-24)

Sponsor income + hosted MRR covers ~€1500-2500/month, allowing Lucas to scale back consulting (1Dow Technology) by 20-30% to invest more hours. Or, more realistically, brings a contributor on at €500-1000/month part-time.

**Risk**: Lucas's other commitments (Fidify, Eventfold, KTH) compete for time. This is not a problem to solve by working more hours; it is solved by saying no to Chara growth that does not pay for itself.

### Stage 3: Funded or 1 FTE (Months 24-36)

One of: FUTO grant gets approved (year 2), Vinnova grant gets approved, hosted MRR clears €5k+, or a strategic partnership materializes. Lucas or a contributor goes full-time.

**Risk**: feature scope explodes once there is full-time capacity. Mitigation: same ruthless scoping that got the project to this point.

### Stage 4: Sustainable team (Months 36+)

2-3 FTE distributed team. Hosted MRR is the primary revenue line. Self-host remains free and fully featured. The project becomes a permanent fixture in the open self-hosted ecosystem.

This is the Immich path. It is achievable but not guaranteed.

## Governance

### Project entity

Form a Swedish enkel firma or aktiebolag (Lucas can leverage his existing knowledge of Swedish corporate structures from prior tax planning work) once revenue justifies it. The entity:

- Holds trademark and domain
- Receives hosted tier revenue via Stripe
- Receives sponsor income via GitHub Sponsors and OpenCollective
- Pays infrastructure and contractor invoices
- Files Swedish corporate taxes annually

Alternative: use an existing fiscal host like Open Collective Europe. Less control, less paperwork. Worth considering for Stage 1 to avoid premature legal-entity overhead.

### Decision-making

- **Lucas as benevolent maintainer** in Stage 1. Decisions are made publicly via GitHub issues and a small RFC process for non-trivial changes.
- **Maintainer team** in Stage 2+. Add a second maintainer with merge rights. Document the process for adding more.
- **Steering committee** in Stage 4+, only if the project needs it. Not before. Premature governance destroys velocity.

The model to copy is Immich's: clear single lead, transparent decisions, friendly to contributors, but unwilling to design by committee.

### Sponsor-influenced direction

Corporate sponsors do not buy roadmap influence. This is an explicit policy. They get logo visibility, occasional consultations on what they need, but no veto and no priority queue. This is what protects the project's integrity.

## What this is not

Chara is not a VC-fundable business in the traditional sense. The TAM is too small (bill-splitting is a tens-of-millions-of-users market, not hundreds-of-millions), and the open source model caps revenue per user. This is a feature, not a bug.

What Chara is, is a sustainable, mission-aligned project that earns its maintainers a comfortable Swedish middle-class income, serves a real user need, and lasts decades. Bitwarden, Mullvad, Sourcehut, FastMail, Tarsnap. That is the company Chara aspires to keep.

If at any point Chara is offered VC funding: the question is whether the funding lets the project stay AGPL, self-host-free, and trust-aligned. If yes, consider it carefully. If no (and the usual VC ask is to commercialize the open source to justify the return profile), decline. The Immich path with FUTO is the better template.

## The honest scenario tree

There are realistically three outcomes for Chara. Plan for all three.

### Outcome A (most likely, ~60%): Niche success

Chara becomes the go-to bill splitter in the self-hosting community. 5k-50k self-hosted instances, 1-5k paying hosted users, €5-30k MRR. Sustainable for one part-time maintainer, possibly one FTE with grant support. Not a global Splitwise replacement, but a real and beloved tool.

### Outcome B (~25%): Nordic success + global niche

The Swedish wedge works. Chara becomes the de facto Swish-integrated bill splitter, captures a meaningful slice of the post-Steven Swedish market, and rides that into the broader Nordics. 50k+ active users in Sweden, €50-150k MRR, 2-3 FTE possible.

### Outcome C (~10%): Project doesn't reach sustainability

Maintainer burnout, scope creep, or a competing project takes the wedge. Chara is shipped but plateaus and is eventually abandoned or maintained at low velocity. This is the failure case to plan against by enforcing scope and bringing on a co-maintainer early.

### Outcome D (~5%): Breakout

Splitwise raises prices again, FUTO sponsors aggressively, or a viral moment hits. 250k+ active users, €500k+ ARR, 5+ FTE. This is the upside scenario; do not plan for it but do not refuse it.

The roadmap and the financial planning assume Outcome A. That is the responsible default.
