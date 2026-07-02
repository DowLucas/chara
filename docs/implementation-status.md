# Implementation Status

Track what has been built so far. Update this file whenever a milestone is completed.

Last updated: 2026-07-02 (push notifications: Expo send-side)

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

### Push notifications: Expo send-side ✅

Registration (push_tokens table, `POST/DELETE /api/me/push-token`, mobile
`app/lib/push.ts` fan-out) shipped earlier as part of Multi-server accounts.
This adds the missing send half:

- `internal/pushsend` — Expo Push API client (`ExpoClient.Send`), batches
  ≤100 messages/request, omits the `Authorization` header when
  `EXPO_ACCESS_TOKEN` is unset (Expo's public API works without one), logs
  per-message ticket errors (e.g. `DeviceNotRegistered`) without failing the
  batch. No receipt-polling in v1.
- `internal/jobs.PushNotifyWorker` — new River worker/job (`push_notify`
  kind) triggered on `expense_added` / `settlement_recorded`. Looks up
  recipients via the existing `ListPushTokensByGroup` query (excludes the
  actor), builds English-only title/body copy, deep-links to
  `chara://groups/<serverUrl>/<groupId>` (group-level only — no
  expense-specific deep link yet). Fire-and-forget: send failures never fail
  the job.
- `ExpenseHandler.Create` and `BalancesHandler.Settle` enqueue a
  `PushNotifyArgs` job after their transaction commits. Both handlers take
  an optional `*river.Client[pgx.Tx]` (nil when `RECURRING_ENABLED=false`);
  enqueue failures are logged and swallowed, never fail the request.
- `RegisterWorkers` gained `baseURL`/`expo` params; no new `PUSH_ENABLED`
  flag — push piggybacks on `RECURRING_ENABLED` since that's what starts the
  job queue at all.
- `/.well-known/chara-instance` gained `features.push`, tied to
  `cfg.RecurringEnabled` (deliberately **not** `cfg.HasExpo()` — Expo push
  works without a token, so that would undercount capability on self-hosted
  servers). `config.HasExpo()` added for documentation purposes.
- Tests: `internal/pushsend` (httptest-mocked Expo API), `internal/jobs`
  (integration, fake Expo sender + pure unit tests for copy/deep-link
  builders), `internal/handler` (integration, `rivertest.RequireInserted`
  assertions on real expense-create/settle requests + nil-client no-op
  case), `internal/config`/`internal/wellknown` (HasExpo, Features.Push
  regression pinning it to RecurringEnabled).

**Explicitly deferred**: mentions/@-comments (feature doesn't exist), APNs/FCM
direct-key self-host bypass, Expo receipt-polling / delivery confirmation /
automatic `push_tokens` cleanup on `DeviceNotRegistered`, locale-aware
notification copy, per-expense deep links.

**Mobile display readiness (follow-up, same milestone):**

- `app/app.config.ts` — added the `expo-notifications` config plugin (tray
  icon tint only; no custom small icon supplied).
- `app/lib/push.ts` — registers `Notifications.setNotificationHandler` at
  module load, deliberately returning `shouldShowBanner/List/PlaySound:
  false` — a push for something in a group the user might already be
  looking at shouldn't interrupt with an OS banner while the app is open;
  this only governs foreground display, background/killed-app pushes still
  show normally via the OS tray. Also creates the Android `default`
  notification channel before token acquisition (required on Android 8+, or
  notifications don't display at all, foreground or not). Both covered by
  new tests in `app/lib/__tests__/push.test.ts`.
- `app/app/_layout.tsx` — added a cold-launch notification-tap handler
  (`Notifications.getLastNotificationResponseAsync()`) alongside the
  existing warm-tap listener (`addNotificationResponseReceivedListener`).
  The warm listener only fires for taps while JS is already running; a tap
  that launches the app from killed doesn't replay through it, so without
  this a cold-launch tap silently drops the deep link. Both funnel through
  the same `handleDeepLink` → `classifyGroupDeepLink` path (already
  unit-tested in `lib/__tests__/deep-link.test.ts`).
- **Fixed during review**: the cold-launch tap handler above raced the
  accounts blob load — `getLastNotificationResponseAsync()` resolves from
  the root layout's mount effect, which fires before `AccountsProvider`'s
  async SecureStore load completes (and, on the very first render, before
  `AccountsProvider` even mounts). `classifyGroupDeepLink` returned
  `not_loaded` in that window and the tap was silently dropped. Fixed with
  `retryDeepLinkOnceLoaded` (`app/app/_layout.tsx`), which subscribes to
  the accounts store and replays the link once `isLoaded()` flips true.
  This bug pre-dated this PR (it also affected cold-launch universal
  links via `Linking.getInitialURL()`) but push made it load-bearing.
- **Fixed during review**: `ensureAndroidChannel` set its ready flag before
  awaiting `setNotificationChannelAsync`, and the call was unguarded —  a
  rejection would propagate out of the unguarded `void bootstrapPush()` in
  `_layout.tsx` and permanently abort token acquisition for the session.
  Now wrapped in try/catch; the flag only flips on success, so a future
  call retries.
- **Fixed during review**: `internal/handler/balances.go`'s `Settle`
  enqueue mixed identities — `ActorUserID` (used to exclude from
  recipients) was the recorder (`claims.UserID`), but `ActorName` (used in
  the notification copy) was the payer (`fromM.Name`); when someone
  records a settlement between two other members, the copy misattributed
  the action. Now both come from the recorder's own group-member record,
  matching the pattern already used in `expenses.go`.
- **Fixed during review**: `buildGroupDeepLink` used `url.QueryEscape`,
  which encodes spaces as `+` — the mobile side's `decodeURIComponent`
  doesn't unescape `+` to a space. Switched to `url.PathEscape` (correct
  for a path segment; verified it still round-trips through
  `decodeURIComponent` including the un-encoded `:`).
- One-time account/build setup required before push works on a real device
  (EAS APNs provisioning, dev-build-not-Expo-Go, etc.) is documented in
  `docs/03-technical-architecture.md`'s Push notification architecture
  section.

### Home screen: pin groups to top + expenses filter/sort overflow fix (follow-up, same PR) ✅

- `app/lib/pinned-groups.ts` — new local (per-device, SecureStore-backed)
  preference module mirroring `preferences.ts`'s pattern: pin state is
  never synced to any server. Groups are keyed by the same
  `${serverUrl}::${groupId}` composite used for row keys elsewhere.
  `getPinnedGroupKeys`/`pinGroup`/`unpinGroup`/`isGroupPinned`/
  `togglePinnedGroup`. 11 unit tests in
  `lib/__tests__/pinned-groups.test.ts`.
- `app/app/(tabs)/index.tsx` — long-pressing a group row opens an
  ActionSheet with "Pin to top" / "Unpin"; pinned groups sort before
  unpinned ones (stable secondary sort by `created_at` desc, unchanged),
  and show a small bookmark icon next to the group name. Pin state loads
  once on mount and updates local React state immediately on toggle (no
  round trip).
- `app/app/groups/[server]/[id]/index.tsx` — fixed a UI bug where the
  expenses screen's Filter chip (payer name, unbounded length) could grow
  wide enough to push the Sort chip off-screen entirely, since neither had
  `flexShrink` set (React Native's Yoga layout defaults to no shrink,
  unlike web CSS). The sort chip is now explicitly non-shrinking, the
  filter chip shrinks first and truncates its label with an ellipsis, and
  the header row gains `flexWrap` as a fallback on very narrow screens.

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
