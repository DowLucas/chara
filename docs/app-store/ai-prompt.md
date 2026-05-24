# Chara — Master AI Prompt for App Store Screenshots

This is the paste-and-run prompt for generating App Store / Play Store marketing screens with an AI image model (Midjourney v6, Flux, DALL·E 3, Figma AI).

**Important:** AI is for the **backdrop and composition only**. Real screen captures from the running Expo app go *inside* the device frame in Figma. Letting AI render UI inside the bezel produces hallucinated buttons and broken typography. Don't do it.

---

## How to use this file

1. Take real captures of each Chara screen from the running app (Expo Web, iOS simulator, or a real device). Save as transparent PNG.
2. Copy the **System Prompt** block below into your image model.
3. For each slide, copy the matching **Slide Prompt** block, fill in the `[brackets]`, and run.
4. Composite the real screen capture into the rendered device bezel in Figma. Add headline + subhead text in Figma using Inter (or SNPro) and JetBrains Mono.
5. Export per `technical-spec.md`.

---

## System Prompt (paste into every generation)

> **Aesthetic:** Warm Nordic editorial. Background is cream linen paper, exact hex `#F0E5CC`, with subtle paper grain — not white, not bright. Primary text color is espresso `#2D1F1A`. Card surfaces are bone `#E6D9BB`, 10px corner radius, no border, only a 1px soft hairline `rgba(45,31,26,0.14)` for division. Signal color used sparingly and only where it carries meaning: rust `#B83D3D` for debts, sage `#8FA055` for credits, amber `#E0A040` for primary CTAs and the eyebrow tag. Text-on-accent is `#F4F1E6`.
>
> **Typography:** Humanist sans-serif (Inter SemiBold or SNPro SemiBold) for headlines and titles. Inter Regular for body. JetBrains Mono with `tabular-nums` for every numeral, date, code, and eyebrow label — amounts are large and visually dominant. Never serif. Never script. Never display fonts.
>
> **Forbidden:** gradients of any kind, glow effects, neon, glassmorphism, iOS-style background blur, drop shadows beyond 1–2px elevation, stock photos of people, hands holding phones, lifestyle backgrounds, emoji decoration, "abstract waves," geometric pattern overlays.
>
> **Mood:** Calm, expensive, quiet. Editorial product photography from a Stockholm studio. Mullvad VPN's restraint meets a leather-bound ledger. Bitwarden's professionalism meets Immich's transparency.
>
> **Composition rules:** The product is the hero. The background is paper. There is no third element unless explicitly requested. White space is generous. Cramped is wrong.

---

## Backdrop Prompt (for Midjourney / Flux — generates the paper canvas)

> "Editorial product photography backdrop: a perfectly flat sheet of warm cream paper, exact tone Pantone Wheat / hex `#F0E5CC`, soft natural top-light from upper-left, subtle paper grain visible at close inspection, no other objects, no text, no patterns, no shadows from off-frame objects, centered composition, shot on Hasselblad medium format, 50mm equivalent, f/4. Mood: calm, Scandinavian, expensive but quiet. Aspect ratio 9:19.5 for iPhone App Store screenshot."

Use the rendered result as the bottom layer in Figma. Lay device frames and text on top.

---

## Device Frame Prompt (if you don't have a Figma template handy)

> "A single iPhone 15 Pro standing upright, centered, midnight black bezel, viewed straight-on with a very slight 2-degree tilt to the right, set on warm cream linen paper `#F0E5CC`. Soft 30% diagonal shadow falling to the lower-right. Status bar shows `12:30`, full battery, full signal, no notifications. Screen is **pure black** — leave it empty for compositing. No text in the image. No reflections. No motion blur. Editorial product photography style, soft natural top-light from upper-left, shot on Hasselblad medium format. Aspect ratio 9:19.5."

Better option: use `Rotato.app`, `Previewed.app`, or Figma's free `AppMockup` community template. AI-rendered device frames drift on subtle proportions; real templates do not.

---

## Per-Slide Prompts

Each slide uses this structure. Copy the block, fill `[bracketed]` fields from `screen-sequence.md`.

### Generic per-slide template

> **Prompt:**
>
> "Editorial App Store marketing screen for Chara, a bill-splitting app. Vertical 9:19.5 aspect.
>
> **Background:** Cream linen paper `#F0E5CC` with subtle grain, full bleed.
>
> **Composition:** Centered iPhone 15 Pro with midnight bezel, slight 2-degree tilt, soft diagonal shadow lower-right. Screen content is `[describe in one sentence what the real capture will show]`.
>
> **Above the device frame:** Small mono uppercase eyebrow tag in amber `#E0A040`, letter-spacing 1.0, reading `[EYEBROW]`. Below it, headline in espresso `#2D1F1A` Inter SemiBold, 56pt, max two lines, reading `[HEADLINE]`. Below headline, subhead in espresso at 75% opacity, Inter Regular 22pt, single line, reading `[SUBHEAD]`.
>
> **Below the device frame:** Nothing. The product breathes.
>
> **Forbidden:** gradients, glow, drop shadows beyond device elevation, stock people, lifestyle elements, abstract shapes, emoji, additional text, "fluff" decoration.
>
> **Mood:** Mullvad VPN meets a leather-bound ledger. Stockholm studio, not Salesforce keynote."

### Slide 1 — Hero (ch.01 The Promise)

> - EYEBROW: `CH.01 · THE PROMISE`
> - HEADLINE: `Splitwise capped you. Steven dropped you. Chara won't.`
> - SUBHEAD: `Take a photo of the receipt. Chara figures out the rest.`
> - Screen content: home tab with giant mono `SEK 240,00` "You're owed" balance, three group cards below.

### Slide 2 — Snap (ch.02)

> - EYEBROW: `CH.02 · SNAP`
> - HEADLINE: `The receipt reads itself.`
> - SUBHEAD: `Snap the photo. Chara pulls merchant, date, total — and every line item.`
> - Screen content: add-expense form pre-filled from a scan, camera viewfinder overlay near top with corner ticks.

### Slide 3 — Fair (ch.03)

> - EYEBROW: `CH.03 · FAIR`
> - HEADLINE: `You pay for what you ate.`
> - SUBHEAD: `Tap each line to assign it to whoever ordered it. The split builds itself.`
> - Screen content: ScanItemsAssign screen — receipt lines down the left, member-avatar chips beside each, moss highlights on selected lines.

### Slide 4 — Home (ch.04)

> - EYEBROW: `CH.04 · HOME`
> - HEADLINE: `In your own currency, at today's rate.`
> - SUBHEAD: `Per-currency truthful. FX for display, never for silent conversion.`
> - Screen content: balances panel with two currency lines (`SEK`, `EUR`), an amber FX rate row reading "EUR 1 = SEK 11,30 · today".

### Slide 5 — Done (ch.05)

> - EYEBROW: `CH.05 · DONE`
> - HEADLINE: `Settled in a tap.`
> - SUBHEAD: `Swish in Sweden. Vipps and MobilePay next. Or any payment link you already use.`
> - Screen content: Settlement Impact Sheet, citrine "Settle with Swish" button, `SEK 420,00` to a named recipient, message `Chara · Tokyo trip`.

### Slide 6 — One tab, zero chain (ch.06)

> - EYEBROW: `CH.06 · ONE TAB, ZERO CHAIN`
> - HEADLINE: `Pay the fewest people possible.`
> - SUBHEAD: `Chara computes the minimum-cardinality settlement. No "I'll Venmo you, you Swish them."`
> - Screen content: standings tab with three suggestion rows at top, per-member balances below in rust/sage.

### Slide 7 — It repeats (ch.07)

> - EYEBROW: `CH.07 · IT REPEATS`
> - HEADLINE: `Rent, Netflix, the cleaner.`
> - SUBHEAD: `Set the recurring once. Chara drops the expense in and pings the right people to settle.`
> - Screen content: recurring expenses list — three rows (rent, Netflix, cleaner) with cadence text on the right.

### Slide 8 — Multi-server (ch.08)

> - EYEBROW: `CH.08 · MULTI-SERVER`
> - HEADLINE: `Your homelab. Their server. One app.`
> - SUBHEAD: `Hold every Chara account at once. Groups, balances, and activity aggregated into one inbox.`
> - Screen content: settings accounts list, three rows with different server hostnames, status dots.

### Slide 9 — Self-host (ch.09)

> - EYEBROW: `CH.09 · SELF-HOST`
> - HEADLINE: `One file. One command.`
> - SUBHEAD: `Docker Compose, ARM64 and AMD64, OIDC out of the box. Same app, same code.`
> - Screen content: "Add a server" flow with a URL field, faint terminal mock behind showing `docker compose up -d`.

### Slide 10 — Keep your peace (ch.10 the outro)

> - EYEBROW: `CH.10 · THE OUTRO`
> - HEADLINE: `Split bills. Keep your peace.`
> - SUBHEAD: `Open source. EU-hosted, or your own server. No ads, ever.`
> - Screen content: activity feed showing settled timeline — moss "settled" stamps on each row, mono dates, soft hairline dividers, a `CHARA` mono stamp top-right.

---

## Negative prompt (paste alongside if your model supports it)

> "no gradient, no glow, no neon, no glassmorphism, no blur, no drop shadow except device elevation, no stock photo, no people, no hands, no lifestyle, no flowers, no abstract waves, no geometric pattern overlay, no emoji, no script font, no serif, no display font, no rainbow, no bright saturated color, no white background, no logo, no Apple logo, no Google logo, no watermark."

---

## Iteration tips

- **First pass is always wrong.** AI will sneak in a gradient or warm the cream toward orange. Re-prompt with the literal hex and the word "exact."
- **If color drifts:** add "color managed to sRGB, exact hex `#F0E5CC`, no warming, no cooling."
- **If composition feels Salesforce:** add "editorial, not marketing. Magazine spread, not landing page."
- **If background looks plastic:** add "matte paper texture, no gloss, no sheen."
- **Never let AI write headline text.** Type headlines yourself in Figma — AI mangles typography, kerning, and apostrophes every time.

---

## One-shot full-batch prompt (if your tool supports batching)

> "Generate 10 vertical 9:19.5 App Store marketing screens for an open-source bill-splitting app called Chara. All ten share the same visual system: cream linen paper background exact hex `#F0E5CC` with subtle grain, centered iPhone 15 Pro with midnight bezel and slight 2-degree tilt, soft diagonal shadow to lower-right, screen content area left as pure black for compositing later. Above each device frame: a mono uppercase amber eyebrow tag at `#E0A040`, an espresso `#2D1F1A` Inter SemiBold headline at 56pt, and an espresso 75%-opacity Inter Regular subhead at 22pt. Each slide carries different eyebrow/headline/subhead text from the supplied list. No gradients, no glow, no people, no lifestyle backgrounds, no decorative shapes. Mood: Mullvad VPN meets a leather-bound ledger. Editorial Stockholm product photography. Output 10 PNGs at 1290×2796."

Then supply the per-slide text triples in order.
