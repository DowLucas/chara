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
docker run -d --name quits-postgres -e POSTGRES_DB=quits -e POSTGRES_USER=quits \
  -e POSTGRES_PASSWORD=quits -p 5433:5432 postgres:16-alpine
set -a && . ./.env.local && set +a
go run ./cmd/api
```

---

## Phase 1: MVP backend (Weeks 2–12)

### Week 4 — Backend skeleton ✅

- Go + Chi router scaffolded (`backend/`)
- JWT auth middleware (`internal/auth/`, `internal/middleware/`)
- `/.well-known/quits-instance` endpoint
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
  mounted and `/.well-known/quits-instance` advertises `features.ocr=false`,
  so self-hosters without a Gemini key simply do not see the UI.
- **Mobile**: new `components/ReceiptScanner.tsx` (full-screen `CameraView`
  with viewfinder + shutter). `add-expense.tsx` shows a "Scan receipt"
  button on step 1 gated by `features.ocr`. The scanned merchant /
  total / date prefill the existing form; currency is left as the
  group's setting.
- **Tests**: 7 unit tests for the Gemini scanner (HTTP-mocked) + 9
  handler tests with a fake scanner. All green.

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
- Push notifications (Phase 2)
- Splitwise importer (Phase 2)
- Social auth — Google OAuth, Apple Sign In (hosted tier only, Phase 2)
