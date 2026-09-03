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
- `expo-haptics` added (new dependency, no config plugin required).
  `app/lib/haptics.ts` centralizes 5 named wrappers
  (`hapticLongPress`/`hapticSelect`/`hapticWarning`/`hapticSuccess`/
  `hapticError`) so call sites read as intent rather than raw enum values.
  Wired into: merge-expenses hold-and-select (medium impact entering
  select mode, selection tick per toggle), the home screen's group
  long-press action menu and pin/unpin toggle, three `Switch` toggles
  (Face ID confirm, analytics opt-in, recurring end-date), and the
  execution point (not the confirmation dialog) of every destructive
  action that has one: delete group, leave group, kick member, delete
  expense, revert settlement, delete recurring rule. Settle-up fires
  success/error notification haptics; group creation fires success.

### Group color: fixed silent write failures ✅

Investigated a report of "some users can't see the group color they
selected." Root cause: `app/lib/group-color.ts` mutated its in-memory
override map *before* awaiting the SecureStore write — if that write
failed (Keychain/Keystore error, storage pressure), the exception
propagated up through `GroupColorPicker`'s unguarded `await`, which
skipped both the re-render (`notify()` never ran) and the sheet-close
call. The tap looked like a complete no-op in the moment, and even the
"successful until reload" illusion didn't hold: the next cold launch
re-reads the stale on-disk blob and reverts to the default color with no
error ever shown in between.

Fixed:
- `setOverride`/`clearOverride` now roll the in-memory mutation back if
  `persist()` throws, keeping memory and disk consistent, and rethrow so
  callers know the write failed. 4 new tests in
  `lib/__tests__/group-color.test.ts` covering fresh-write failure,
  update-failure rollback, clear-failure rollback, and recovery on a
  subsequent successful write (31 tests total, up from 27).
- `GroupColorPicker`'s three write paths (`pickSwatch`/`resetToAuto`/
  `submitCustom`) now catch that rethrow and surface a `showAlert` error
  instead of silently leaving the sheet open with no feedback.

**Explicitly out of scope** (per user direction — keep this local-only,
just make local edits reliable): group color remains a pure per-device
preference, never synced to the backend or other group members. Two
users looking at the same group can still see different colors by
design; that's not what this fix addresses.

### Homescreen widgets (iOS WidgetKit + Android RemoteViews) ✅

Small family renders a per-currency hero; medium/large render that hero
plus the largest open group positions, each row deep-linking into the
group. A `+` shortcut in the medium/large header jumps straight into
add-expense for the most recently opened group.

**Architecture: the widget renders from a snapshot, never from the
network.** The iOS extension cannot read the SecureStore tokens
(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, no keychain access group) and the app
has no background-fetch infrastructure. So the app pre-renders
everything — formatting, sorting, truncation, translation, URL encoding
— into shared storage (App Group `UserDefaults` on iOS, private
`SharedPreferences` on Android; Android needs no App Group because the
provider runs in the app's own process). Native does layout only, which
keeps both native implementations small and puts all the logic under
Jest.

Freshness is foreground-only: `lib/use-widget-snapshot.ts` is a passive
consumer of reads the home screen already performs, so it inherits every
existing refresh trigger without adding a second refresh path. A widget
can therefore be hours old, which is why every layout carries an "as of"
stamp and dims past ~6h — stale balances must not read as current.

- `lib/balance-summary.ts` — per-currency bucketing, group/balance join,
  and dominant-row logic extracted from `app/(tabs)/index.tsx` and now
  shared by the home screen and the snapshot builder, so the widget
  cannot drift from the hero. In particular the widget inherits the
  never-collapse-mixed-sign rule rather than reimplementing it wrong.
  16 characterization tests written against the pre-extraction behaviour.
- `lib/widget-snapshot.ts` — pure, fully-injected builder (23 tests).
- `lib/widget-bridge.ts` — swallows all native errors (a widget failure
  must never break the app) and dedups writes by content so the home
  screen's refresh cadence doesn't burn the OS widget-refresh budget
  (10 tests).
- Snapshot is cleared on **every** account removal, not just the last:
  it names the departed server's groups and amounts, and the homescreen
  is readable without unlocking. Asserted by a test that no group name
  survives into a signed-out snapshot.
- `plugins/withWidgets/` — generates the native surface at prebuild
  (`ios/`/`android/` are gitignored). iOS target creation delegates to
  `@bacons/apple-targets` (pinned exact); the plugin itself adds the App
  Group to the **host** app's entitlements, which that library does not
  do and whose absence makes the widget silently show the empty state
  forever.
- Android uses classic RemoteViews rather than Glance — Glance compiles
  into the app module and would require enabling Compose in the RN app's
  Gradle via brittle regex mods, plus a compile cost on every local
  release build. Fixed row slots are pre-inflated and hidden, avoiding a
  `RemoteViewsService` adapter.

Also fixed: `classifyGroupDeepLink` hardcoded a `chara://` prefix while
the dev variant ships `charadev`, so every deep link in a dev build —
push taps included — silently did nothing. The root layout duplicated
the same gate and now delegates it.

**Not yet verified on device.** The Android prebuild path is confirmed
(sources copied, receiver registered, mod is idempotent, module
autolinks), but no iOS or Android build has been run. See the PR for the
required one-time `eas credentials` step before the next `./release`.

### Document receipts: PDF extraction + share-to-Chara ✅

A PDF e-receipt or invoice becomes an expense through the same extract →
confirm → FX → itemize → save → attach flow as a photographed receipt, from
two entry points: a "pick a file" button in the receipt scanner, and the OS
share sheet ("open a PDF anywhere → Share → Chara").

- **Backend**: `/api/receipts/scan` accepts `application/pdf`, validated
  by `%PDF-` magic bytes *before* the billing counter reserves a slot.
  Gemini reads PDF inline; prompt rules cover multi-page invoices (one
  expense, items accumulated across pages) and bank statements /
  transaction lists (not a receipt → `unreadable`). No `PROTOCOL_VERSION`
  bump — an extra MIME value is additive.
- **Scanner**: `lib/receipt-file.ts` validates type + size before any
  base64 read; the phase state machine carries a `ReceiptSource` union so a
  PDF renders a document card. `ReceiptScanResult.image` → `.file`.
- **Share sheet**: `expo-share-intent` (pinned `^5.1.1` — SDK 54) generates
  the iOS Share Extension alongside the `@bacons/apple-targets` widget;
  both share `group.app.chara`. `ShareIntentListener` in the root layout
  classifies the handoff (`lib/share-inbox.ts`), stashes it in the
  session-only `lib/pending-share.ts`, sweeps stale `<UUID>.<ext>`
  artifacts out of the App Group container (the library never deletes
  them), and routes to `app/receipt-inbox.tsx`, which lists groups across
  all linked accounts (sticky create-server first) — the group is an input
  to extraction. `add-expense` consumes the share once group + OCR
  availability are known: scanner mounts via `initialScan` already
  analyzing, or — on a server without `GEMINI_API_KEY` — the file is
  attached without extraction and the user is told to enter the amount.
- **i18n**: all new keys in all 15 locales; `lib/__tests__/locale-parity.test.ts`
  now enforces key parity (plural-suffix aware) for every future change.
- **Tests**: backend handler + prompt tests; a `geminieval` build-tagged
  eval against real Gemini (receipt, 3-page invoice, bank statement,
  photographed JPEG). Client: `receipt-file` (12), `share-inbox` (20),
  `receipt-inbox.helpers` (8), locale parity (14).
- **Not verified**: no device run of the share path (the share extension
  is native — Expo Go can't exercise it; needs a dev client on iOS/Android),
  and no Xcode build of the generated Share Extension (Linux host).

### Voice expenses: speak an expense, get drafts ✅

Hold the mic on add-expense, say *"I paid 480 for dinner with Anna and Sara,
and Anna paid 120 for the taxi"*, and get two prefilled drafts. Audio goes to
Gemini in one call that returns both a transcript and structured expenses.

- **Trust boundary**: `internal/voice/resolve.go` revalidates everything the
  model claims about money — member ids against the real roster, amounts via
  `money.ParseDecimal`, and splits **recomputed** by `internal/split` rather
  than copied. Wrong input degrades (exact → equal, invented payer → the
  speaker, off-catalog category → none) instead of failing. The endpoint
  writes nothing; creation still goes through `POST /groups/{id}/expenses`.
- **Backend**: `POST /api/voice/expenses`. Roster lookup fails **closed** with
  403 — unlike the scanner's advisory category lookup, it returns the group's
  membership list. Metered under a new `voice` feature key at 5/month
  (`FreeVoiceCap`); a 45s clip costs roughly 2× a receipt scan because Gemini
  bills audio at ~32 tokens/second. The clarify re-post is text-only and
  deliberately **not** metered. `MaxVoiceAudioBytes` (2 MB) is the
  authoritative bound — the server cannot measure duration without decoding.
  `voice_expense` in `/.well-known/chara-instance`; no `PROTOCOL_VERSION` bump.
- **AI usage tracking** (covers receipt OCR too, which previously recorded
  nothing): `ai_generations` stores tokens, latency and outcome per call plus
  `degraded_split_count` / `unresolved_member_count` — the resolver catching
  the model, which is the drift signal client analytics cannot produce.
  `ai_generation_expenses` links saved expenses to the generation with the
  fields the user changed, giving per-field acceptance rates. No content is
  stored: no transcript, audio, names or amounts. Pruned at 180 days by a
  River job. `users.ocr_cap_override` generalised to `user_feature_caps`.
- **App**: `expo-audio` recording AAC mono 16 kHz @24 kbps — **not** the Opus
  the design called for, because AVAudioRecorder cannot produce Opus on iOS;
  same byte budget. The file is deleted the moment it is base64-encoded.
  Multi-expense results queue behind a banner and reuse the saved overlay as
  the advance point; a failed save leaves the queue intact. The transcript is
  editable, and a text-only path reaches the same review screen.
- **i18n**: all 15 locales, with per-language plural categories (Polish
  one/few/many/other, Arabic zero/one/two/few/many/other).
- **Tests**: `internal/voice` 38 (17 resolver table cases), handler 16 unit +
  8 integration (cap, both refund paths, unmetered re-post, non-member),
  `aiusage` 4, prune job 4, `voice-drafts` 14 client-side. A `geminieval`
  eval covers six spoken cases.
- **Not verified**: **the eval fixtures are not recorded** — they are audio
  and need a person (`internal/voice/testdata/README.md` has the script and
  the ffmpeg line); each missing clip skips its test. No device run: the mic
  is a native module, so it needs a dev client, and this host is Linux.

### Rating prompt at a positive moment (issue #106) ✅

Chara asks for a store rating after a debt is **settled** — the one completed,
unambiguously positive moment — instead of waiting to be found under
**You → Rate us**, which stays exactly as it was.

- **Native sheet, not the deep link**: `expo-store-review`'s
  `requestReview()` rates in-app and is localized by the OS, so the feature
  adds **no strings** and touches no locale file. `store-url.ts` still backs
  the manual You-tab row — the OS caps sheet frequency, so deliberate rating
  must remain possible.
- **Guards** (`lib/review-prompt.ts`, one SecureStore blob at
  `chara.reviewPrompt`, survives cold launch): ≥3 days since first read,
  ≥1 settlement **or** ≥5 expenses, at most once per app version, ≥120 days
  between prompts, and `StoreReview.hasAction()` true. An `installedAt` in
  the future fails the grace period rather than passing it, so a backwards
  clock cannot unlock the prompt. `lastPromptedAt` is written only after
  `requestReview()` resolves — a throwing sheet showed nothing, so it must
  not burn the release's single ask. Apple gives no callback about whether
  the sheet appeared, so these have to be right without outcome feedback.
- **Trigger**: `settle-method.tsx`, 1.5s after `stage === 'done'` renders —
  keyed on the stage, not the Done tap, so navigating away can't cut the
  sheet off. `add-expense.tsx` only increments the counter; it never prompts.
- **Analytics**: `review_prompt_requested { trigger: 'settlement' }`. We
  can't know if the sheet appeared, only how often we asked.
- **Tests**: `review-prompt` 22 — every guard flipped one at a time, the
  persistence round-trip, a pre-`expenses` blob, a corrupt blob, and a
  rejecting `requestReview()`.
- **Not verified**: no device run — `expo-store-review` is a native module,
  so it needs a dev client and ships only through `./release`, not OTA.

### Week 10 — Web client (Expo for Web) 🔲

- [ ] Sign-in flow with magic link
- [ ] Create group, invite by email or share link
- [ ] Add expense form (equal, exact, percentage)
- [ ] Group view: expenses list, balances summary, activity feed
- [ ] Mobile-responsive layout

### Week 12 — Self-host deployment ✅ (PR #89)

- [x] `deploy/setup.sh` — three questions, secrets generated, stack up and
      healthy from the published `ghcr.io/dowlucas/chara-backend` image
      (amd64 / arm64 / arm/v7); Caddy add-on for automatic HTTPS
- [x] `.env.example` with every config option commented
- [x] `deploy/README.md` — install, connect the app, everyday commands,
      backup (volume copy), update, reset
- [ ] Backup/restore CLI scripts (volume-copy one-liner documented instead)

### Monthly summary ✅ (PR #126)

Hosted-only. One push on the 1st of each month telling the user their
summary is ready, and an in-app screen showing it.

- [x] Migrations 000058/000059 — `users.monthly_summary_opt_out`, and the
      `monthly_summary_sends(user_id, period)` idempotency ledger
- [x] `sqlc/queries/summary.sql` — every aggregate derives from one `mine`
      CTE whose filter mirrors the `member_balances` view, so the summary's
      "net" reconciles with the balances shown everywhere else
- [x] `internal/summary` — pure aggregator (no DB, no HTTP, no clock)
- [x] `GET /api/me/summary?period=YYYY-MM&in=SEK`, behind `HostedOnly`
- [x] `features.monthly_summary` in `/.well-known/chara-instance`, tracking
      `IsHosted() && RecurringEnabled`
- [x] Opt-out on `GET`/`PATCH /api/me` (a `*bool`, so an unrelated profile
      edit cannot silently opt someone back in)
- [x] Per-locale push copy for all 16 allowlist languages, zero
      interpolation — Go has no localized month names and applies no plural
      rules, so the numbers stay on the screen the push opens
- [x] Hourly River tick + `SUMMARY_TZ`; fires on the 1st at 09:00 local and
      enqueues one fan-out job, which pages recipients and writes the ledger
- [x] `users.locale` written from the device on push-token registration —
      it was never written before, so localized push would have been English
      for everyone
- [x] App: `chara://summary/<period>` deep link (no server segment),
      `/summary/[server]/[period]` screen, You-tab rows gated on the
      advertised feature, and a notification-preferences screen
- [x] `monthlySummary` + `notifications` namespaces in all 15 locale files

**Computed on demand, no snapshot table.** A back-dated or corrected expense
is reflected the next time the page opens. The trade is that a summary can
change after the user was notified about it; the alternative freezes numbers
that were legitimately wrong.

**Tests**: `internal/summary` 7 unit; `internal/jobs` 5 unit (`shouldFire`,
the deep link) + 6 unit (the copy catalog) + 7 integration (fan-out,
idempotency, opt-out, locale, send failure); `internal/language` 3;
`internal/handler` 7 integration for the endpoint + 4 for locale
reporting; `internal/config` 4 for `SUMMARY_TZ`; app-side `summary-view`
24 and `summary-deep-link` 8.

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
