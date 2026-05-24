# Implementation Status

Track what has been built so far. Update this file whenever a milestone is completed.

Last updated: 2026-05-13 (auth endpoints + dev-mode mock login)

## Auth endpoints (Week 9, in progress)

- `POST /api/auth/magic-link` — issues a magic-link token. With `DEV_MODE=true`
  the response includes the raw `token` and full `link` so the client can verify
  without an email round-trip (used for local development and the mock
  sign-in flow).
- `POST /api/auth/verify` — exchanges a magic-link token for a JWT, upserting
  the user on first sign-in.
- `GET /api/me` — returns the authenticated user.
- CORS middleware added so Expo Web can call the API.

### Local backend run

```
cd backend
docker run -d --name chara-postgres -e POSTGRES_DB=chara -e POSTGRES_USER=chara \
  -e POSTGRES_PASSWORD=chara -p 5433:5432 postgres:16-alpine
set -a && . ./.env.local && set +a
go run ./cmd/api
```

---

## Phase 1: MVP backend (Weeks 2–12)

### Week 4 — Backend skeleton ✅

- Go + Chi router scaffolded (`backend/`)
- JWT auth middleware (`internal/auth/`, `internal/middleware/`)
- `/.well-known/chara-instance` endpoint
- Health endpoints (`/api/health/liveness`, `/api/health/readiness`)
- Postgres migrations via golang-migrate (`backend/migrations/`)
- sqlc codegen configured (`backend/sqlc/`)
- Testcontainers-based integration test harness (`backend/testutil/`)
- CI pipeline: GitHub Actions building Docker images for AMD64 + ARM64

### Week 6 — Core expenses ✅

Commit: `4afbbbe`

- Groups handler with full CRUD + invite-link + join-via-token (commit `57ef560`)
  - 22 integration tests — all green
- Expenses handler with full CRUD
  - Routes: `POST/GET /api/groups/{groupID}/expenses`, `GET/PATCH/DELETE /api/groups/{groupID}/expenses/{expenseID}`
  - Split methods: `equal`, `exact`, `percentage`
  - Activity log written in same DB transaction as every mutation
  - Soft delete (is_deleted flag)
  - 30 integration tests — all green
- `internal/money` package — `Amount` type (int64 minor units, decimal string on wire)
- `internal/split` package — equal/exact/percentage split computation
- `backend/testutil/fixtures.go` — `CreateUser`, `CreateGroup`, `AddMember`, `CreateExpense` helpers

### Week 8 — Balances and settlement ✅

Commit: `TBD`

- Per-member balance endpoint (`GET /api/groups/{groupID}/balances`)
  - Reads from `member_balances` view (migration 000012 adds settlement offsets)
  - Returns member name, user_id, currency, net_balance as decimal string
- Settle-up endpoint (`POST /api/groups/{groupID}/settle`)
  - Creates a `settlements` table record
  - Validates from/to members belong to the group
  - Balance view reflects settlement immediately
- Cross-group balance aggregate (`GET /api/me/balances`)
  - Returns per-group balances for the authenticated user with group name
- Migration 000012 updates `member_balances` view to include settlement offsets (CTE approach)
- Fixed `MemberBalance.NetBalance` type from `int32` → `int64` (view returns BIGINT)
- 12 integration tests — all green

### Receipt OCR (out-of-band feature) ✅

Commit: `TBD`

- **Backend**: new `internal/receipt` package wraps Google Gemini
  (`gemini-3.5-flash`) as a [`Scanner`](../backend/internal/receipt/receipt.go)
  interface that takes raw image bytes + MIME type and returns
  `{merchant, date, currency, total/subtotal/tax/tip}` in minor units.
- **Endpoint**: `POST /api/receipts/scan` (`internal/handler/receipts.go`).
  Auth required. Body: `{image_base64, mime_type}` (JPEG/PNG/WebP/HEIC).
  Returns the parsed `Receipt`. 422 if Gemini cannot find a total, 413
  if the image > 6 MB, 502 on upstream errors.
- **Config**: `GEMINI_API_KEY` env var. When unset, the route is not
  mounted and `/.well-known/chara-instance` advertises `features.ocr=false`,
  so self-hosters without a Gemini key simply do not see the UI.
- **Mobile**: new `components/ReceiptScanner.tsx` (full-screen `CameraView`
  with viewfinder + shutter). `add-expense.tsx` shows a "Scan receipt"
  button on step 1 gated by `features.ocr`. The scanned merchant /
  total / date prefill the existing form; currency is left as the
  group's setting.
- **Tests**: 7 unit tests for the Gemini scanner (HTTP-mocked) + 9
  handler tests with a fake scanner. All green.

### Multi-server accounts ✅

The app now holds N independent server-accounts and aggregates their data
into one UI ("aggregator", not "federation" — servers don't talk to each
other). Full design:
`docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md`.

**Backend (purely additive):**

- `/.well-known/chara-instance` extended with `protocol_version`,
  `min_app_protocol`, `max_app_protocol`. Deprecated alias
  `/.well-known/quits-instance` kept for one release.
- New Chi middleware (`internal/middleware/protocol.go`) on `/api/*`
  reads `X-Chara-App-Protocol`; returns `426` when out of range. Mounted
  on the authenticated group only; well-known stays reachable from
  incompatible clients so they can discover the new min/max.
- New endpoints: `POST/DELETE /api/me/push-token` (fan-out registration
  target), `POST /api/me/logout` (advisory no-op; hook for future
  revocation work).
- New env: `MIN_APP_PROTOCOL` (default `0` for rollout safety),
  `MAX_APP_PROTOCOL` (default `1`).

**App:**

- Composite `(serverUrl, groupId)` keys everywhere. Routes moved to
  `app/app/groups/[server]/[id]/...` and `app/app/expenses/[server]/[id]`.
- `app/lib/accounts-store.ts` — non-React source of truth for the
  `chara.accounts` SecureStore blob (atomic read/write, status
  persistence, subscribe/snapshot for both React and non-React consumers).
- `app/lib/accounts.tsx` — `AccountsProvider`, `useAccounts()`,
  `useAccount(serverUrl)`, `useDefaultAccount()`. Replaces `AuthProvider`;
  `useAuth()` lives on as a backward-compat shim resolving to the default
  account.
- `app/lib/api.ts` — `apiFor(serverUrl)` + `publicApi(serverUrl)` factories
  for per-server access. `requestOn(serverUrl, ...)` injects
  `X-Chara-App-Protocol` and flips account status on 401 / 426. Flat
  exports (`listGroups()`, `createExpense()`, …) stay as shims that route
  through the default account.
- `app/lib/aggregated-reads.ts` — `useAggregatedGroups()`,
  `useAggregatedBalances()`, `useAggregatedActivity()` hooks with parallel
  fan-out (`Promise.allSettled`), per-account status, SWR cache via
  `app/lib/cache.ts`, foreground + focus-based refresh.
- `app/lib/compat-recovery.ts` — cold-launch + foreground probe that
  clears `incompatible` status when a server is upgraded.
- `app/lib/push.ts` — Expo push token bootstrap + per-account fan-out
  registration + token-rotation re-fanout + throttled silent retry.
- `app/lib/migrate-legacy-auth.ts` — one-shot crash-safe migration from
  the legacy single-token SecureStore key into the new blob.
- Settings → Accounts list (`app/app/settings/accounts.tsx`), Add Server
  flow (`app/app/(auth)/add-server.tsx`), sign-in screen parametrised by
  `server`/`mode`/`pendingInvite`, cross-server invite handler
  (`app/lib/invite-handler.ts`), deep-link routing in `app/_layout.tsx`.
- Remove Account is blocked when the user has any non-zero balance on the
  server (`app/lib/balance-utils.ts`); same precheck on "Sign out of
  everything".

**Test counts:** 16 jest suites / 238 tests in the app
(`server-url`, `protocol`, `invite-url`, `cache`, `migrate-legacy-auth`,
`accounts-store`, `request-on`, `discovery`, `aggregated-reads`,
`compat-recovery`, `push`, `invite-handler`, `balance-utils`, plus
existing `security-code`, `store-url`, `swish`). Backend: all packages
green including new `wellknown`, `middleware/protocol_test.go`,
`handler/push_tokens_test.go`, `handler/auth_test.go` (logout).

**Rollout note:** servers initially deploy with `MIN_APP_PROTOCOL=0` so
legacy app builds keep working. Bump to `1` is a separate later deploy
once the multi-server app build reaches the install-base threshold.

**Carried follow-ups** (not blocking; tracked in spec §20 and waves):

- `/onboarding/name` doesn't yet accept a `?server=` param — per-account
  profile editing routes to default account today.
- Spec §14's "Apply to others" CTA after profile save not built.
- `Group.last_activity_at` not yet returned by `/api/groups`; home tab
  sorts by `created_at`.
- Production `HOSTED_SERVER_URL` constant still placeholder until DNS
  flips during the Quits → Chara rename.

### Week 8.5 — Settle-up suggestions ✅

- New endpoint `GET /api/groups/{groupID}/settle-suggestions` returns the
  minimum-cardinality set of transfers that zeros every member, grouped per
  currency. Greedy max-creditor / max-debtor heap algorithm
  (`backend/internal/settle/suggest.go`) — O(N log N), ≤ N−1 transfers per
  currency bucket.
- Pure algorithm + unit tests in `internal/settle/`; integration tests in
  `internal/handler/balances_test.go` (5 cases: two-party, membership, all
  settled, post-settle, multi-currency).
- Mobile: standings tab in `app/app/groups/[id]/index.tsx` renders the
  suggestion list above the per-member balances; new
  `listSettlementSuggestions` API in `app/lib/api.ts`; i18n keys under
  `groupDetail.suggestions*` in `app/lib/locales/en.json`.

### Recurring expenses (shipped 2026-05-24) ✅

Spec: `docs/superpowers/specs/2026-05-24-recurring-expenses-design.md`
Council: `docs/superpowers/specs/2026-05-24-recurring-expenses-council.html`
Plan:  `docs/superpowers/plans/2026-05-24-recurring-expenses.md`

- River queue introduced as the project's first background job system (v0.38.0, in-process inside `cmd/api`, vendored migrations at 000040..000045).
- 2 new tables (`recurring_expenses`, `recurring_expense_splits`) at migrations 000025/000026, polymorphic `(source_kind, source_id)` columns on `expenses`.
- Currency frozen at create; group currency-change is a no-op for existing rules.
- Schedule presets (day/week/month/year × interval 1..365), per-rule IANA timezone, per-rule fire local time (default 09:00).
- HTTP: 8 routes under `/api/groups/{groupID}/recurring` — CRUD + pause/resume + resume-all-after-unlock.
- Mobile: dedicated screen family at `/groups/[server]/[id]/recurring/*`, entered from Group Settings → Automation.
- TDD: shared JSON fixture between Go `internal/recurring` and Jest `app/lib/__tests__/next-fire.test.ts`; integration tests for happy path, catch-up within cap, catch-up overflow, lock/leave pause, idempotency, hard-delete mid-tick, currency immutability, start_date immutability.
- Protocol bumped additively (v1 → v2). `MIN_APP_PROTOCOL` unchanged.

### Week 10 — Web client (Expo for Web) 🔲

- [ ] Sign-in flow with magic link
- [ ] Create group, invite by email or share link
- [ ] Add expense form (equal, exact, percentage)
- [ ] Group view: expenses list, balances summary, activity feed
- [ ] Mobile-responsive layout

### Week 12 — Self-host deployment 🔲

- [ ] Docker Compose that works on fresh server in <10 minutes
- [ ] `.env.example` with every config option commented
- [ ] Backup/restore CLI scripts
- [ ] README with install instructions, configuration reference, troubleshooting

---

## Integration test coverage

| Handler | Tests | Status |
|---------|-------|--------|
| groups  | 22    | ✅ green |
| expenses | 30   | ✅ green |
| balances | 12   | ✅ green |
| settlements | 12  | ✅ green (included in balances tests) |
| settle-suggestions | 5 | ✅ green (in balances tests) |
| settle (unit) | 9 | ✅ green (algorithm) |

Run all integration tests:

```
cd backend && go test -tags integration ./...
```

---

## Known deferred work (out of MVP scope)

- Activity feed UI
- Full-text search (basic ilike query acceptable for Phase 1)
- Image attachments (Phase 2)
- Splitwise importer (Phase 2)
- Social auth — Google OAuth, Apple Sign In (hosted tier only, Phase 2)
- JWT server-side revocation (Phase 2; advisory `POST /api/me/logout` already in place as a hook)
- Federation between Chara instances (P3 per `docs/02-product-strategy.md`; the multi-server work above is aggregator-only)
