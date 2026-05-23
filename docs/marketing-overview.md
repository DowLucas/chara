# Chara — Marketing & Value Overview

> *Vi är chara.* Open-source, self-hostable bill splitting with real native apps and first-class Nordic payment rails.

This document is the marketing-facing, value-first write-up of what Chara is, why it exists, who it's for, and what is actually shipped today. It is grounded in the current state of the codebase (`app/`, `backend/`, 38 migrations, ~240 app tests, full integration coverage on the backend) — not in roadmap aspiration.

---

## 1. The One-Liner

**Chara is the open-source, self-hostable bill-splitting app with native iOS, Android, and Web clients — and the only one with first-class Swish, Vipps, and MobilePay integration.**

---

## 2. The Pitch in Three Sentences

> Splitwise paywalled the basics. Steven keeps going down. Tricount is owned by a bank.
>
> Chara is open source under AGPLv3, runs on a Raspberry Pi or our hosted service, has real native apps, and is the only bill splitter with first-class Nordic payment-rail integration.
>
> Bring your data with you. Settle in one tap. Own the whole stack.

---

## 3. Why Chara Exists

Three things broke in the bill-splitting market in the last 24 months — and nobody filled the gap.

### Splitwise paywalled the basics
Splitwise — the global incumbent since 2011, ~10M users — now caps the free tier at roughly **3 expenses per day**, adds throttling delays, runs banner ads, and locks search, receipt scanning, charts, and currency conversion behind a ~$3/month Pro subscription. Free-tier users are vocally, publicly angry.

### Steven collapsed
Sweden's beloved bill-splitter spent the last few years pivoting into fintech — a Mastercard card, subscription tracking via Minna, BankID flows. The pivot consumed development capacity. Recent App Store reviews are brutal: **week-long backend outages, broken SMS login, disappearing text fields, zero communication during incidents**. Long-time users say openly they have churned or are looking for alternatives. *Swish is the single feature keeping Steven alive — and Chara has it.*

### The OSS field never produced a real Splitwise
| Project | Stars | Stack | Why insufficient |
|---|---|---|---|
| Spliit | 2.6k | Next.js PWA | Web-only, no auth, no native apps |
| SplitPro | 1.1k | Next.js PWA + tRPC | Web-only PWA, no Nordic rails |
| Splito | ~600 | SwiftUI + Firebase | iOS-only, Firebase-locked (can't self-host) |

**No existing product hits all four corners: open source + self-hostable + native iOS&Android + Nordic payment rails.** That intersection is Chara's defensible moat.

---

## 4. What Makes Chara Different

### 4.1 You actually own your data
- **AGPLv3** — same license as Immich, Mastodon, Grafana. SaaS clones can't fork it closed.
- **Single Docker Compose** deploys backend + Postgres + MinIO on a fresh Raspberry Pi 5 in under 10 minutes.
- **AMD64 and ARM64** images.
- **OIDC out of the box** (`coreos/go-oidc`) — Authentik, Keycloak, Authelia, Zitadel all plug in.
- **CSV/JSON export, always.** Data portability is a P0 feature.
- **Magic-link auth** as a universal fallback — no SMS provider required.

### 4.2 Real native apps, from a single codebase
One Expo/React Native codebase targets iOS, Android, and Web. Not a PWA in a trench coat.

- Native push via **Expo Push Service** — no APNs/FCM secrets for self-hosters.
- Local cache, optimistic writes, instant feel.
- ~240 Jest tests across the app; full integration test suite on the backend.

### 4.3 Multi-server accounts — *nobody else has this*
The app holds **N independent server-accounts at once** and aggregates them into one inbox-style UI. Your homelab + your partner's homelab + Chara Cloud, all in one tab. Each group is keyed by `(serverUrl, groupId)`; writes route to the correct server; reads fan out in parallel (`Promise.allSettled` — one slow server never blocks the rest). Per-server status (`idle | loading | ok | error | reauth_required | incompatible`) is persisted and recovers on its own when a server is upgraded.

This is **aggregation, not federation** — servers don't talk to each other, the link lives only on this device. It's the cleanest answer to the "but my friends are on a different server" problem in the entire OSS bill-splitter field.

### 4.4 The Nordic wedge: Swish that actually works
- **One tap to settle.** "Settle with Swish" → opens the Swish app prefilled with amount, recipient, and a `Chara · <group>` reference. Eligibility validated on E.164 SE mobile numbers (`+46 70/72/73/76/79…`) and SEK currency only — no fake "settle" buttons that fail at the rail.
- **Vipps (Norway), MobilePay (Denmark)** on the immediate roadmap behind Swish.
- A generic payment-link field for everyone else (PayPal, Revolut, IBAN, your link).
- **Manual mark-as-settled** is always free and always works.

### 4.5 Money math you can trust
- **Every value stored as int64 minor units** (öre, cents). No float drift, ever.
- Decimal strings on the wire — never floats, never `Number`.
- Leftover pennies distributed deterministically by amount and date.
- **Per-currency totals only.** Chara *refuses* to silently sum across currencies and lie to you. FX rates exist (daily ECB snapshots, `fx_rates` table) for display conversion, but balances are always per-currency truthful.
- **Bidirectional protocol versioning** between app and server (`X-Chara-App-Protocol` header). Out-of-range builds receive a clean `426 Upgrade Required` with actionable copy — never a silent corruption.

### 4.6 Receipts that don't suck
- **Receipt OCR via Gemini Flash.** Snap the receipt → merchant, date, total, tax, tip pulled into the form.
- **Item-level extraction + assignment** (`ScanItemsAssign`): scan an itemized receipt, tap each line to assign it to whoever ordered it. The split builds itself.
- **Opt-in per instance.** Self-hosters who don't want AI in their setup just don't set `GEMINI_API_KEY` — the `/.well-known/chara-instance` endpoint advertises `features.ocr=false` and the UI silently drops the button. Zero feature pressure.
- Attachments stored on S3-compatible storage (MinIO bundled), keyed by group + date so you can find that hotel bill in November.

### 4.7 Settle-up suggestions: the minimum number of payments
A greedy max-creditor / max-debtor algorithm (`internal/settle/suggest.go`, O(N log N)) returns **≤ N-1 transfers per currency** to zero everyone. The standings tab renders the list above the per-member balances. No more "I'll Venmo you, you Swish them, they'll CashApp me" chains.

### 4.8 Settlement impact, before you commit
Editing or deleting an expense in a group with prior settlements is dangerous — it can retroactively change who owes whom. Chara's `SettlementImpactSheet` previews the balance delta *before* you save, in plain language, so you don't accidentally rewrite history.

### 4.9 A design language that respects the eye
- Warm, earthy palette — **bone, paper, graphite, brick, moss, amber**. Trustworthy, not corporate.
- **Color carries semantic weight.** `brick` = "you owe" / destructive. `moss` = "you're owed" / settled. `graphite` = neutral facts (your share, an amount on a list row). Signal color only where direction actually matters.
- **Typography by intent.** Display sans for names and titles. Body sans for prose. **Mono for digits, dates, codes, eyebrow labels** — with `tabular-nums` so columns align.
- Bone cards over edge-to-edge dividers. Soft hairlines, no SaaS chrome.
- Every popup goes through one queued `showAlert` host — no native `Alert.alert`, no `ActionSheetIOS`, no inconsistent iOS-vs-Android voice.
- **Backdrop tap-through guard** on every modal so dismissing a sheet by tapping a row underneath doesn't chain-open that row's popup. A small detail nobody else gets right.

### 4.10 i18n is mandatory, not bolted on
Every user-facing string flows through `t()`. The catalog is namespaced JSON in `app/lib/locales/`. Locale-aware date, time, and money formatting helpers live in `app/lib/i18n.ts`. Adding a new language means dropping in one JSON file. Swedish, Norwegian Bokmål, and Danish are first-class targets.

---

## 5. What Is Actually Shipped Today

Grounded in the current codebase, not the roadmap. (See `docs/implementation-status.md` for milestone detail.)

### Backend (Go + Chi + sqlc + Postgres + River)
- ✅ Magic-link auth + JWT issuance, OIDC plumbing, dev-mode bypass for local iteration
- ✅ Groups CRUD with invite-link join (Tricount-style)
- ✅ Expenses CRUD with **equal / exact / percentage** split methods
- ✅ Activity log written in the same DB transaction as every mutation (audit trail = trust)
- ✅ Per-member balance view, settle-up endpoint, **settle-up suggestions** (minimum transfers)
- ✅ Cross-group `GET /api/me/balances` aggregate
- ✅ Receipt attachments via S3-compatible storage (`internal/storage`)
- ✅ Receipt OCR via Gemini (`internal/receipt`) — single-receipt and itemized-line modes
- ✅ FX rate snapshots (`fx_rates`), per-expense FX (`expense_fx`), conversion endpoint
- ✅ Group settings: stats, lock/unlock, archive/unarchive, hard delete, member removal, can-leave precheck
- ✅ User avatars (object-store backed)
- ✅ Group language preference (`groups.language`)
- ✅ Push token registration (multi-account fan-out target)
- ✅ Protocol versioning middleware — `X-Chara-App-Protocol` → 426 on mismatch
- ✅ `/.well-known/chara-instance` for client capability discovery
- ✅ Health endpoints, OpenAPI groundwork, full integration test suite (testcontainers)
- ✅ CI building multi-arch Docker images

### Mobile + Web app (Expo / React Native)
- ✅ Multi-server account model end-to-end (16 Jest suites covering it)
- ✅ Aggregated home, balances, and activity tabs (parallel fan-out, SWR cache, per-account status)
- ✅ Sign-in with magic link + Google OAuth (hosted) / OIDC (self-host)
- ✅ Onboarding (name, create-first-group)
- ✅ Group detail (expenses tab, standings tab, activity tab)
- ✅ Expense add/edit/delete with **Settlement Impact Sheet** preview
- ✅ Amount keypad with currency, calculator expressions (`evalExpression`)
- ✅ Receipt scanner (full-screen camera) + item-assign UI
- ✅ Receipts via gallery/share-sheet
- ✅ Group settings hub: members, lock, archive, hard delete, danger zone, stats card, FX conversion section
- ✅ **Swish deep-link settlement** (SE only, validated E.164, SEK only)
- ✅ Security code / PIN lock per account
- ✅ Push token bootstrap with fan-out to every linked server
- ✅ Compat recovery probe (cold launch + foreground) — auto-clears `incompatible` when a server upgrades
- ✅ Backdrop tap-through guard, queued AppAlert system, custom ActionSheet
- ✅ App-wide i18n (English shipping; Swedish, Norwegian, Danish on deck)

### Marketing site (`marketing/`)
- ✅ Static Astro/HTML landing page with hero, values, features, comparison table, FAQ
- ✅ Cookies, DPA, privacy, security, terms pages

### Infrastructure
- ✅ Docker Compose dev environment (`backend/docker-compose.yml`)
- ✅ AMD64 + ARM64 images via GitHub Actions
- ✅ `golang-migrate` plain SQL migrations (38 and counting)
- ✅ MinIO bundled for self-host receipt storage

---

## 6. Who Chara Is For

In priority order:

| Audience | Pain | What Chara gives them |
|---|---|---|
| **Swedes leaving Steven** | App outages, fintech distrust, churn | Working Swish, Swedish UI, an app that doesn't go down for a week |
| **r/selfhosted / r/homelab** | No native-app self-host option exists | Docker Compose, OIDC, ARM64, real native iOS + Android. The "Immich of bill-splitting" |
| **Splitwise refugees globally** | 3-expense-per-day cap, ads, $3/month for search | One-click import, no caps, no ads, no Pro tier |
| **Privacy-minded households** | Don't want a closed app touching their bank | Open source, auditable, no bank linking required, never asks |

Explicitly **not** the target: B2B teams that want SCIM and audit logs, people who want a budgeting app, anyone expecting Chara to hold money.

---

## 7. What Chara Will Never Do

These are real commitments. Each one represents temptation that should be resisted in v1 and possibly forever.

1. **Never become a payments processor.** Chara never holds money. All settlement is external. No KYC, no AML, no PSD2 — and therefore no regulatory time-bomb. *This is the trap Steven walked into.*
2. **Never become a bank.** No card, no debit account, no fintech sprawl.
3. **Never become a budgeting app.** Splitwise wandered into this and diluted its core. Chara settles shared expenses. Personal finance is somebody else's job.
4. **Never gate features behind a "Pro" tier against self-host.** Self-hosters get every feature. Forever. The hosted tier earns its money by *running it for you*, not by holding features hostage.
5. **Never feed your data into ads or training corpora.** Hosted tier is EU-resident, GDPR-strict, full export.
6. **Never become a social network.** No public profiles, no feeds, no "Splitwise Wrapped" virality unless it is opt-in and shareable.

---

## 8. How Chara Makes Money (Without Selling You Out)

A single coherent model, in priority order:

| Stream | What | Pricing |
|---|---|---|
| **Chara Cloud** | Managed hosting, EU-resident, OCR included, 10 GB receipt storage | **€2 / 25 SEK / month**, family plan €5 / 50 SEK |
| **Sponsors** | GitHub Sponsors + Open Collective, in-app "Chara Supporter" badge | €5 / €10 / €25 individual; €100 / €500 corporate |
| **Grants** | FUTO (the Immich playbook), NLnet, Vinnova | Wildcard |
| **Commercial license** | For companies embedding Chara in proprietary software | €2k–€10k one-time, rare |

**What we will never charge for:** processing settlements, holding money, running ads, selling data, "Pro" features the self-host version doesn't get.

The math: ~€0.45/user/month marginal cost on the hosted tier at €2 ARPU → **~77% gross margin**. Healthy SaaS economics without any user-hostile pricing tricks.

---

## 9. The Honest Comparison Table

| | Splitwise Pro | Steven | Spliit | SplitPro | Splito | Tricount | **Chara** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Open source | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | **✅** |
| Self-hostable | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | **✅** |
| Native iOS | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | **✅** |
| Native Android | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | **✅** |
| Web client | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | **✅** |
| Swish (Sweden) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Vipps / MobilePay | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ (roadmap)** |
| OIDC / SSO | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | **✅** |
| **Multi-server accounts** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ (unique)** |
| Receipt OCR | ✅ Pro | ❌ | ✅ | ❌ | ❌ | ❌ | **✅ (opt-in)** |
| Settle-up minimum transfers | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | **✅** |
| Splitwise importer | n/a | ❌ | ❌ | partial | ❌ | ❌ | **✅ (P0 roadmap)** |
| Free expense cap | **~3/day** | none | none | none | none | none | **none** |
| Ads | ❌ Pro hides | ❌ Premium hides | none | none | none | none | **never** |

**No other product hits all four corners — open source, self-hostable, native iOS+Android, and Nordic payment rails.**

---

## 10. The Tech Stack (For Evaluators)

| Layer | Choice | Why it was picked |
|---|---|---|
| Backend | **Go** — Chi router, sqlc, River, `golang-jwt`, `coreos/go-oidc` | Single static binary, sub-second start, ARM64 native, type-safe SQL, no Redis (River runs on Postgres) |
| Mobile + Web | **Expo (React Native)** | One codebase → iOS, Android, Web. Real native push. EAS for builds. |
| Database | **Postgres 16+** | Boring, reliable, plain SQL migrations via `golang-migrate` |
| Storage | **S3-compatible**, MinIO bundled | Works with R2, B2, Wasabi, your own MinIO. No vendor lock. |
| Background jobs | **River** | Postgres-native job queue. No Redis. No second database to babysit. |
| Marketing site | **Static HTML/CSS** | Fast, content-first, no SSR runtime |
| Auth | Magic link + OAuth (hosted) / Magic link + OIDC (self-host) | The model that fits each trust boundary |
| OCR | **Gemini Flash** | Cheap, accurate on Nordic receipts; opt-in per instance |
| Money | **int64 minor units** end-to-end | No float, ever. Decimal strings on the wire. |

Headline technical bets:
- **`X-Chara-App-Protocol` header on every authenticated request.** Out-of-range builds get a clean `426 Upgrade Required`. Old apps don't silently corrupt against new schemas.
- **`/.well-known/chara-instance`** advertises mode (hosted/self-host), version, sign-in methods, feature flags (`features.ocr`, etc.). The app shapes itself to the server.
- **Multi-server account blob** in SecureStore (`chara.accounts`) — single atomic write per mutation, survives cold launches, persists `reauth_required` / `incompatible` status.
- **Activity log in the same DB transaction as every mutation** — no race between "expense saved" and "activity entry missing."

---

## 11. The Brand

Chara's voice is **calm, technical, regionally proud**. Not loud. Not snarky. Not VC-funded-feeling.

The reference brands:
- **Immich** — technical, transparent, mission-driven
- **Bitwarden** — trustworthy, professional, slightly boring in the good way
- **Mullvad VPN** — privacy-first, Nordic, no nonsense
- **Hetzner** — German, low-key, just works

Things Chara is **not**:
- Emoji-laden "we are disrupting" framing
- Cluttered "join 10,000+ teams" landing pages
- Aggressive Splitwise-style growth marketing
- Anything that smells like Series A theater

The landing page is one screenshot, three sentences, two buttons — **Self-host** and **Try hosted** — and the comparison table. Nothing else above the fold.

---

## 12. The Wedge Story, Per Audience

### To a Swede leaving Steven
> Steven gick ner i en vecka. Chara är öppen källkod, har riktig Swish-integration, och om du vill kan du köra den på din egen Raspberry Pi. Samma app, samma kod, ditt val. Migrera dina grupper på en klick.

### To a self-hoster
> Docker Compose, AMD64 + ARM64, OIDC out of the box, MinIO bundled for receipts, real native apps that work with your instance. The Immich of bill-splitting.

### To a Splitwise refugee
> No daily expense cap. No ads. No Pro tier. One-click import — friends, groups, expenses, notes. Hosted for €2/month if you don't want to run it yourself; free forever if you do.

### To a privacy-minded household
> Open source under AGPLv3. Your data lives on your server. No bank linking, no card, no KYC. Full CSV/JSON export at any time. The app never talks to a third party except the payment app you tap "Settle" with.

---

## 13. Definition of Success — Year 1

1. **1,000+ active self-hosted instances** (anonymous opt-in telemetry).
2. **5,000+ hosted-tier signups**, of which **500+ paying**.
3. **Top 3 GitHub result** for "self-hosted splitwise alternative."
4. **One credible Swedish media mention** — Breakit, Di Digital, Computer Sweden, or Ny Teknik.
5. **Coverage in r/selfhosted, awesome-selfhosted, NetworkChuck/TechHut/Sloth YouTube.**
6. **Zero Splitwise/Steven-style outage incidents logged.**

---

## 14. The Honest Scenario Tree

Year-2 outcomes, with rough weights:

- **~60% — Niche success.** Go-to bill-splitter in the self-hosting community. 5k–50k self-hosted instances, 1k–5k paying hosted users, €5k–€30k MRR. Sustainable for one part-time maintainer.
- **~25% — Nordic success + global niche.** The Swedish wedge works. Chara becomes the de-facto Swish-integrated bill splitter, captures the post-Steven Swedish market, rides into the broader Nordics. 50k+ active users, €50k–€150k MRR, 2–3 FTE possible.
- **~10% — Doesn't reach sustainability.** Maintainer burnout, scope creep, or a competing project takes the wedge. Mitigation: ruthless scope, co-maintainer by month 6.
- **~5% — Breakout.** Splitwise raises prices again, FUTO sponsors aggressively, viral moment hits. 250k+ users, €500k+ ARR. Don't plan for it, don't refuse it.

The roadmap and financial planning assume the ~60% outcome. That is the responsible default.

---

## 15. Anti-Patterns We Refuse

Mistakes other OSS projects have made. Chara avoids them deliberately.

1. **Don't promote before there's something to show.** Reddit downvotes "I have an idea" posts; we wait for the demo video.
2. **No paid ads in Phase 1 or 2.** The audience finds projects through trusted communities. Ads signal "VC-funded SaaS" — the opposite of the brand.
3. **Don't badmouth Splitwise or Steven publicly.** "We are open and they are closed" is fine. "Steven is collapsing" is not, even if true. Be the gracious alternative.
4. **Don't promise federation early.** It is the OSS holy grail and almost always fails to deliver. Multi-server *aggregation* is what we built, and we say so honestly.
5. **Don't oversell the AI.** Receipt OCR is a nice-to-have, not the headline. The audience for Chara is skeptical of AI-washing.
6. **Don't accept VC funding that compromises AGPL or the free self-host gift.** The Immich/FUTO path is the better template.

---

## 16. The Closing Argument

Splitwise is a $3/month subscription with banner ads. Steven is a fintech with broken backend uptime. Tricount is owned by a bank. Spliit and SplitPro are web PWAs without real native push.

Chara is the bill-splitting app that **respects the user**. Open code. Your server or ours. Native on every device. Integrated with how people actually move money in their region. It is what Splitwise would be if it had been built by Bitwarden's team in Stockholm.

> *Split it. Settle it. Call it Chara.*
