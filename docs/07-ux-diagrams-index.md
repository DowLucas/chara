# 07. UX Diagrams Index

All screens, navigation flows, and user journeys that need diagrams. Organized by area. Priority follows the same P0/P1/P2/P3 convention as the product strategy doc.

Each diagram entry lists: **type**, **priority**, and what it must show.

---

## 1. App navigation structure

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 1.1 | Overall navigation map | Navigation tree | P0 |
| 1.2 | Bottom tab bar structure | Component | P0 |
| 1.3 | Modal vs push navigation rules | Decision map | P0 |

**1.1 — Overall navigation map**
Full tree of every screen in the app, showing tab roots, stack navigators, modal sheets, and deep-link entry points. The canonical reference for how the whole app is wired together.

**1.2 — Bottom tab bar structure**
The five tabs (Home, Groups, Add Expense, Activity, Profile) and which screen stacks live under each.

**1.3 — Modal vs push navigation rules**
Which actions open a modal sheet vs push onto the stack vs replace the current screen. Prevents inconsistency during build.

---

## 2. Authentication flows

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 2.1 | Magic link auth flow | User flow | P0 |
| 2.2 | Sign in screen variants (hosted vs self-hosted) | Decision map | P0 |
| 2.3 | Google OAuth flow *(hosted only)* | User flow | P0 |
| 2.4 | Apple Sign In flow *(hosted, iOS only)* | User flow | P0 |
| 2.5 | OIDC / SSO flow *(self-hosted only)* | User flow | P0 |
| 2.6 | First-launch onboarding flow | User flow | P0 |
| 2.7 | Deep link callback handling | Technical flow | P0 |
| 2.8 | Session expiry + re-auth flow | User flow | P0 |
| 2.9 | Sign out flow | User flow | P0 |

**2.1 — Magic link auth flow**
User taps "Sign in with email" → enters email → sees confirmation screen → taps link in email → app opens via `quits://auth?token=...` deep link → token exchanged for JWT → lands on home screen. Available on both hosted and self-hosted.

**2.2 — Sign in screen variants**
The sign-in screen differs by instance type. Hosted: Email, Google, Apple. Self-hosted: Email, SSO. App detects instance type from `/.well-known/quits-instance`. Includes the server URL entry screen shown on first launch or when switching instances.

**2.3 — Google OAuth flow (hosted only)**
Tap "Continue with Google" → system browser opens → Google consent → redirect callback → JWT issued → home screen. Not available on self-hosted instances.

**2.4 — Apple Sign In flow (hosted, iOS only)**
Native `ASAuthorizationAppleIDProvider` sheet — no browser redirect. Apple returns `identity_token` directly; backend verifies against Apple's public JWKS. First sign-in only provides name/email. Not available on self-hosted instances or Android/web.

**2.5 — OIDC / SSO flow (self-hosted only)**
Self-hosters with Authentik/Keycloak/Authelia. Configurable issuer URL. This is the primary social login path for self-hosted instances — replaces Google/Apple entirely.

**2.6 — First-launch onboarding flow**
New user post-auth: display name + avatar setup → optional: connect Swish phone number → optional: import from Splitwise → lands on empty home with "Create your first group" prompt.

**2.7 — Deep link callback handling**
All entry points via URL scheme: auth token, OAuth/OIDC callback code, group invite, expense notification tap, settlement confirmation. Shows routing logic.

**2.8 — Session expiry + re-auth flow**
What happens when a JWT expires mid-session: silent refresh attempt → if failed, show re-auth prompt (options match instance type) without losing current navigation state.

**2.9 — Sign out flow**
Profile → Sign out → confirmation → clears local JWT and Expo push token deregistration → back to welcome screen (shows tier-appropriate sign-in options).

---

## 3. Home screen

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 3.1 | Home screen layout (populated) | Screen wireframe | P0 |
| 3.2 | Home screen layout (empty state) | Screen wireframe | P0 |
| 3.3 | Cross-group balance summary | Component | P0 |
| 3.4 | Friends balance list | Screen wireframe | P0 |

**3.1 — Home screen (populated)**
Shows: total balance summary card (you owe / you are owed), list of groups with per-group balance, recent activity strip. Entry points: tap group, tap friend, tap "+".

**3.2 — Home screen (empty state)**
First use. "No groups yet" illustration, CTA to create a group or import from Splitwise.

**3.3 — Cross-group balance summary**
The "you owe Alice 240 SEK total across 3 groups" component. Tapping drills into the per-group breakdown.

**3.4 — Friends balance list**
All people you share expenses with, sorted by outstanding balance. Separate from groups — person-centric view.

---

## 4. Groups

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 4.1 | Create group flow | User flow | P0 |
| 4.2 | Group detail screen layout | Screen wireframe | P0 |
| 4.3 | Group members screen | Screen wireframe | P0 |
| 4.4 | Invite by email flow | User flow | P0 |
| 4.5 | Invite by shareable link flow | User flow | P0 |
| 4.6 | Accept group invite flow (deep link) | User flow | P0 |
| 4.7 | Group settings screen | Screen wireframe | P0 |
| 4.8 | Leave / archive group flow | User flow | P1 |
| 4.9 | Remove member flow | User flow | P1 |
| 4.10 | Ghost member → real user claim flow | User flow | P1 |
| 4.11 | Debt simplification toggle flow | User flow | P1 |

**4.1 — Create group flow**
FAB or "+" → New group sheet → name, default currency, optional avatar → invite members (by email or skip) → group created → lands on empty group detail.

**4.2 — Group detail screen layout**
Expenses list (reverse-chron), balance strip at top showing what you owe/are owed in this group, "Settle up" button, search bar, FAB to add expense. Tab between Expenses / Balances / Activity.

**4.3 — Group members screen**
List of members with their balance in the group. Ghost members (invited but not signed up) shown differently. Admin actions: remove, promote.

**4.4 — Invite by email flow**
From members screen → "Invite" → enter email(s) → send → pending invite state shown.

**4.5 — Invite by shareable link flow**
"Share link" → system share sheet with `quits://join/{token}` URL. Anyone who taps is added to the group. Shows anonymous join and account-linked join variants.

**4.6 — Accept group invite (deep link)**
User receives link → app opens → if logged in: confirmation sheet → joined. If not logged in: auth first → then joined. Edge: link expired or already a member.

**4.7 — Group settings screen**
Group name, default currency, simplify debts toggle, delete group (admin only), export group data.

**4.8 — Leave / archive group flow**
Leave: only allowed if your balance is zero (or confirm with outstanding balance). Archive: admin only, freezes group.

**4.9 — Remove member flow**
Admin removes a member. If they have outstanding balance, show warning. Ghost members can always be removed.

**4.10 — Ghost member → real user claim**
A ghost (added by email before signing up) signs up and the system links their ghost record to their new account. Automatic on sign-up if email matches.

**4.11 — Debt simplification toggle**
Group settings → toggle "Simplify debts" → explanation sheet → confirmation → balances recalculate.

---

## 5. Add expense

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 5.1 | Add expense screen layout | Screen wireframe | P0 |
| 5.2 | Equal split flow | User flow | P0 |
| 5.3 | Exact amount split flow | User flow | P0 |
| 5.4 | Percentage split flow | User flow | P0 |
| 5.5 | Share-based split flow | User flow | P1 |
| 5.6 | Adjustment split flow | User flow | P1 |
| 5.7 | Attach receipt photo flow | User flow | P0 |
| 5.8 | Receipt OCR auto-fill flow | User flow | P1 |
| 5.9 | Per-expense currency selection | User flow | P0 |
| 5.10 | Select payer (not you) flow | User flow | P0 |
| 5.11 | Add expense from Share Sheet (iOS) | User flow | P1 |
| 5.12 | Recurring expense setup flow | User flow | P1 |
| 5.13 | Expense validation + error states | State diagram | P0 |

**5.1 — Add expense screen layout**
Title, amount, currency, date, category, payer (default: you), split method selector, participants, notes, attach receipt. Save / Cancel.

**5.2 — Equal split flow**
Default. Amount is divided equally among all selected participants. Shows remainder distribution logic (one öre at a time to first member alphabetically).

**5.3 — Exact amount split flow**
Each participant gets an input field. Running total shown. Save disabled until total matches expense amount. Error state: doesn't add up.

**5.4 — Percentage split flow**
Each participant gets a % input. Must sum to 100%. Running total shown. Error state: doesn't sum.

**5.5 — Share-based split**
Each participant assigned a share count (integer). Amount distributed proportionally. "2 shares" gets twice as much as "1 share".

**5.6 — Adjustment split**
Starts equal, then per-participant adjustments (±). Running net shown.

**5.7 — Attach receipt photo flow**
Tap camera icon → system photo picker or camera → image selected → uploaded to S3 in background → thumbnail shown on expense form. Upload progress state.

**5.8 — Receipt OCR auto-fill**
Cloud tier only. After photo attached: "Scan receipt?" → loading → amount, title, date pre-filled from OCR → user confirms or edits. Shows confidence indicators.

**5.9 — Per-expense currency**
Currency picker on the add expense form. Shows group default prominently. Selected currency shown on split screen. Note: v1 shows amounts in selected currency, no conversion.

**5.10 — Select payer**
Default is the logged-in user. Tap "Paid by: You" → sheet with group members → select different payer. Useful for logging someone else's expense.

**5.11 — Add from Share Sheet**
User is in Photos app, selects a receipt image, taps Share → Quits in share sheet → Quits opens Add Expense with the image pre-attached and OCR triggered.

**5.12 — Recurring expense setup**
Toggle "Repeat this expense" → frequency picker (weekly, monthly, custom) → start / end date → confirmation of schedule.

**5.13 — Expense validation states**
All the error states: amount is zero, amount doesn't split evenly, no participants selected, future date warning, duplicate detection.

---

## 6. Expense detail & editing

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 6.1 | Expense detail screen layout | Screen wireframe | P0 |
| 6.2 | Edit expense flow | User flow | P0 |
| 6.3 | Delete expense flow | User flow | P0 |
| 6.4 | Expense revision history | Screen wireframe | P0 |
| 6.5 | Comment on expense | User flow | P0 |

**6.1 — Expense detail screen**
Title, amount, date, payer, split breakdown (who owes what), receipt image (tap to full screen), activity/edit history, comments. Edit and delete actions (author or admin only).

**6.2 — Edit expense flow**
Tap edit → same form as add expense, pre-populated → save creates a new revision → activity log updated → push notification to affected members.

**6.3 — Delete expense flow**
Long-press or edit menu → "Delete expense" → confirmation sheet with impact summary ("This will change X balances") → soft-deleted (marked is_deleted, kept for audit) → activity log entry.

**6.4 — Expense revision history**
Tap "Edited X times" on expense detail → timeline of changes: what changed, who changed it, when.

**6.5 — Comment on expense**
Text input at bottom of expense detail. Comments are append-only. Mentions (@name) trigger push notifications.

---

## 7. Balances & settle up

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 7.1 | Group balance screen layout | Screen wireframe | P0 |
| 7.2 | Settle up flow (manual) | User flow | P0 |
| 7.3 | Settle up with Swish flow | User flow | P0 |
| 7.4 | Settle up with Vipps flow | User flow | P1 |
| 7.5 | Settle up with PayPal flow | User flow | P1 |
| 7.6 | Partial settlement flow | User flow | P1 |
| 7.7 | Settlement confirmation + notification | User flow | P0 |
| 7.8 | Debt simplification view | Screen wireframe | P1 |

**7.1 — Group balance screen**
Per-member net balance. "You owe" vs "owed to you" sections. "Settle up" button per person. Simplified vs raw toggle (P1).

**7.2 — Settle up (manual)**
Tap "Settle up with Alice" → amount pre-filled (their full balance) → "Mark as paid" → creates a settlement record → balances update → both users notified.

**7.3 — Settle up with Swish**
Tap "Settle with Swish" → app builds `swish://payment?data={base64}` URL with Alice's phone, amount, message → system opens Swish app → user confirms in Swish → user returns to Quits → "Mark as paid?" prompt → settled. Edge case: no Swish installed.

**7.4 — Settle up with Vipps**
Same pattern as Swish. `vipps://send?...` deep link. Falls back to Vipps web URL if app not installed.

**7.5 — Settle up with PayPal**
Opens `paypal.me/{user}/{amount}/{currency}` URL. Simpler: no callback, user manually confirms.

**7.6 — Partial settlement**
Amount field on settle-up screen is editable. Pay less than the full balance → settlement record with partial amount → remaining balance updated.

**7.7 — Settlement confirmation + notification**
After settlement: both parties get a push notification. The settling user sees a "Settled" confirmation with confetti. The receiving user sees "Alice paid you 240 SEK".

**7.8 — Debt simplification view**
Opt-in per group. Shows the minimum number of transfers needed to settle the group. Visual graph of who pays whom. Compare vs "raw balances" view.

---

## 8. Activity feed

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 8.1 | Group activity feed screen | Screen wireframe | P0 |
| 8.2 | Global activity feed screen | Screen wireframe | P0 |
| 8.3 | Activity item types reference | Component spec | P0 |

**8.1 — Group activity feed**
Reverse-chronological log of all events in the group: expenses added/edited/deleted, settlements, members joining/leaving. Tap an item to navigate to the relevant expense or settlement.

**8.2 — Global activity feed**
All activity across all groups the user belongs to. Same format, grouped by date, with group name shown per item.

**8.3 — Activity item types**
Reference diagram of all possible activity item types and their visual design: expense.created, expense.updated, expense.deleted, settlement.created, member.joined, member.left, group.created.

---

## 9. Search

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 9.1 | In-group search flow | User flow | P0 |
| 9.2 | Global search flow | User flow | P1 |
| 9.3 | Filter + sort screen | Screen wireframe | P1 |

**9.1 — In-group search**
Search bar in group detail → live full-text search of expense titles, notes, amounts → results list → tap to expense detail.

**9.2 — Global search**
Search bar on home/activity → searches across all groups → results grouped by group.

**9.3 — Filter + sort**
Filter by: date range, category, payer, amount range. Sort by: date (default), amount, title.

---

## 10. Notifications

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 10.1 | Push notification types reference | Reference | P0 |
| 10.2 | Notification → deep link routing | Technical flow | P0 |
| 10.3 | In-app notifications list screen | Screen wireframe | P1 |
| 10.4 | Notification preferences screen | Screen wireframe | P0 |

**10.1 — Push notification types**
All notification types: new expense added to your group, expense you're in was edited, settlement received, settlement reminder, group invite, mention in comment.

**10.2 — Notification → deep link routing**
User taps a push notification → app opens → routing logic based on notification payload → lands on correct screen (expense detail, group, settlement, etc.). Covers foreground vs background vs cold-start app states.

**10.3 — Notifications list screen**
In-app inbox for notifications (for users who miss push). Unread indicator. Mark all read.

**10.4 — Notification preferences**
Per-category toggles: new expenses, settlements, edits, mentions, group invites. Push + email channels.

---

## 11. Profile & account

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 11.1 | Profile screen layout | Screen wireframe | P0 |
| 11.2 | Edit profile flow | User flow | P0 |
| 11.3 | Payment method setup flow | User flow | P0 |
| 11.4 | Language / locale settings | Screen wireframe | P0 |
| 11.5 | Connected accounts screen | Screen wireframe | P1 |
| 11.6 | Export my data flow | User flow | P0 |
| 11.7 | Delete account flow | User flow | P1 |

**11.1 — Profile screen**
Avatar, display name, email, Swish phone (if set), payment links, linked OAuth accounts, notification prefs, language, export, sign out, delete account.

**11.2 — Edit profile**
Name, avatar (camera / library / remove), Swish phone number (used to pre-fill Swish requests to you), default currency.

**11.3 — Payment method setup**
User sets their Swish phone number and/or Vipps number and/or PayPal.me link. This is what others see when settling with them.

**11.4 — Language / locale settings**
Language picker (sv, en, nb, da, fi, de, fr, es). Currency format. Date format. First day of week.

**11.5 — Connected accounts**
OAuth providers linked to account (Google, GitHub, Apple). Add / remove. Passkey management (P1).

**11.6 — Export my data**
"Export all my data" → generates zip of CSV + JSON → download link sent by email or direct download.

**11.7 — Delete account**
Confirmation flow. Warning: groups where you are the only admin will be archived. Download data first prompt. Hard delete after 30-day grace period.

---

## 12. Import flows

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 12.1 | Splitwise import flow | User flow | P0 |
| 12.2 | Steven import flow | User flow | P1 |
| 12.3 | CSV generic import flow | User flow | P1 |
| 12.4 | Import review + conflict resolution screen | Screen wireframe | P0 |

**12.1 — Splitwise import**
Profile → Import → Splitwise → OAuth or CSV upload → parsing → preview screen (groups, friends, expense count) → confirm → background import job → completion notification. Edge cases: duplicate detection, unknown currencies.

**12.2 — Steven import**
Steven export file upload → parse → same preview + confirm flow.

**12.3 — CSV generic import**
Upload CSV → column mapping screen (match CSV columns to Quits fields) → preview → confirm.

**12.4 — Import review screen**
Shows what will be imported: X groups, Y expenses, Z friends. Highlights conflicts (e.g. group name already exists: merge or create new). Progress indicator during import.

---

## 13. Self-host setup (admin / ops)

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 13.1 | Self-host first-run setup flow | User flow | P0 |
| 13.2 | Admin dashboard screen | Screen wireframe | P1 |
| 13.3 | OIDC configuration flow | User flow | P0 |
| 13.4 | Backup / restore flow | User flow | P0 |
| 13.5 | Instance URL entry (mobile) | User flow | P0 |

**13.1 — Self-host first-run flow**
`docker compose up` → app starts → browser opens to `/setup` → admin email + password → instance name + URL → optional SMTP config → optional OIDC config → setup complete → redirect to app.

**13.2 — Admin dashboard**
User list, active sessions, storage usage, job queue status, recent errors, backup status. Admin-only route.

**13.3 — OIDC configuration**
Admin enters: issuer URL, client ID, client secret → test button → success/failure → save. Users can then sign in via "Sign in with SSO".

**13.4 — Backup / restore**
`quits backup` CLI creates encrypted zip of Postgres dump + S3 contents. `quits restore` flow. Admin UI trigger for hosted tier.

**13.5 — Instance URL entry (mobile)**
When a self-hosted user opens the app for the first time: "Are you using the hosted service or a self-hosted instance?" → if self-hosted: enter instance URL → validated → stored → auth flow proceeds against that instance.

---

## 14. Error states & empty states

| # | Diagram | Type | Priority |
|---|---------|------|:---:|
| 14.1 | Network error / offline state | State diagram | P0 |
| 14.2 | Empty states reference | Component spec | P0 |
| 14.3 | 404 / not found screens | Screen wireframe | P0 |
| 14.4 | Permission denied states | State diagram | P0 |

**14.1 — Network error / offline**
Banner shown when offline. Optimistic UI continues to work. Sync queue state. What happens when reconnected.

**14.2 — Empty states**
Every list screen has an empty state: no groups, no expenses in group, no activity, no notifications, no search results, no friends.

**14.3 — 404 / not found**
Tapping a deep link to a deleted expense, a group the user was removed from, an expired invite.

**14.4 — Permission denied**
Non-admin trying to access admin actions. User trying to edit someone else's expense. Appropriate error messaging.

---

## Summary: diagram count by area

| Area | P0 | P1 | P2/P3 | Total |
|------|:--:|:--:|:-----:|:-----:|
| 1. Navigation structure | 3 | — | — | 3 |
| 2. Authentication | 7 | — | — | 7 |
| 3. Home screen | 4 | — | — | 4 |
| 4. Groups | 7 | 4 | — | 11 |
| 5. Add expense | 9 | 4 | — | 13 |
| 6. Expense detail | 5 | — | — | 5 |
| 7. Balances & settle up | 4 | 4 | — | 8 |
| 8. Activity feed | 3 | — | — | 3 |
| 9. Search | 1 | 2 | — | 3 |
| 10. Notifications | 2 | 2 | — | 4 |
| 11. Profile & account | 4 | 3 | — | 7 |
| 12. Import flows | 2 | 2 | — | 4 |
| 13. Self-host / admin | 4 | 1 | — | 5 |
| 14. Error & empty states | 4 | — | — | 4 |
| **Total** | **59** | **22** | **—** | **81** |
