# Quits — Design System

> Split it. Settle it. Call it quits.

Quits is a bill-splitting app built around the phrase **"call it quits"**: the moment of decisive completion. The visual heritage is architectural drafting, modernist ledger design, and the confident restraint of brands like Mercury, Linear, and Aesop.

The deliberate position: **the opposite of fintech.** Cool, structural, type-first. Not warm, not editorial. Decisive and architectural. Every other app in this category looks like a finance product. Quits looks like a well-designed object.

## Sources

This system was authored from a brand brief only — no codebase, no Figma file, no slide deck were attached. If you'd like the system to be tightened against real product code or designs, attach them via the Import menu and I'll iterate.

---

## Index

| File | Purpose |
|---|---|
| `README.md` | This file — context, content & visual fundamentals |
| `SKILL.md` | Loader for using this system as an Agent Skill |
| `colors_and_type.css` | Token layer (CSS vars) + semantic styles |
| `preview/` | Cards rendered in the Design System tab |
| `ui_kits/app/` | Mobile app UI kit (screens + components) |
| `ui_kits/marketing/` | Marketing site UI kit |
| `assets/` | Logos, wordmark, icon references |

---

## Content fundamentals

**Voice.** Confident, slightly wry, colloquial English. Direct without being curt. Adult. The brand never tries too hard.

**Person.** Default to imperatives and the implicit "you" — "Add a friend," "Settle up." Avoid second-person pep ("You got this!"). Use first person plural sparingly, only when the app is acting on the user's behalf ("We rounded to the nearest krona").

**Casing.** Sentence case everywhere. **Never Title Case.** **Never ALL CAPS** — with exactly one exception: the word `QUITS` inside the stamp signature. This is the rule that does the heaviest brand lifting; do not break it.

**Punctuation.** Periods are allowed. Exclamation points are not. Em dashes for asides. Avoid the Oxford comma only when it harms clarity.

**Numbers.** Always monospace, tabular, with currency suffix or prefix appropriate to the locale (`240 kr`, not `$240`). Use real digits, never spell out amounts.

**Sample copy.**

- Tagline: *"Split it. Settle it. Call it quits."*
- Empty state: *"Nothing to settle yet."*
- Completion: *"Quits. Nice."*
- Primary CTA: *"Send via Swish"* / *"Settle"* / *"Add expense"*
- Error: *"That didn't go through. Try again."*
- Confirmation: *"Marked as paid."*

**Forbidden.**
- Fintech jargon: *seamless, powerful, intuitive, effortless, frictionless, supercharge, unlock, revolutionize.*
- Emoji of any kind, anywhere.
- Exclamation points.
- Marketing speak. If a sentence could appear on any SaaS landing page, rewrite it.
- Second-person pep ("You got this", "Way to go!").
- Filler words: *just, simply, easily.*

---

## Visual foundations

### Colors

The palette is small on purpose. **One accent per screen.** Green is *strictly* reserved for the positive-balance semantic — never used as a brand color, never decorative.

| Token | Hex (light) | Hex (dark) | Role |
|---|---|---|---|
| `--paper` | `#F0E5CC` | `#1A130F` | Main surface |
| `--bone` | `#E6D9BB` | `#251A14` | Raised surfaces, cards *(derived)* |
| `--graphite` | `#2D1F1A` | `#F0E5CC` | Primary text, rule lines |
| `--lead` | `#6B5A4E` | `#A89684` | Secondary text *(derived)* |
| `--vermillion` | `#B83D3D` | `#D45050` | Accent, primary CTA, stamp |
| `--moss` | `#8FA055` | `#A8B86A` | Positive balance only |
| `--brick` | `#8A2A2A` | `#B83D3D` | Negative balance only *(derived)* |
| `--citrine` | `#E0A040` | `#E8B046` | Highlights, special moments |

The brief specified five anchors: `#F0E5CC`, `#2D1F1A`, `#B83D3D`, `#8FA055`, `#E0A040`. Bone, lead, and brick are tonal derivations off those anchors so cards and "you owe" amounts still have separation. Adjust if you want them to land elsewhere.

**Dark mode is first-class.** Design dark first, derive light. The DNA is cool near-black (`#15151A`, never pure black) on warm cream (`#E8E5D8`, never pure white). Vermillion warms in dark mode; moss shifts cooler.

### Type

| Use | Family | Weight | Tracking |
|---|---|---|---|
| Display (headers, group names, balances) | SN Pro | 600 | `-0.025em` to `-0.035em` |
| Body | SN Pro | 400–500 | `-0.005em` |
| Numerals, amounts, dates, IDs | JetBrains Mono | 500 | `-0.02em` |

**Fonts.** Display + body are **SN Pro** (variable, weights 100–900), loaded from `fonts/SNPro-VariableFont_wght.ttf`. Numerals use **JetBrains Mono** via Google Fonts as a stand-in until a licensed mono (Geist Mono / Berkeley Mono) is attached.

### Spacing

4-pt grid: `4, 8, 12, 16, 24, 32, 48, 64, 96`. Generous whitespace. The system errs toward more room rather than less.

### Backgrounds & imagery

**No gradients. No drop shadows. No glass effects. No blur.** Flat planes only.

There are no hero images, illustrations, or background textures in the brand language. Surfaces are paint chips — `--paper` over `--bone` over `--graphite` — and the visual interest comes from typography, the rule line, and the QUITS stamp.

### The rule line

The structural backbone. A `1.5px` solid graphite horizontal line under section headers, totals, and balance amounts. Borrowed directly from accounting ledgers. It appears more times per screen than any other element, and it is what makes the brand look like a *drawn object* rather than a SaaS app.

### The QUITS stamp

The most share-worthy brand moment. A rotated vermillion-bordered tag containing the word `QUITS` in mono. Specifications:

- **Border:** 1.5px solid vermillion
- **Padding:** 2–6px vertical, 8–12px horizontal
- **Rotation:** `-2deg`
- **Letter-spacing:** `0.06em`
- **The only ALL CAPS in the entire system**

Appears when a balance settles to zero.

### Strike-through on settled

A subtle 1px strike-through on the **title** of fully reconciled expenses (never on the amount). Visually says "done with this one" without removing the row.

### Borders, corners, shadows

- Card borders: `0.5px solid rgba(26, 27, 31, 0.12)` in light; `0.5px solid rgba(232, 229, 216, 0.14)` in dark.
- Border radius: **6–8px** for cards, **12px** for app surfaces. **Never** fully pill-shaped except for the small tag component.
- **Shadows: none.** No inner shadows, no outer shadows, no soft glows. Elevation is communicated by surface tone, not light.

### Motion & states

- Easing: `cubic-bezier(0.2, 0.7, 0.2, 1)` — a confident, slightly tight curve.
- Duration: `120ms` fast / `200ms` default / `320ms` slow.
- **Hover:** filled buttons darken via `color-mix(... 88%, black)`. Ghost buttons drop to `0.7` opacity. No scaling on hover.
- **Press:** `translateY(0.5px)`. No scale-down. No spring.
- **Settled animation:** the QUITS stamp rotates into view from `-6deg` to `-2deg` over 320ms, then sits still.
- No fades on route changes. No bounces. The app feels engraved, not buoyant.

### Layout

- Mobile is the canonical surface. 390px design width.
- Single accent per screen — almost always vermillion, occasionally citrine.
- Numbers are the hero: bigger than surrounding text, mono, vertically aligned.
- Header pattern: small `--lead`-colored label, large `--graphite` heading, rule line. Repeated everywhere.

### Transparency & blur

Used essentially never. The one exception is `--rule-soft` (12% graphite), which is the only translucent value in the system, and it exists only as a hairline border tint.

---

## Iconography

Stroke-based, **1.5px weight, outline only.** The reference set is **Tabler Outline** or **Lucide**. No filled icons, no duotone, no emoji-as-icon. Icons are used sparingly — only where they aid scanning (tab bars, list rows). Decorative icon usage is forbidden.

- **Source.** No icon assets were provided with the brief. This system links **Lucide** from CDN (`https://unpkg.com/lucide@latest`) as the closest match by stroke weight and corner geometry. **Substitution flagged** — if you have a custom icon set, drop the SVGs into `assets/icons/` and update `ui_kits/app/Icon.jsx`.
- **Emoji.** Never.
- **Unicode glyphs.** Not used as icons. `kr` (currency) is set in mono type, not as a glyph.
- **Logo.** `assets/quits-wordmark.svg` — the wordmark is just the word `Quits` set in Inter 600 at -0.03em, in graphite. There is no symbol mark.

---

## Anti-patterns (do not do)

- ❌ Green as a brand color
- ❌ Coral, salmon, or pink (Splito territory)
- ❌ Mint green (Splitwise territory)
- ❌ Matte black with neon (Steven / Klarna territory)
- ❌ Default shadcn cool grays (Spliit / SplitPro territory)
- ❌ Gradients, glass, soft shadows
- ❌ Title Case anywhere
- ❌ ALL CAPS outside the QUITS stamp
- ❌ Serif typefaces (this is the deliberate departure from the earlier "Kvitt" direction)
- ❌ Emoji
- ❌ Exclamation points
