# Council Transcript — Invite Deep Links Spec Review

**Date:** 2026-05-24 12:39
**Spec under review:** `docs/superpowers/specs/2026-05-24-invite-deep-links-design.md`

## Framed Question

Evaluate the design spec for incoming invite deep links in Chara
(open-source self-hostable Splitwise alternative; Expo + Go;
multi-server architecture where users hold N independent accounts).

The spec phases the work:
- **Phase 1:** HTTPS landing page at `/i/<token>` + public preview
  endpoint + parser extension + backend-returned canonical URL. Uses
  `chara://` custom-scheme fallback button on the landing page for app
  handoff. Ships now.
- **Phase 2:** iOS Universal Links + Android App Links via
  `charaapp.lurkhuset.com` (Cloudflare Tunnel). Deferred until Apple
  Developer + Google Play accounts exist. Zero app-logic code changes.

Key locked decisions:
- Recipient might not have Chara → invite link is also install funnel.
- Hosted-only Universal Links; self-hosted gets same landing page +
  `chara://` (no per-host config, no gateway).
- Post-install flow: pure "tap link again," no clipboard reads.
- Preview endpoint always returns 200 with state discriminator.
- Single HTTPS URL form across share/QR/parser.
- English-only landing page.
- No inviter attribution (deferred — needs schema migration).
- Multi-account chooser out of scope (structurally unreachable today).

Pressure-test it.

## Anonymization Mapping (revealed)

- **Response A** = The First Principles Thinker
- **Response B** = The Outsider
- **Response C** = The Executor
- **Response D** = The Contrarian
- **Response E** = The Expansionist

## Advisor Responses

### A — First Principles Thinker

You are solving an invite-friction problem for a product that has zero
users, zero App Store presence, and no Play Console account. That
ordering is upside-down.

The real goal isn't "make HTTPS invites work." It's "convert a friend's
recommendation into an active second user on the same server so a group
has >1 person in it." That goal is gated on three things in this order:
(1) an installable app exists in a store, (2) a recipient trusts the
link enough to install, (3) post-install the join completes. You're
optimizing #3 while #1 doesn't exist yet. Decision #3 even admits this
— Phase 2 is gated on the Apple/Google accounts that make installation
*possible at all*. So Phase 1 ships a landing page whose primary CTAs
(App Store / Play Store badges, per state `ok`) are dead links. You're
building the funnel before the funnel has an exit.

Phase 1 and Phase 2 are not phases of one project. Phase 1 is "fix the
URL-stripping bug and unblock dogfood testing among people who already
sideload Chara." Phase 2 is "launch in stores with Universal Links."
Calling them phases creates a false sense that Phase 1 moves you toward
launch. It doesn't — it moves you toward better internal testing.
That's fine, but name it that. The "~95% of the UX" claim in decision
#3 is wrong; it's 95% of the *rendering*, 0% of the *acquisition*.

Re-frame: at MVP/pre-launch, the invite primitive that matters is the
QR code at decision #12 — phone-to-phone, both users present, zero
messaging-app round trip, zero install funnel. That already works
end-to-end via `classifyInvite`. Ship a one-paragraph "paste invite
link" field in `add-server` (explicitly cut as a non-goal — reconsider;
it's 20 lines and removes the entire landing-page dependency for
dogfood). Defer the whole landing page until the week you submit to
TestFlight. The HTML template, preview endpoint, four-state branching,
AASA defensive excludes — all of it is correctly designed work done at
the wrong time.

### B — Outsider

I tap the link. A web page loads. It says:

**"You're invited to 'Roommates'"**
**"4 members · hosted at charaapp.lurkhuset.com"**

I have no idea what I just got invited to. Roommates *what*? A chat?
A calendar? A game? A Google Doc? The page never says the word "app"
or what the app does. "Chara" is on the install badge graphic, sure,
but the badge is just an Apple/Google logo to me — I read it as "App
Store," not "Chara." Nothing on the page says "Chara is a way to split
bills with friends." Nothing says "your friend wants to share expenses
with you." I'm being asked to install an unknown app on the strength
of one word, "Roommates," typed by someone else.

"hosted at charaapp.lurkhuset.com" is the kill shot. Normal people
don't know what "hosted" means in this context. "lurkhuset" looks like
a typo or a phishing domain. I'd close the tab. If I'm being generous
and don't close it, I'd at minimum text my friend back: "is this safe?
what is this?"

"This group has stopped accepting members" — what group? I still don't
know what a Chara group *is*.

"Open in Chara →" — I don't have Chara. Why is this button here? Am I
supposed to have it? Did I miss a step?

The four-state copy is written for someone who already knows the
product. There is no one-line "Chara is a bill-splitting app for
friends and roommates" anywhere on the page. Add it above the fold,
drop "hosted at" for normals (show it as a small "Server: …" line for
the paranoid), and put the product name + tagline on the install CTA
itself.

### C — Executor

**Step 1 is the trap.** "HTML template asset (or wherever the existing
convention puts static assets — to confirm at implementation time)" is
the spec hand-waving a real decision. Go's `embed` directive vs
filesystem path, `html/template` (yes — auto-escapes `groupName`),
template registration at server boot vs per-request parse, where the
`templates/` directory lives relative to the binary in the Docker
build (`COPY` semantics in `backend/Dockerfile` will bite you), and
how badges/static assets ship — that's 2–3 hours, not the half-hour
the numbering implies. **Use `embed.FS` from day one** or you'll
re-do it when Docker breaks.

**Step ordering is wrong.** Do Step 4 (URL shape in `GetInviteLink`
response) first — it's a 5-minute change, unblocks the frontend
(Steps 6–8) to run in parallel with the heavier landing-page work
(1–3). Right now Steps 6–8 are blocked behind a template you haven't
written.

**TDD bite on Step 3:** don't snapshot HTML. The spec already says
this — good. Assert on substrings (`"You're invited to"`, `groupName`,
`"Open in Chara"`) per state. Four table-driven tests, done.

**Cut from Phase 1:** the `locked` vs `archived/invalid` copy split.
Ship one "this invite doesn't work" page + `ok`. Saves a template
branch and two manual verification passes (Step 11). Add the polish
later.

**`chara://` from Safari is reliable; from Gmail/Slack in-app browsers
it's not.** Spec acknowledges this in risks but the verification
matrix (Step 9) only tests iMessage→Safari. Add one in-app-browser
case (paste link into Slack DM, tap from Slack iOS) or you'll discover
the failure mode post-launch.

**First commit:** Step 4 only — change `GetInviteLink` to return
`https://<host>/i/<token>`, update the existing handler test, add the
route stub `GET /i/{token}` returning `501`. Ten-line diff, lands
today, unblocks the parser work.

### D — Contrarian

**Phase 2 is a lie you're telling yourself.** Decision #3 says Phase 1
covers "~95% of the UX." It doesn't. Without Universal Links, every
recipient who already has Chara installed gets shoved through Safari,
sees a landing page they don't need, has to tap "Open in Chara," then
dismiss an OS scheme prompt. That's not 95% — that's the *worst* path
for your most valuable users (existing ones inviting friends to a
*second* group). And it's the default for everyone until Phase 2 ships.
Bet you a beer Phase 2 slips six months.

**The `chara://` button in in-app browsers is broken, not
"acceptable."** Risk section waves this away. WhatsApp, Instagram,
Slack, Messenger — these open links in their in-app webview, which
silently swallows custom schemes on iOS. The user taps "Open in Chara,"
nothing happens, no error, they bounce. This is *the* dominant share
channel for Splitwise's audience (group chats). Mitigation: detect
in-app browser and show "Open in Safari" copy. Not in the spec.

**Decision #6 is a privacy footgun you're rationalizing.** "Token
already grants join, so leaking group name + member count is fine."
No: today a leaked token risks one bad actor joining. Tomorrow, a
token *crawled or accidentally shared* leaks "Roommates · 4 members ·
charaapp.lurkhuset.com" publicly indexable. Bots scrape
Slack/Discord/Pastebin for `/i/<token>` URLs. Add `X-Robots-Tag:
noindex, nofollow` and rate-limit the preview — neither is specified.

**Decision #11 — backend returns canonical URL — adds a network
round-trip on every share open.** Offline-share breaks. The QR/invite
screen already needs `getInviteLink` for the token; fine, but ensure
it's cached and works on a flaky network. Not addressed.

**Self-hosted Phase 1 → Phase 2 has no story.** Decision #2 explicitly
says self-hosted gets no Universal Links *ever*. So self-hosters live
in `chara://` button hell permanently. Tests in step 10 verify the
button works — but you just admitted (risk #2) it doesn't work in
in-app browsers. Self-hosters are the people you can't disappoint;
that's the whole thesis.

**`add-server?pendingInvite=…` race (risk #1)** — you're shipping with
"verify in step 9; if it flashes badly, fix it." That's not a
mitigation, that's a TODO. Cold-launch on Android is meaningfully
slower than iOS; the flash *will* happen. Write the guard now.

### E — Expansionist

The invite link isn't a utility — it's the entire top of your
acquisition funnel and the only protocol-level handshake Chara has
with the outside world. You are about to mint the canonical Chara
surface that lives in iMessage threads, WhatsApp groups, Slack DMs,
and SMS forever. Treating `/i/<token>` as a tappable text fallback is
wildly undervalued.

**What this actually unlocks if you push:**

1. **Open Graph + Twitter cards are not optional — they are the
   product.** When Lucas pastes the link into iMessage and it unfurls
   into a rich card with the group name, member count, and a Chara
   wordmark, the recipient has already received the pitch before
   tapping. Cost: 6 meta tags + one OG image endpoint
   (`/i/<token>/og.png` rendered server-side with the group name
   overlaid). This is the difference between "weird link" and "real
   app." Ship it Phase 1.

2. **The landing page is Chara's homepage for 90% of humans who will
   ever encounter it.** There is no other marketing site at launch.
   The "utility page" framing is wrong — this *is* the marketing
   site, personalized. Add a 1-line "Chara is open-source bill
   splitting you can self-host" under the CTA. Free conversion lift,
   no scope creep.

3. **Inviter attribution is the single highest-ROI cut you're
   making.** "Lucas invited you to Roommates" converts dramatically
   better than "You're invited to Roommates." Splitwise, Venmo,
   Splitwise-clones all do this for a reason. The "schema migration"
   excuse is small — `created_by_user_id` on the token row is one
   column and one backfill (and there are zero rows to backfill, it's
   pre-launch). Promote this to Phase 1.

4. **`/i/<token>` is a protocol surface.** Every self-hosted Chara
   instance now speaks the same invite URL grammar. That is a
   *standard*. Document it (`docs/invite-protocol.md`), and
   third-party tools (bots, browser extensions, a future web-join
   flow) can build against it. This is how Matrix, ActivityPub, and
   Mastodon got an ecosystem.

5. **Web-join is one step away.** You have a public preview endpoint
   and a public landing page. Adding "Join in browser" (magic-link
   email + web group view) is the obvious Phase 1.5 — and it
   eliminates the install requirement entirely for casual one-time
   splits (the wedding party, the conference dinner). Don't build it
   now, but *don't architect it away* either.

**Promote to Phase 1:** OG cards, inviter name, one-line product
tagline on the landing. **Add as explicit Phase 1.5 goals:**
documented invite-URL protocol, web-join path. The "non-goal" list is
a list of growth levers you're declining to pull at the exact moment
they're cheapest to build.

## Peer Reviews

### Reviewer 1 (Contrarian lens)

**1. Strongest: A.** A is the only response that questions whether
this work should happen *at all* right now. Everyone else is
rearranging deck chairs on a landing page for an app that can't be
installed. A's "build the funnel before it has an exit" is the only
critique that survives contact with the actual project state (zero
users, no store presence). The "add paste-invite to add-server"
counter-proposal is concrete and cheap.

**2. Biggest blind spot: E.** E wants OG cards, inviter attribution,
a documented protocol, and web-join — for a product with no users.
Every "growth lever" assumes a funnel exists. E also ignores that OG
unfurls *leak the same group metadata* D flagged as a privacy issue,
but now to every link-preview bot on the internet (Slackbot, iMessage's
preview fetcher, etc.). E's "ship OG Phase 1" directly contradicts D's
"noindex everything" — and E never notices.

**3. What all five missed:** The preview endpoint has no auth and no
rate limit on a *token-shaped URL*. An attacker who guesses/scrapes
one token can enumerate group names and member counts across every
self-hosted Chara instance via the same `/i/<token>/preview` grammar
E wants to standardize. Token entropy isn't specified anywhere in the
critiques. That's the actual fatal flaw — and "standardizing the
protocol" (E) makes it worse, not better.

### Reviewer 2 (First Principles lens)

**1. Strongest: A.** It's the only response that asks what problem
we're actually solving. The others critique the spec on its own terms;
A challenges the premise that this work should happen now. The
observation that Phase 1's primary CTAs are dead links — because
there's no app in any store — is devastating and correct. Everything
else is rearranging deck chairs.

**2. Biggest blind spot: E.** Treats the landing page as top-of-funnel
for a product with no funnel. OG cards, web-join, inviter attribution
are all real ideas, but E is optimizing virality for a product that
literally cannot be installed. Same disease as the spec, dressed up as
growth thinking.

**3. What all five missed:** Every response assumes the *invite link
itself* is the right primitive. From first principles, an invite is
"Lucas wants Anna in his group." The medium that actually solves that
— pre-launch, with both people in the same room 90% of the time — is
the QR code (A gestures at it but doesn't finish the thought). The
shared assumption worth killing: that asynchronous tappable URLs are
the canonical invite. For a self-hosted bill-splitter used by
roommates and friend groups, synchronous in-person pairing is the
native interaction. Deep links are infrastructure for a distribution
model Chara doesn't have yet.

### Reviewer 3 (Expansionist lens)

**1. Strongest: A.** Brutal frame-shift. The whole spec optimizes
step 3 of a funnel whose step 1 (app in stores) doesn't exist.
QR-paste as the pre-launch invite primitive is correct and ships
today. Everyone else (including me, E) is polishing a landing page for
traffic that won't arrive for months.

**2. Biggest blind spot: C.** Executor tunnel vision — argues
`embed.FS` vs filesystem and TDD substrings while the artifact may not
need to exist yet. Tactical excellence on a strategically misordered
plan. Also misses D's in-app-browser scheme-swallow, which kills the
verification matrix C is so proud of.

**3. What all five missed (Expansionist lens):** The invite link is
bidirectional acquisition the council treated as one-way. Nobody
proposed the **inviter-side viral loop**: post-create-group, surface
"share this group" as a first-class action with a pre-filled
iMessage/WhatsApp template ("Split our trip on Chara — join: …").
Splitwise's growth was group-creator-driven, not invitee-driven.
Second miss: the `/i/<token>` page is the **only public Chara URL
most humans will ever see** — it should set the brand (typography,
voice, the bone/graphite system), not look like a generic OG card.
Third: invite tokens are a natural **referral-attribution primitive**
for future hosted-tier growth accounting — design the schema for it
now, even if unused.

### Reviewer 4 (Outsider lens)

**1. Strongest: B.** B is the only one that actually opened the link
as a human would. Everyone else is debating architecture; B is the one
person in the room who said "I have no idea what this is." That's the
whole game for an invite link from an unknown sender. The "lurkhuset
looks like phishing" catch is devastating and nobody else saw it.

**2. Biggest blind spot: C.** C is pure engineer-brain — embed.FS,
snapshot tests, commit sizes. Never once asks whether the artifact
being built should exist. Optimizing the construction of a thing A
says shouldn't ship and B says doesn't communicate.

**3. What ALL five missed:** Normal people **don't tap links from
strangers anymore.** iOS/Android, Messages, WhatsApp — random-domain
links with a token are exactly what scam training tells users to
ignore. The friend forwarding it will send a screenshot + "join my
Chara" in plain text, and the recipient will Google "Chara app."
Nobody modeled that path.

Also, jargon everyone used without flinching: "custom-scheme
fallback," "Universal Links," "protocol surface," "OG unfurl." The
recipient is someone's mom splitting a dinner bill. The entire council
is designing for developers forwarding links to developers. The real
Phase 1 question is **"why would a stranger trust this URL?"** — and
not one response asked it.

### Reviewer 5 (Executor lens)

**1. Strongest: C.** It's the only response with a Monday-morning
diff. "Change `GetInviteLink` to HTTPS + 501 stub, ten lines" unblocks
everything else and can ship in an hour. A, B, D, E all have opinions;
C has a commit.

**2. Biggest blind spot: E.** Optimizing the acquisition funnel for a
product with zero users and no app binary. OG cards for a link nobody
can complete is theater. E is writing growth-team copy before there's
a growth surface.

**3. What ALL five missed:** None of them named the actual gating
dependency — **Apple App Site Association and Android assetlinks.json
require a published app with a known bundle ID and SHA-256 signing
cert.** Universal Links / App Links physically cannot work until
TestFlight + Play internal track exist. Every response argues about
HTML, copy, and phases while the deep-link mechanism itself is blocked
on App Store Connect and Play Console setup that takes 1-3 days of
paperwork.

**Monday morning, concrete:** Enroll in Apple Developer Program ($99)
and create Play Console account ($25) today. Reserve bundle IDs
`com.chara.app`. Without those two receipts in hand, the entire spec
is fiction. Then do C's ten-line diff while the accounts provision.

## Chairman's Verdict

### Where the Council Agrees

- **The spec is well-designed but wrongly timed.** Four of five
  reviewers picked A (First Principles) or its equivalents as the
  strongest critique: Phase 1 is building infrastructure for a funnel
  whose entrance (an app in a store) does not yet exist. The
  "Phase 1 / Phase 2" framing implies they're sequential
  contributions to one project; in fact Phase 1 only matters to
  internal dogfood until Phase 2 lands.
- **The landing page does not explain what Chara is.** Both B
  (Outsider) and the Outsider-lens reviewer flagged that a stranger
  opening `https://charaapp.lurkhuset.com/i/<token>` has no idea what
  the app does or whether the domain is safe. The four-state copy is
  written for people who already know the product. This is a real
  flaw regardless of the timing question.
- **`embed.FS` from day one** for the template (C's tactical point
  survived peer review because it's correct and cheap).
- **The verification matrix is too narrow.** Only iMessage→Safari is
  tested. Slack / Gmail / Instagram in-app browsers silently swallow
  `chara://` schemes; that's a known iOS behavior and the spec
  hand-waves it.

### Where the Council Clashes

- **D vs E — privacy vs. virality.** D says the preview endpoint is a
  privacy footgun: token-shaped URLs get crawled, preview leaks group
  name + member count + server domain publicly. Add `X-Robots-Tag:
  noindex, nofollow` and rate-limit. E says ship Open Graph cards
  aggressively so iMessage / Slack unfurls a rich preview before the
  recipient even taps. **These are directly contradictory.** OG cards
  require the preview to be public and crawlable by every link-preview
  bot (Slackbot, iMessage's preview fetcher, Twitter's, etc.). You
  cannot have rich unfurls AND noindex. Reasonable advisors disagree
  because they're optimizing different things: D for "tokens leak as
  worst case"; E for "the unfurl IS the conversion event."
- **A vs C — should this ship at all.** A says delete the landing page
  from Phase 1; ship a 20-line "paste invite link" field instead. C
  says here's the ten-line first commit that unblocks the work. Both
  can be right: A's claim is about whether the landing page is the
  right *deliverable*; C's claim is about how to *sequence* it if you
  do build it. The clash is meaningful only if the question is "build
  the landing page or not," not "in what order."
- **A vs E — pre-launch growth posture.** A: don't optimize a funnel
  with no exit. E: the moment a funnel is *cheap* is when you should
  build it. Both peer reviewers from the C/Outsider/First Principles
  lenses called E "growth copy for a product that doesn't exist yet";
  the Expansionist reviewer agreed.

### Blind Spots the Council Caught (only in peer review)

- **The preview endpoint is an enumeration surface.** None of the
  five advisors specified token entropy, no advisor proposed rate
  limiting the preview endpoint, no advisor proposed auth-token
  hashing. The Contrarian reviewer named this as the actual fatal
  flaw: a token-shaped public endpoint is a magnet for scraping. The
  spec inherits this from the existing token design; it's a
  pre-existing weakness made worse by exposing more metadata.
- **Apple Dev + Play Console are the gating dependency, not a side
  consideration.** Both the Executor reviewer and the spec itself
  note this, but no advisor named it as the *single highest-priority
  action item*. Without the two accounts, the entire spec is theory.
- **"Strangers don't tap links from strangers."** The Outsider
  reviewer named the path actual users will take: a screenshot of the
  link + "join my Chara" in iMessage, then Googling "Chara app." The
  entire spec assumes link-tap as the primary interaction model,
  which contradicts what scam-trained users actually do.
- **Inviter-side viral loop missing.** The Expansionist reviewer
  pointed out that Splitwise grew via group creators sharing
  proactively, not via invitee-side optimization. Nothing in the spec
  addresses "after a group is created, prompt the creator to share."
- **In-person QR is the native interaction.** The First Principles
  reviewer named what was implicit in the original A response: for
  roommates / friend groups (Chara's stated audience), the in-person
  QR scan is the right primitive. Asynchronous tappable URLs are
  infrastructure for a distribution model Chara doesn't yet have.

### The Recommendation

**Don't ship Phase 1 as currently specified. Don't scrap the spec
either. Re-sequence around the actual gating dependency.**

1. **Enroll in Apple Developer Program and Google Play Console today.
   Reserve bundle ID `app.chara` under both.** This is the gating
   dependency. Until these two accounts exist with the bundle ID
   reserved, neither Phase 2 (Universal Links) nor real Phase 1
   testing (the App Store badges that link nowhere) can work. 1–3 day
   paperwork; runs in the background.

2. **Land C's ten-line first commit while paperwork provisions.**
   Change `GetInviteLink` to return `https://<host>/i/<token>`. Add
   a `GET /i/{token}` route stub returning 501. Update the existing
   handler test. This preserves all spec optionality without
   committing to building the landing page today.

3. **Ship the cut "paste invite link" field in `add-server`.**
   Re-evaluate the non-goal — this is the actual pre-launch unblock
   that lets the small group of dogfooders + early TestFlight users
   join groups across servers via any channel (screenshot pasted from
   iMessage, AirDropped text, QR scanned from a printout). 20 lines.
   Pairs with the existing QR scanner. Removes the "the landing page
   has to ship now" dependency.

4. **Defer the rest of Phase 1 (HTML template, preview endpoint,
   four-state copy) until the week of TestFlight submission.** When
   you do build it:
   - Adopt B's copy fixes: product tagline above the fold, drop
     "hosted at" for normals, name "Chara" prominently with what it
     does.
   - Adopt D's privacy hardening: `X-Robots-Tag: noindex, nofollow`
     on the preview endpoint, rate-limit by IP + token, audit token
     entropy.
   - Adopt E's inviter attribution (one column, zero rows to
     backfill pre-launch) — but skip OG cards until the preview
     privacy story is designed; the D/E clash is real and
     unresolved.
   - Adopt C's `embed.FS` + table-driven substring tests.
   - Expand the verification matrix beyond iMessage→Safari.

5. **Pre-build Phase 2 native config in `app.config.ts`** so the
   moment the accounts are live, the rebuild is just inserting the
   Apple Team ID into the AASA file. Don't wait for the gating to
   clear to draft the config.

The chairman sides with A on framing — this work is mistimed — but
rejects A's full "defer until TestFlight week" because C's ten-line
first commit and the paste-link field are cheap, additive, and
correct now. The spec's design choices are mostly right; the work
ordering is wrong.

### The One Thing to Do First

**Open the Apple Developer Program enrollment page today and start
the membership purchase.** Without an Apple Team ID, the entire Phase
2 plan is fiction and Phase 1's App Store badges are dead links.
Everything else — the ten-line commit, the paste-link field, the spec
revision — can run in parallel while the account provisions.
