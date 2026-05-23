# Chara — Design System (Marketing Surfaces)

Source: `app/lib/theme.ts`. If this doc drifts from the code, the code wins.

## The Theme in One Sentence

**Warm Nordic financial paper.** Cream backgrounds, espresso text, mono digits, with rust/sage signal color only where money direction matters. Mullvad's restraint meets a leather-bound ledger — not Splitwise's cheery green.

## Reference brands

- **Immich** — technical, transparent, restrained
- **Bitwarden** — trustworthy, professional, slightly boring (good)
- **Mullvad VPN** — privacy-first, Nordic, no nonsense
- **Hetzner** — German, low-key, just works

Things Chara is **not**: gradient-heavy fintech, Series-A theater, "join 10,000+ teams" SaaS chrome, emoji-laden disruptor.

## Color palette

| Role | Token | Hex | Use it for |
|---|---|---|---|
| **Background** | `paper` / `sandDune` | `#F0E5CC` | Screenshot canvas, primary surface |
| **Card surface** | `bone` | `#E6D9BB` | Cards on top of paper — subtle contrast, no border needed |
| **Primary text** | `graphite` / `darkCoffee` | `#2D1F1A` | All headlines, body, hero numerals |
| **Secondary text** | `lead` | `#6B5A4E` | Captions, eyebrow labels, meta lines |
| **Hairlines** | `ruleSoft` | `rgba(45,31,26,0.14)` | Dividers between rows |
| **Owe / destructive** | `vermillion` | `#B83D3D` | "You owe", minus prefix, danger CTAs |
| **Deep destructive** | `brick` | `#8A2A2A` | Pressed states, danger-zone headers |
| **Owed / settled** | `moss` / `palmLeaf` | `#8FA055` | "You're owed", settled stamps, plus prefix |
| **Call to action** | `citrine` / `honeyBronze` | `#E0A040` | Primary buttons, pending highlights, the eyebrow |
| **On-accent text** | `fgOnAccent` | `#F4F1E6` | Text *inside* citrine/moss/brick chips |

### The color-as-verb rule

Color carries semantic weight:

- `vermillion` (rust) → **you owe** / to be paid / destructive
- `moss` (sage) → **you're owed** / completed settlement
- `citrine` (amber) → **action pending** / primary CTA
- `graphite` → **neutral facts** (per-person share, expense amount on a list row, a date)

Only apply signal color where direction actually matters. The expenses list is neutral (it's spend history). The standings list is colored (it's net per person). The +/- prefix appears only on balance deltas, never on raw amounts.

## Typography

Three families, three intents.

| Family | Use | Substitute (if no SNPro license) |
|---|---|---|
| **SNPro SemiBold** | Display: headlines, group names, hero amounts | Inter SemiBold, Söhne Halbfett |
| **SNPro Regular** | Body: prose, meta lines, error banners | Inter Regular |
| **JetBrains Mono** | Digits, dates, currency codes, eyebrow labels, status chips | IBM Plex Mono |

### Type scale (from `theme.ts`)

| Token | Size | Used for |
|---|---|---|
| `amountHero` | 60 mono | Giant balance numbers on home/group |
| `amountXL` | 48 mono | Hero amounts in marketing screens |
| `amountL` | 24 mono | List-row amount columns |
| `displayL` | 44 sans semibold | Marketing headlines |
| `displayM` | 32 sans semibold | Screen titles |
| `displayS` | 22 sans semibold | Subheads |
| `bodyL` | 19 sans regular | Marketing subhead |
| `body` | 17 sans regular | List rows |
| `bodyS` | 15 sans regular | Captions |
| `monoLabel` | 13 mono medium, ls 0.4 | Eyebrow labels |
| `monoStamp` | 13 mono medium, ls 1.0 | The `CHARA` stamp |

### Typography rules

- If a line is text (a sentence, a name, a status word), use the humanist sans.
- If it's a number, code, date, or technical identifier, use mono.
- Amount columns use `fontVariant: ['tabular-nums']` — digits align vertically.
- Status words like "active" / "settled" go in **sans**, not mono. Mono status reads like console output.

## Layout primitives

### The bone card

The primary list-row container:

- Background: `bone` `#E6D9BB`
- Border radius: 10
- **No border.** The bone-vs-paper contrast does the separation work.
- Horizontal margin: 16
- Vertical gap between cards: 8

### Hairline divider lists

Dense preview lists (home activity preview, settings rows):

- 1px `ruleSoft` between rows
- No card chrome
- Used inside settings-hub patterns

### Settings-hub list

For settings-style screens:

- Section eyebrow above each block (mono caption, `lead`, letter-spacing 0.3)
- `list` container has a top hairline
- Each row: 24px horizontal padding, 16px vertical padding, bottom hairline
- `NavRow` (label + chevron) for navigation; `InfoRow` (label + right-aligned mono value) for read-only key/value pairs

## Iconography

- **Stroke icons only**, 1.5px line weight, `graphite` color.
- No filled glyphs except the brand mark.
- No emoji in UI chrome. Emoji is fine inside user-generated content.
- Custom Chara wordmark — never substitute a font for the logo.

## Elevation

- **Maximum elevation: 1–2px diagonal shadow.** Inside the app there are no shadows; in marketing renders the device frame gets a soft 30% diagonal shadow falling to the lower-right.
- No glow. No neon. No glassmorphism. No iOS blur backgrounds.

## The "CHARA" stamp

The signature element. A small mono uppercase wordmark with 1.0 letter-spacing:

- Used in the top-right corner of hero balance cards
- 13pt mono medium
- `lead` color (`#6B5A4E`) on `bone` background
- Pretends to be a receipt watermark

If you see "CHARA" anywhere in a marketing render, it should be this stamp, not a logo treatment.

## Density and spacing

Spacing scale (4-based): `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`.

Marketing screens use the *larger* end of the scale (24+) — generous whitespace, plenty of paper showing around each card. Cramped is wrong.

## Composition for marketing renders

A Chara App Store slide consists of, top to bottom:

1. **Eyebrow** (mono uppercase, 13pt, citrine `#E0A040`, letter-spacing 1.0) — usually just `CHARA` or a feature tag like `MULTI-SERVER`.
2. **Headline** (display sans semibold, 44–56pt, graphite) — one line, two at most.
3. **Subhead** (body sans regular, 19–22pt, graphite at 75% opacity) — one sentence, never a paragraph.
4. **Device frame** — iPhone 15 Pro, midnight bezel, real screen capture inside.
5. **(Optional) annotation chip** — small bone card with mono caption pointing to a feature.

Everything sits on `#F0E5CC` paper, with subtle grain. No background photos, no people, no objects. The product is the hero.

## What "feels like Chara"

A render passes the Chara test if all of these are true:

- Background is cream, not white.
- Headlines are espresso, not pure black.
- The dominant typography on the device screen is **mono digits**.
- There is at most **one** color besides graphite/cream in the frame, and it carries semantic meaning.
- There is no gradient anywhere.
- The composition feels like an editorial product shoot from a quiet Stockholm studio, not a Salesforce keynote slide.
