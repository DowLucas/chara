# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chara is an open-source, self-hostable bill-splitting app (Splitwise alternative). See `docs/` for full product strategy, architecture, and UX diagrams.

## TDD

This project uses Test-Driven Development. Write the failing test first, then the implementation. No implementation code without a corresponding test written beforehand.

## Implementation status

`docs/implementation-status.md` tracks which milestones are complete and what tests exist. Update it whenever a milestone is finished.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Go — Chi router, sqlc, River job queue, golang-jwt/jwt, coreos/go-oidc |
| Mobile | Expo (React Native) — iOS, Android, Web from one codebase |
| Marketing site | Astro (static) |
| Database | Postgres 16+ — plain SQL migrations via golang-migrate |
| Storage | S3-compatible — MinIO bundled in Docker Compose for self-host |
| Push | Expo Push Service (default); direct APNs/FCM as advanced option |
| Background jobs | River (Postgres-native, no Redis) |

## Auth model

Auth is split by instance type:

- **Hosted tier**: email magic link, Google OAuth, Apple Sign In (iOS only)
- **Self-hosted**: email magic link, OIDC (Authentik, Keycloak, Authelia, etc.)

Google and Apple Sign In are **not available on self-hosted instances**. The app detects instance type from `/.well-known/chara-instance` and renders sign-in options accordingly.

## Multi-server accounts

The app holds **N independent server-accounts** at once and aggregates their data into one UI. This is **aggregation, not federation** — servers don't talk to each other; "linking" lives only inside the app, on this device. The full design is `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md` — read it before changing anything in this area.

Rules every new piece of code must follow:

- **Composite identity.** A group is identified app-wide by `(serverUrl, groupId)`, never by a bare id. Routes are `/groups/[server]/[id]/...` and `/expenses/[server]/[id]`. When pushing routes, `encodeURIComponent(serverUrl)`; when reading from `useLocalSearchParams`, `decodeURIComponent(server)`. **Both sides or neither.**
- **No global "active account".** Routing of writes is **context-determined**: group screens route to that group's server, profile/PIN/Face ID writes target the specific account being edited. New-group / scan-unknown-invite are the only server-ambiguous actions — they use `lastUsedCreateServerUrl` (sticky) with a chooser fallback.
- **Per-server API access.** Call `apiFor(serverUrl).X()` for any new code that talks to a backend. The flat exports in `app/lib/api.ts` (`listGroups()`, `createExpense(...)`, …) are **backward-compat shims** that route through the default account; do not use them in new screens. `publicApi(serverUrl)` is the unauthenticated equivalent (well-known, magic-link request, verify).
- **No new `useAuth()` consumers.** `useAuth()` is a deprecated shim resolving to the default account. New code uses `useAccounts()` (list + mutators), `useAccount(serverUrl)` (one account), or `useDefaultAccount()`. Auth gates check the right thing for the situation (often `accounts.length > 0`, sometimes `defaultAccount?.status === 'reauth_required'`).
- **Aggregated reads.** Home, balances, activity, and any future "across all my groups" surface uses the hooks in `app/lib/aggregated-reads.ts` — parallel fan-out, per-account `status` (`idle | loading | ok | error`), partial-failure tolerance, SWR cache. Never `Promise.all` across accounts (one slow server should not block the rest); always `Promise.allSettled`. Per-currency totals only — never sum across currencies.
- **Per-account status is persisted.** `reauth_required` (401) and `incompatible` (426) live in the accounts blob and survive cold launches. Cold-launch + foreground probes (`compat-recovery.ts`) clear `incompatible` when the server is upgraded. Cache reads need to *skip* accounts in these states.
- **Push tokens fan out.** One Expo token registered with **every** linked server. Add/remove account → register/unregister on that server. Token rotation → re-fan-out. Notification payloads must include the `serverUrl` of the originating server in the deep link.
- **Server identity is the join key.** `normalizeServerUrl()` (`app/lib/server-url.ts`) is the only entry point for accepting a URL string. `https://` always allowed; `http://` only for loopback/private hosts. No path, no query, no trailing slash. Pasted URLs with a path are rejected at entry.
- **Bidirectional protocol compat.** Every authenticated request sends `X-Chara-App-Protocol: <APP_PROTOCOL_VERSION>` (`app/lib/protocol.ts`). The backend has Chi middleware that returns `426` when out of `[MIN_APP_PROTOCOL, MAX_APP_PROTOCOL]`. The app's discovery handshake (`runDiscoveryHandshake`) checks both directions before sign-in. **Bump `PROTOCOL_VERSION` on breaking changes**; additive optional fields/feature flags don't bump.
- **Storage layout.** A single SecureStore blob at key `chara.accounts` holds every account + the device's `defaultServerUrl` / `lastUsedCreateServerUrl`. Atomic write per mutation. Mutate via `accounts-store.ts` (non-React; safe from background tasks) or `useAccounts()` (React). Never write the key from anywhere else.
- **Account removal has a precondition.** The Remove Account flow refuses when the user has any non-zero balance on that server (and refuses if the balance check fails — fail safe). The same precheck applies to "Sign out of everything". Future destructive flows touching an account should check `hasOpenBalance()` first.

## Money

All monetary values are stored and computed as **int64 minor units** (öre, cents). Decimal strings on the wire. Never use floats for money.

## Mobile UI conventions

### Popups & modals

- **Never use `Alert.alert(...)`.** All confirmations, errors, and notices go through `showAlert(...)` from `@/lib/app-alert`. It returns `Promise<string | null>` resolving to the tapped button's `key` (or `null` on backdrop dismiss). One alert visible at a time; subsequent calls queue FIFO.
  ```ts
  const r = await showAlert({
    title: t('foo.title'),
    message: t('foo.body'),
    buttons: [
      { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
      { key: 'delete', label: t('foo.delete'), style: 'destructive' },
    ],
  });
  if (r === 'delete') { /* ... */ }
  ```
  The host is mounted at the root layout. No `Alert` import from `react-native` in screens.
- **Never use `ActionSheetIOS`** directly. The shared `<ActionSheet>` (custom JS bottom sheet) is the only implementation across iOS, Android, and Web. `openNativeActionSheet` is a no-op stub kept for call-site compatibility.
- **Backdrop tap-through guard.** Every modal / sheet calls `markPopupClosed()` on dismiss; every row press handler that opens a popup calls `if (isPopupJustClosed()) return;` at the top. Module lives at `app/lib/popup-guard.ts`. Without it, dismissing a sheet by tapping a row underneath chain-opens that row's popup in the same gesture.

### Card list pattern

Primary content lists (expenses, members, groups, splits) use the **bone card** vocabulary, not edge-to-edge dividers:

- Background: `colors.bone`
- Border radius: `10`
- No border (the bone-vs-paper contrast does the separation)
- Horizontal margin: `spacing.s4`
- Vertical gap between cards: `marginTop: spacing.s2`

Preview / dense lists (home-screen activity preview, members section inside the settings hub) can use a hairline `colors.ruleSoft` divider list. Reserve the heavy `colors.graphite` 1.5px rule for hero-level separators only — for routine section dividers, use 1px `ruleSoft`.

### Color semantics

- `colors.graphite` — neutral facts (per-person share, expense amount on a list row, paid-by-you amount).
- `colors.brick` — "you owe" / "to be paid" / destructive actions.
- `colors.moss` — "you're owed" / completed settlement.
- Only apply signal color where direction actually matters. The expenses tab list is neutral (it's spend history, not balance). The standings tab is colored (it's net per person). The +/- prefix lives only where the value is a balance delta, never where it's just an amount.

### Typography

- `fontDisplay` (SNPro SemiBold) — group names, expense titles, hero amounts.
- `fontBody` (SNPro Regular) — prose meta lines ("you paid · split 4 ways · May 15"), error banners, modal messages.
- `fontMono` (JetBrainsMono) — digits, dates, currency codes, eyebrow labels, status chips. Use `fontVariant: ['tabular-nums']` on amount columns.

If a line is text (a sentence, status word, name), use a humanist sans. If it's a number, code, or technical identifier, mono is fine. Don't put status words like "active" / "settled" in mono — they read like console output.

### Settings-hub list pattern (You-tab style)

For settings-style screens (`(tabs)/you.tsx`, `groups/.../settings.tsx`):

- Section eyebrow above each block (`fontMono`, caption, `colors.lead`, letter-spacing 0.3).
- `list` container: `borderTopWidth: 1, borderTopColor: ruleSoft` — first hairline.
- Each row: horizontal padding `spacing.s5`, vertical padding `spacing.s4`, `borderBottomWidth: 1, borderBottomColor: ruleSoft`.
- `NavRow` (label + chevron) for navigation; `InfoRow` (label + right-aligned mono value) for read-only key/value.

## i18n

The mobile app (`app/`) uses `i18next` + `react-i18next` + `expo-localization`. **All user-facing strings must go through `t()`** — no hardcoded English in JSX, `Alert.alert`, `placeholder`, `accessibilityLabel`, `Share.share`, etc.

- Catalog: `app/lib/locales/<lang>.json`, namespaced by screen (`signIn`, `home`, `groupDetail`, …). English is the only language today; add new locales by dropping a JSON file and registering it in `app/lib/i18n.ts` (`SUPPORTED_LANGUAGES`, `resources`).
- In components: `const { t } = useTranslation();` then `t('namespace.key', { interpolation })`. Outside React (e.g. `ActionSheet` helpers), `import i18n from '@/lib/i18n'` and call `i18n.t(...)`.
- Locale-aware formatting helpers live in `app/lib/i18n.ts`: `formatMinorUnits(minor, currency, { relative })`, `formatDate`, `formatTime`, `currentLocale()`. **Never hardcode a locale** (`'sv-SE'`, `'en-US'`) in `toLocaleString` — use `currentLocale()` or the helpers.
- Currency codes (`SEK`, `EUR`, …) are data, not UI copy — leave them as strings.
- When adding a new screen or string, add the key to `en.json` in the same commit. PRs that introduce raw English strings are incomplete.

### Translation workflow (Weblate)

Non-English locales are managed in **Weblate**, self-hosted on Lurkhuset:

- **URL:** https://translate.lurkhuset.com (Tailscale-only; project: `chara`)
- **Stack:** `/opt/stacks/weblate/` on the Proxmox host. Data on ZFS at `/tank/apps/weblate/{data,db,cache}`. See the `/proxmox-lurkhuset` skill for the standard stack recipe (Caddy route, AppArmor unconfined for Django, ZFS ownership, Uptime Kuma monitor).
- **Source of truth:** the **codebase**, not Weblate. `en.json` is owned by the repo; Weblate writes `sv.json`, `de.json`, etc. Never hand-edit non-English JSON locally — let Weblate's GitHub sync produce the diff.
- **Extracting keys:** in `app/`, `pnpm i18n:extract` walks every `t('…')` call and updates `en.json`. `pnpm i18n:check` is the CI-gate equivalent (fails on drift). Config: `app/i18next-parser.config.js`.
- **Adding a new key:** wrap the string in `t('namespace.key')` → run `pnpm i18n:extract` → edit the English value in `en.json` to the real sentence (parser defaults it to the key) → commit. Weblate picks it up on its next pull and translators see it in their queue.
- **Adding a new language:** in Weblate's UI under the Chara component → Manage → Languages → Add. A new `<lang>.json` will be committed back via the Weblate ↔ GitHub sync.

## Local dev

### Backend with Docker (recommended)

All backend env vars (db config, JWT secret, `GEMINI_API_KEY` for OCR, etc.) live in `backend/.env.local` — gitignored.

```
cd backend && docker compose up -d --build
```

This starts a containerized Go backend with automatic migrations. Verify health with:

```
curl http://localhost:8080/api/health/liveness
```

The container uses `network_mode: host` to reach the postgres container at `localhost:5433`.

### Backend with go run (fast iteration)

For rapid local iteration without Docker overhead:

```
cd backend && set -a && . ./.env.local && set +a && go run ./cmd/api
```

There is no `.env.dev` / `.env.dev.local` split — secrets and dev config are co-located. `.env.example` documents the schema.

### Expo app caching

The Expo app caches `/.well-known/chara-instance` at module load (`app/lib/api.ts`), so after toggling a backend feature flag (e.g. adding `GEMINI_API_KEY`) you must hard-reload the Expo bundle (`r` in Metro) — restarting only the server isn't enough.

## Key architectural docs

- `docs/02-product-strategy.md` — MVP scope, feature priority matrix (P0/P1/P2/P3), target audiences
- `docs/03-technical-architecture.md` — Stack rationale, data model (SQL schemas), auth architecture, storage, payment rails, deployment
- `docs/06-roadmap.md` — Week-by-week build sequence
- `docs/07-ux-diagrams-index.md` — Index of all 82 UX flow diagrams
- `docs/ux/` — Mermaid diagrams for every screen and user flow, organized by area
- `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md` — Multi-server / multi-account design. **Read before touching anything in the auth, accounts, routing, or aggregated-reads area.**
- `docs/superpowers/specs/2026-05-23-edit-expense-design.md` — Edit-expense + settlement-aware confirm sheet. **Read before touching the expense edit/delete path or the SettlementImpactSheet.**
- `docs/superpowers/specs/2026-05-23-group-settings-design.md` — Group settings hub: lock / archive / hard-delete, leave/kick rules, stats endpoint. **Read before touching group lifecycle, group-member removal, or the lock write-gate.**

## MVP scope (P0)

Build only what is marked P0. The full feature matrix is in `docs/02-product-strategy.md`. Resist scope creep — if it is not P0, it is not in the MVP.

Next milestone: **Week 8 — Balances and settlement** (see `docs/implementation-status.md`).
