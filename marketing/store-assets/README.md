# Store screenshot assets

Current set: `pages-v2/` (built by `build.py`): 10 App Store pages and 8 Google
Play pages, ready to upload. Earlier experiments are gitignored and stay local.

**Before building:** download Apple's iPhone 17 Pro Max product bezel (silver,
portrait) from https://developer.apple.com/design/resources/ and save it as
`bezels/iphone-17-pro-max-silver.png`. It isn't in the repo because Apple's
Design Resources licence doesn't allow redistributing it on its own.

## Pipeline

    ./seed-screens.sh            # local backend: screenshot account + groups (see Captures)
    python3 prepare-captures.py  # captures/raw/*.png -> captures/*-ui.png (+ scan composite)
    python3 build.py             # manifest.json -> pages-v2/apple (10 x 1320x2868) + pages-v2/play (8 x 1440x2560)
    python3 qa.py                # sizes, RGB, file size, counts, caption + alt-text lint, Play tagline area

`manifest.json` is the single source, in store order: per page an id, `bg`
colour (`bone`, `brick`, `ink`, `moss`), headline with `*accent*` lines, `alt`
text (≤ 140 chars; paste it into Play Console's per-screenshot alt text), one
`capture`, and `"play": false` for the
App Store–only pages (Apple takes 10, Play at most 8). Edit it and rebuild;
never edit pages by hand. `pages-v2/meta.json` lists each page's files and alt
text per store.

Layout: every page is a short benefit headline at the top (no eyebrow line) and
one large, centred phone (Apple) or UI card (Play) under it. Phones never
straddle a page edge, so each page reads whole in the store's carousel and in
search results. Headlines shrink to fit when a line would outrun the margins.

Order follows hook → features: home with every balance state first (never an
empty dashboard), then add, scan and split, the three things people do most.
Play drops `settle` and `record`, which overlap `standings`.

## Captures

Real screens from the current app on the Android emulator (Medium Phone,
1080x2400) against a local backend:

1. Add `screens@example.com` to `DEMO_LOGIN_EMAILS` in `backend/.env.local`,
   `./run-backend`, then `./seed-screens.sh`.
2. Start Metro, sign the app in as `screens@example.com`, and screenshot with
   `adb exec-out screencap -p > captures/raw/<name>.png`: `add` (64.35 /
   Concert tickets), `split`, `standings`, `repayments`, `activity`, `scan`,
   `expenses`, `recurring` (Apartment 5B → settings → Recurring bills).
3. `./seed-screens.sh settle`, then `home` (Book Club owes, Barcelona owed,
   Apartment settled), `home-settled` and `settled` (the group).
4. `summary` (Profile → Monthly summary) is hosted-only: run the backend once
   with `INSTANCE_MODE=hosted DEV_MODE=false` and throwaway RS256
   `JWT_PRIVATE_KEY_PEM` / `JWT_PUBLIC_KEY_PEM`, capture, then restore.
5. `python3 prepare-captures.py`.

The emulator's camera shows a virtual 3D room, so `prepare-captures.py`
replaces the scan feed with `backgrounds/scan-table.png` (Nano Banana Pro, no
text) plus a receipt rendered in JetBrains Mono whose total matches the add
page, and keeps the app's own buttons on top. Avoid amounts that end in 0
after the split: the app currently drops the trailing zero ("21.4 USD").

- Background: each page is its flat brand colour with paper grain, and
  `ribbon.py` draws ONE receipt tape through the whole set in strip
  coordinates, so the tape leaving a page's right edge is exactly the tape
  entering the next page's left edge — the set joins up in the store
  carousel. It rides between the headline and the phone, tucks behind each
  phone's top edge, and dives down the gutters at every other seam. Each store
  gets its own pass over its own page order, so Play's 8 pages join up too.
- App UI always comes from `captures/*-ui.png` (real emulator captures, status
  bar and gesture pill removed, app header kept). `build.py` draws a neutral
  status bar (9:41, full signal / wifi / battery) above the capture.
- Review sheets: `pages-v2/sheet-apple.jpg`, `pages-v2/sheet-play.jpg`.

## Store rules the set is built around

**Apple (`pages-v2/apple`)** — framed with Apple's official iPhone 17 Pro Max
bezel (`bezels/`, from developer.apple.com/design/resources; licence alongside).
The Design Resources licence allows the bezel in screenshots of iOS mock-ups
only, unmodified. So: bezel never tilted, recoloured or drawn on; copy sits beside
the phone, not on it; only iOS-targeted UI goes inside; do not reuse the bezel for
Play or with Android UI. Captions must not name other platforms (2.3.10), other
apps, prices, or unverifiable claims (2.3.7). 6.9" size 1320x2868 is the only
required iPhone size; Apple scales the rest down. iPad set not needed (tablet
support is nominal).

**Google Play (`pages-v2/play`)** — frameless rounded UI cards at 9:16
1440x2560 (above the 1080x1920 featuring minimum; the capture sits on it at its
native 1080px). Google's featuring guidance lists device imagery under things
to avoid, so no bezels. Cards are kept straight on both stores. Taglines stay
under 20% of the image (`qa.py` measures the text bbox); 4–8 screenshots, 8 is
Play's maximum per device type. No calls to action, testimonials or prices. The Metadata policy bans any ranking / award / store-program /
price wording in graphics ("#1", "Best", "Top", "New", "Free", "Editor's
choice", award icons, "million downloads"). `qa.py` lints captions for these on
both stores; it also rejects "Android" on Apple pages and "iPhone"/"iOS" on Play.

Never add ratings, rankings, awards, testimonials or download counts to a
page — Editors' Choice on both stores is applied by the store.

## Contents

- `manifest.json`, `seed-screens.sh`, `prepare-captures.py`, `ribbon.py`,
  `build.py`, `qa.py` — current pipeline
- `pages-v2/` — finished Apple + Play sets, `meta.json`, review sheets
- `bezels/` — Apple bezel PNG + licence, local only (see top)
- `backgrounds/scan-table.png` — the scan screen's table photo
- `captures/raw/` — emulator screenshots (1080x2400); `captures/*-ui.png` — the
  prepared 1080x2228 crops. Demo data: local screens@example.com account
  (Apartment 5B USD / Barcelona Trip EUR / Book Club USD).

## Still open

- Play feature graphic (1024x500)
- Localized captions (Google recommends localizing screenshot text)
