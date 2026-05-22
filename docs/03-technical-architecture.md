# 03. Technical Architecture

This document is opinionated on purpose. Optionality kills solo and small-team projects. Decisions here are meant to be defended or revised explicitly, not drifted.

## Stack at a glance

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Mobile | **Expo (React Native)** | Single TS codebase for iOS, Android, Web. OTA updates via EAS Update. Existing TS fluency. Mature in 2026. |
| Web client | **Expo for Web (same RN code) + a thin marketing site (Astro)** | One UI codebase. Marketing site is static and separate. |
| Backend | **Go (Chi router)** | Fast, low memory, single static binary, strong standard library. Chi is minimal and idiomatic. |
| API style | **REST + OpenAPI (via swaggo/swag or oapi-codegen)** | Standard, tooling-agnostic, generates typed clients for the Expo frontend. |
| DB | **Postgres** | Universal, reliable, supports `pg_cron` if needed. |
| Query layer | **sqlc** | Generates type-safe Go from raw SQL. Stays close to the query, ideal for money math and complex aggregations. No ORM magic hiding the SQL. |
| Auth | **Custom JWT + magic link + social** | `golang-jwt/jwt`, magic link via Resend/SMTP, Google OAuth, **Apple Sign In** (native iOS, `expo-apple-authentication`), OIDC via `coreos/go-oidc` for self-hosters. |
| Background jobs | **River (riverqueue/river)** | Postgres-native Go job queue. No Redis dependency in v1, keeps Compose simple. Strong typed jobs, built-in retries and observability. |
| File storage | **S3-compatible (MinIO bundled in Compose)** | Works with R2, S3, Backblaze, Wasabi, anything S3-API. |
| Push | **Expo Push Service** | Free, works with self-hosted backends, no Apple/Google keys needed. Direct APNs/FCM as advanced option. |
| Email | **Resend (hosted) / SMTP (self-host)** | Magic link delivery, transactional. |
| Search | **Postgres full-text search (`tsvector`)** | Don't ship Meilisearch until cardinality demands it. |
| OCR (cloud) | **Gemini Flash 2.x** | Cheaper than GPT-4V, comparable accuracy on receipts. |
| OCR (self-host) | **Optional Ollama profile + Qwen2.5-VL** | Opt-in for users with GPUs. Default off. |
| FX rates | **Frankfurter (ECB) + fallback to Open Exchange Rates** | Frankfurter is free and ECB-backed. |
| Observability | **OpenTelemetry → user-chosen backend** | Self-host friendly, no vendor lock. Sentry for hosted tier. |
| Hosted tier infra | **Fly.io or Hetzner + Cloudflare R2** | Cheap, EU-friendly, GDPR-clean. |

## Why not other options

- **Why not Next.js**: Spliit and SplitPro both use it. Different framework signals different project. Expo Router handles SSR for web fine, and the single-codebase argument wins.
- **Why not Flutter**: Flutter requires Dart, no code reuse with the Go backend, no real benefit for a CRUD-ish app.
- **Why not native Swift + Kotlin**: 2x maintenance for a solo or small team. Splito is the example: gorgeous SwiftUI app, dead on Android, will never have a self-hostable backend.
- **Why not an ORM (GORM, ent)**: They hide SQL in ways that make migrations and complex aggregations painful. sqlc's "write SQL, get Go" model is the better fit for a project with nontrivial money math. You can read exactly what hits the database.
- **Why not Supabase**: Tempting because of the speed-to-MVP, but self-hosting Supabase is a beast (multiple services, opinionated auth). And it would create vendor entanglement that makes the open-source story messier. Roll the auth and storage ourselves.
- **Why not local-first from day 1 (Zero, PowerSync, ElectricSQL)**: These are excellent and probably the future, but they add an architectural commitment that is hard to reverse. v1 ships with optimistic updates + sync; local-first becomes a v2 marketing moment.

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                │
│  │  iOS App  │    │ Android   │    │  Web App  │                │
│  │  (Expo)   │    │  (Expo)   │    │  (Expo)   │                │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘                │
└────────┼────────────────┼────────────────┼─────────────────────┘
         │                │                │
         │   HTTPS (REST / OpenAPI)
         │                │                │
┌────────▼────────────────▼────────────────▼─────────────────────┐
│                    Chara API (Go + Chi)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Handlers: auth, groups, expenses, balances, settlements,│   │
│  │ activity, search, attachments, importers, webhooks      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  JWT + OIDC │  │     sqlc     │  │  Job runner (River)  │   │
│  └─────────────┘  └──────────────┘  └──────────────────────┘   │
└─────┬──────────────────┬──────────────────────┬────────────────┘
      │                  │                      │
      ▼                  ▼                      ▼
┌──────────┐      ┌─────────────┐       ┌────────────────────┐
│Postgres  │      │  MinIO / S3 │       │ External services  │
│(primary) │      │ (receipts)  │       │ - Expo Push        │
└──────────┘      └─────────────┘       │ - Frankfurter (FX) │
                                        │ - Gemini (OCR)*    │
                                        │ - Swish / Vipps    │
                                        │   (deep links)     │
                                        └────────────────────┘

* Optional, gated behind config flag and user opt-in
```

## Data model (SQL schema + sqlc Go structs)

The schema is written in plain SQL (managed by `golang-migrate`). sqlc generates the Go structs and query functions from it. Money is always `BIGINT` minor units (öre, cents).

```sql
-- users
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- ULID, generated client-side
  email       TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url  TEXT,
  default_currency TEXT NOT NULL DEFAULT 'SEK',
  locale      TEXT NOT NULL DEFAULT 'sv-SE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- groups
CREATE TABLE groups (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  default_currency TEXT NOT NULL,
  simplify_debts   BOOLEAN NOT NULL DEFAULT FALSE,
  share_token      TEXT UNIQUE,          -- Tricount-style anon access
  created_by_id    TEXT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- group_members (captures ghost members not yet on the platform)
CREATE TABLE group_members (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id),
  user_id      TEXT REFERENCES users(id), -- NULL = ghost
  display_name TEXT NOT NULL,             -- for ghosts and display overrides
  role         TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- expenses (immutable header; edits create new revisions)
CREATE TABLE expenses (
  id               TEXT PRIMARY KEY,
  group_id         TEXT NOT NULL REFERENCES groups(id),
  title            TEXT NOT NULL,
  notes            TEXT,
  amount           BIGINT NOT NULL,       -- minor units (öre, cents)
  currency         TEXT NOT NULL,
  category         TEXT,
  date             DATE NOT NULL,
  paid_by_id       TEXT NOT NULL REFERENCES group_members(id),
  split_method     TEXT NOT NULL,         -- 'equal'|'exact'|'percentage'|'shares'|'adjustment'
  is_reimbursement BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_id    TEXT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- expense_splits (one row per participant)
CREATE TABLE expense_splits (
  id         TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  member_id  TEXT NOT NULL REFERENCES group_members(id),
  share      BIGINT NOT NULL             -- minor units owed by this member
);

-- expense_attachments
CREATE TABLE expense_attachments (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES expenses(id),
  storage_key TEXT NOT NULL,             -- S3 object key
  mime_type   TEXT NOT NULL,
  size_bytes  INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- activity (append-only audit log)
CREATE TABLE activity (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,           -- 'expense.created' | 'expense.updated' | etc
  target_id     TEXT,
  diff          JSONB,                   -- before/after for updates
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

sqlc generates typed Go structs (e.g. `db.Expense`, `db.User`) and query functions directly from annotated SQL queries. No ORM layer between the code and Postgres.

Balances are derived, not stored. Computed via a Postgres view that sums `expense_splits` against `paid_by_id` per member. Fast enough at self-host scale.

## Money math: the inviolable rules

1. **All amounts in `int64` minor units.** A 123.45 SEK expense is stored as `12345`. Go's `int64` handles any realistic currency amount without precision loss.
2. **Currency code is always attached.** Never compare or sum across currencies without explicit conversion at a known rate, with the rate stored.
3. **Splits are computed in integer math.** Divide the total by N participants, distribute the remainder deterministically (sorted by member ID) one öre at a time until remainder is zero.
4. **Rounding is one-time.** Compute the splits, store them. Never re-round during balance display.
5. **On the wire, amounts are decimal strings** to avoid frontend JS precision loss. Send `"123.45"` not `123.45`. The Go API marshals `int64` minor units → decimal string before responding.
6. **Display formatting is locale-aware** and happens only at the UI edge.

## Sync strategy

### v1: optimistic updates with last-write-wins

Standard mobile pattern. Client makes a request, applies the change locally immediately, server is the source of truth, conflicts are resolved by server timestamp. This is what Splitwise and Steven do. Good enough for 95% of use cases.

### v2: local-first with proper sync (target: 6-12 months after MVP)

Switch to either:

- **Zero (Rocicorp)**: query-based sync, beautiful DX, still maturing but the team has the strongest track record in this space (Replicache lineage).
- **PowerSync**: more mature, SQLite-on-device, syncs to Postgres. Production-ready.
- **ElectricSQL**: Postgres-native, has been through architectural changes recently.

Local-first becomes the v2 marketing moment: "Use Chara on a plane, in the metro, at a festival." This is a real Splitwise pain point. Save it as a banner feature.

Design v1 APIs so v2 sync can be layered on without breaking changes: avoid relying on server-generated IDs (use ULIDs from the client), avoid implicit timestamps, send full mutation events not partial diffs.

## Debt simplification algorithm

This is a classical minimum-cash-flow problem. The naive approach is O(N²) for small groups; for groups under 50 members, simplicity beats cleverness.

```
Given: net balances per member (sum of paid minus sum of owed)
       Positive balance = group owes them; negative = they owe group

Algorithm:
1. Separate members into creditors (positive) and debtors (negative)
2. Sort both lists by absolute amount, descending
3. While debtors and creditors both non-empty:
   a. Take largest debtor D and largest creditor C
   b. Settle min(|D|, |C|) from D to C
   c. Subtract that amount from both; remove if zero
4. Return the list of settlement edges
```

This produces at most N-1 settlements for N members, which is the theoretical minimum. Make it opt-in per group; some users prefer to see the raw "who owes whom" graph.

Cite the algorithm in the docs. Show the math. This is the kind of thing that builds trust with technical users.

## Auth architecture

Go standard library plus a small set of well-maintained packages:

- **`golang-jwt/jwt`** — JWT signing and verification (HS256 for self-host simplicity, RS256 for hosted tier)
- **`coreos/go-oidc`** — OIDC discovery and token verification for self-hosters with Authentik, Keycloak, Authelia, etc.
- **Resend / SMTP** — magic link email delivery

Supported flows — **hosted tier**:
- Email magic link
- Google OAuth
- Apple Sign In (native iOS, required by App Store rules when any social login is offered)
- TOTP 2FA (`pquerna/otp`)

Supported flows — **self-hosted**:
- Email magic link
- OIDC (for instances with an existing identity provider: Authentik, Keycloak, Authelia, etc.)
- TOTP 2FA

Google and Apple Sign In are hosted-only. They require centralised OAuth app registrations (Google Cloud project, Apple Developer account) that cannot reasonably be delegated to every self-hoster, and the App Store mandate for Apple Sign In only applies to the official hosted app.

### Magic link flow (email)

1. User taps "Sign in with email"
2. Magic link is sent via Resend (hosted) or configured SMTP (self-host)
3. Tap link in email opens the Chara app via deep link (`chara://auth?token=...`)
4. App exchanges one-time token for a signed JWT, stored in Expo SecureStore
5. Subsequent requests include the JWT in the `Authorization: Bearer` header

### Google OAuth flow (hosted tier only)

Standard OAuth 2.0 PKCE redirect. On mobile the redirect lands on the Chara deep link (`chara://auth/callback?code=...`). The API server exchanges the code for an `id_token`, verifies it against Google's JWKS endpoint, upserts the user record, and issues a Chara JWT.

### Apple Sign In flow (hosted tier only)

Apple Sign In on iOS uses the native `ASAuthorizationAppleIDProvider` (via `expo-apple-authentication`), not a web redirect. The device returns a signed JWT (`identity_token`) directly to the app. The flow:

1. App calls `AppleAuthentication.signInAsync()` — native OS sheet appears
2. On success the app receives `{ identityToken, authorizationCode, user, email, fullName }`
3. App posts `identity_token` to `POST /auth/apple`
4. API verifies the JWT against Apple's public keys (`https://appleid.apple.com/auth/keys`)
5. API upserts user (Apple may hide the email on repeat sign-ins; store `apple_sub` as the stable identifier)
6. API issues a Chara JWT; app stores it in Expo SecureStore

**Important Apple-specific details:**
- Apple only provides the user's name and email on the *first* sign-in. Subsequent sign-ins return only `sub`. The server must persist the name on first login.
- "Hide My Email" relay addresses (`@privaterelay.appleid.com`) must be accepted and stored as-is.
- The `aud` claim in the `identity_token` is the Apple **Service ID** (for web) or the **App Bundle ID** (for native). The API must verify the correct audience depending on platform.

**Apple Sign In is hosted-tier only.** Self-hosted instances do not expose this flow. The button is not rendered when the server reports it is running in self-host mode.

Apple Sign In is **not required** for Android or web — only shown on iOS (where App Store rules mandate it if any third-party login is present).

### OIDC flow (self-hosters)

Redirect through the identity provider, callback into the app via deep link, exchange the OIDC `id_token` for a Chara-issued JWT.

## Storage architecture

S3-compatible everywhere. Self-host ships with MinIO in the Compose stack at a fixed path; hosted tier uses R2 or S3.

Receipts and attachments are stored with a key scheme:

```
{instance_id}/{group_id}/{expense_id}/{attachment_id}.{ext}
```

Files are accessed via signed URLs with a short expiry (5 minutes). The API server never proxies file content.

Image processing (thumbnails, EXIF stripping for privacy) happens in a background job on upload. EXIF stripping is on by default; users should not accidentally share location data via receipts.

## Push notification architecture

**Expo Push Service** is the default. It is free, requires no Apple/Google keys for the user, and works for self-hosted instances. The flow:

1. Mobile app on first login registers its Expo push token with the Chara API
2. When an event occurs (new expense, settlement, mention), the API calls Expo's push API with the token
3. Expo delivers via APNs / FCM to the device

For self-hosters who want to bypass Expo entirely (a minority but vocal subset of the audience), provide a config flag to point at direct APNs / FCM with their own keys.

## Payment rail integration

Chara never holds money. All "settlement" is either marking-as-paid (manual) or deep-linking to a payment rail.

### Swish (Sweden, P0)

Swish exposes a `swish://` URL scheme for deep-linking from one app to another:

```
swish://payment?data={base64-encoded-JSON}
```

The encoded JSON contains payee phone, amount, currency, and message. Tap "Settle 240 SEK with Swish" in Chara → opens Swish with everything pre-filled → user confirms in Swish app.

No merchant integration required for person-to-person. This is the simplest possible integration and the highest-value feature in Sweden.

### Vipps MobilePay (Norway, Denmark, Finland, P1)

Post-merger, Vipps and MobilePay are unified. Similar deep-link pattern: `vipps://send?...` or `mobilepay://send?...`. Documentation is public.

### PayPal (P1)

`paypal.me/{user}/{amount}/{currency}` link pattern. Trivial.

### Open banking (P2+)

Tink and GoCardless Bank Account Data for EU, Plaid for US. Read-only transaction import that creates draft expenses. The legal posture here is sensitive: Chara never moves money, only reads transactions with user consent under PSD2 AISP, and the AISP licensing burden is on the data aggregator (Tink, GoCardless), not on Chara. This is fine. Document it carefully.

## Deployment topology

### Self-host (Docker Compose)

Single `docker-compose.yml` with:

- `chara-api` (Go binary)
- `chara-postgres` (Postgres 16+)
- `chara-minio` (S3-compatible object storage)
- Optional `chara-ollama` profile (off by default, for OCR enthusiasts)

Web UI is served by the API container (Expo web build, static assets). Mobile apps connect to the user-specified API URL.

Configuration via environment variables, with a `.env.example` that is heavily commented. Healthcheck endpoints at `/api/health/liveness` and `/api/health/readiness`, matching SplitPro's pattern (this is the standard the audience expects).

### Hosted tier

Fly.io for the API (low cost, EU regions for GDPR, Go binaries deploy as tiny scratch/distroless images) or Hetzner Cloud for cheaper EU compute, with Cloudflare R2 for object storage and Resend for email. Managed Postgres via Neon (EU region) or Hetzner-hosted.

Hosted tier is a separate codebase only in that it has Stripe billing, observability via Sentry, and a different env config. Same Docker image as self-host. Critical principle: **do not let the hosted tier diverge from the self-host build**.

## Fork vs greenfield: the SplitPro question

SplitPro is the closest existing project. Forking it would save 4-6 months. The cost:

- Stuck with Next.js + tRPC + Prisma instead of Go backend
- Brand is "fork of SplitPro" forever, harder to position as a fresh product
- Inherits SplitPro's existing community (positive) and its architectural choices (mixed)
- Mobile apps are net-new either way, since SplitPro has no native mobile

The honest analysis: SplitPro's web client is good enough to use as the web client while building Expo apps that share the same backend. Either:

**Option A (greenfield):** New stack, full control, 6-12 months to feature parity. High risk of taking too long.

**Option B (extend SplitPro):** Contribute heavily to SplitPro and add Expo mobile apps that hit its REST endpoints. Fast. Low brand. SplitPro maintainers may not align with Nordic-first positioning.

**Option C (recommended):** Greenfield backend in preferred stack. Take SplitPro's data model, money math, and importer logic wholesale (AGPL compatibility check first, but MIT in their case so fully fine). Build Expo apps on top. This is the path that respects existing work while preserving optionality.

Make the call after a 1-week spike where SplitPro is deployed, used in anger for daily expenses, and the data model is studied in detail. If after that week the data model has no flaws worth rewriting for, switch to Option B. Otherwise Option C.

## Security posture

- TLS everywhere, no exceptions
- HSTS, secure cookies, SameSite=Lax
- Rate limiting on auth endpoints (10/min per IP)
- Audit log for all destructive actions
- SQL injection: parameterized queries only (sqlc generates these by default)
- No raw HTML rendering of user content
- Receipt images stripped of EXIF on upload
- Backups encrypted at rest with user-supplied key on self-host
- Optional E2EE for expense amounts and notes (P3, major lift)

## Performance targets

- P95 API response < 200ms for read endpoints at 10k groups
- P95 expense-create < 400ms including DB writes
- Cold start of API container < 5 seconds
- Mobile app cold launch < 2 seconds on a 2-year-old phone
- Receipt OCR < 8 seconds end-to-end on cloud tier

These are the SLOs for the hosted tier. Self-host is on its own hardware, so targets there are aspirational.

## Open questions

These are decisions worth deferring until the spike is done:

1. **Do we ship federation eventually?** ActivityPub-style interop between self-hosted instances. Cool, complex, probably P3.
2. **Should there be an iPad-optimized layout?** Expo can deliver, but it is incremental work.
3. **macOS app via Catalyst?** Expo can also do this. Probably worth it for the self-host crowd.
4. **Real-time updates?** WebSocket-based live group state vs polling. Polling is simpler, real-time is delightful when others in your group are adding expenses at the table.
