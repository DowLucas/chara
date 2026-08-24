# Chara — marketing site

The open-source, self-hostable bill-splitter. This repo contains the marketing site only.

## Stack, in one paragraph

Built on **TanStack Start v1** (React 19, Vite 7) with **Tailwind CSS v4** for styling. TanStack Start was chosen because the site is a small constellation of routes — one landing plus six legal pages — and each one deserves its own server-rendered `<head>` for SEO and link-preview reasons. File-based routing keeps the route tree readable, SSR ships real HTML for crawlers, and Tailwind v4's CSS-first design tokens let the five-block color discipline live as semantic variables in `src/styles.css` rather than as a config object — which is the right place for it, because the colors are the system. **Motion for React** handles the three earned animation moments (scroll fade-in, hero count-up, hero cursor parallax) at a fraction of a Lottie's weight. No CMS, no headless anything — the copy is the code, which is appropriate for a 7-page site.

## The five blocks

Sampled from actual nishiki-e, not from a brand-color generator. Defined in `src/styles.css` as the only colors on the site; everything else is a tint, shade, or alpha of one of these.

| token            | role               | oklch                   | source                                    |
| ---------------- | ------------------ | ----------------------- | ----------------------------------------- |
| `--indigo`       | canvas (dark-mode-first) | `oklch(0.225 0.082 257)` | Prussian blue / aizuri-e (Hokusai)        |
| `--bone`         | content surface, body type on indigo | `oklch(0.948 0.018 86)`  | mitsumata fiber paper                     |
| `--sumi`         | ink, 1.5px keyblock outline | `oklch(0.155 0.012 60)`  | sumi black                                |
| `--ochre`        | single supporting accent | `oklch(0.745 0.140 72)`  | warm earth ochre                          |
| `--shu`          | hanko seal only — never another use | `oklch(0.560 0.215 30)`  | vermillion shu                            |

Dark-mode-first inversion: indigo is the canvas, bone is the print laid on it. The five tokens are surfaced as semantic Tailwind utilities (`bg-indigo`, `text-bone`, `border-sumi`, `text-ochre`, `bg-shu`) plus a small set of derived tints (`bone-dim`, `bone-mute`, `indigo-soft`).

## Type pairing

- **Inter Tight** — body and display. Headlines set at -0.035em tracking, line-height 0.96–1.05. Body at 1.6–1.7 leading.
- **JetBrains Mono** — numerals, dates, eyebrow indices (`01 / 02 / 03`), code card, and the hero balance figure. `font-feature-settings: "tnum", "zero"` enabled site-wide on `.mono`. This is the print's handwritten margin notation.

No serif anywhere. No fake brush. No "Asian-style" display typeface.

## Design principles, committed

1. **Five blocks, no more.** Every color on the page derives from the five tokens above. Lints would catch a sixth.
2. **Asymmetric composition with ma.** The hero is not centered; content sits lower-left with deliberate void upper-right. Mass distribution echoes Hokusai's *Great Wave* (mitate, not depiction).
3. **Flat planes, hard edges.** No drop shadows, no glassmorphism, no glow. The radius scale is `0px` across the board. One bokashi edge in the self-host code card — the only gradient on the site.
4. **The hanko seal as recurring signature.** A small vermillion square with the CHARA wordmark sits at the bottom-right of every section and every legal page. It is the only saturated red and never animates.
5. **Vertical scroll-as-emaki.** No horizontal carousels, no parallax other than the 4–8px cursor parallax on the hero card.
6. **Mitate.** Hero echoes the Great Wave's lower-left/upper-right mass distribution. The belief section echoes Hiroshige's rain — diagonal energy built entirely from type and 1px ochre rules.
7. **Type discipline.** One modern sans, one quality mono. Headlines large and tight, body generous.
8. **Numerals as hero.** The balance figure in the hero card is the single largest element on the page, set in tabular mono, treated like a chop carved deep into the block.
9. **Print artifacts, used once each.** One registration mark (footer corner). One bokashi edge (self-host card). Paper grain only on cream surfaces, at 6% opacity.
10. **Type instead of icons.** `§ ¥ ¶ ‡ ⌘ №` carry the feature grid; `01 / 02 / 03` carry the eyebrows. No Lucide.
11. **Motion is restrained.** Slow fade-in on scroll. Hero balance counts up once. Cursor parallax on the hero card. Easing is always `cubic-bezier(0.2, 0.7, 0.2, 1)`. Nothing bounces, nothing springs.
12. **No photography.** No stock, no screenshots in fake browser chrome, no full-bleed scan. The whole site is type, rules, and the five blocks.

## Required don'ts, honored

No cherry blossoms. No torii. No kanji as decoration. No fans, dragons, koi, samurai, geisha. No brush-stroke SVGs. No ink-splatter. No zen-rock-garden minimalism cliché. No "trusted by" logo wall. No screenshots. The vermillion is used only as a hanko seal and once in the final CTA block — never as a "brand red."

## Routes

```
/             landing
/privacy      legal — privacy policy
/terms        legal — terms of service
/cookies      legal — cookie disclosure
/dpa          legal — data processing agreement
/security     legal — security posture + disclosure
/support      legal — support channels
```

Each legal page is rendered as a single cream "print" laid on the indigo canvas, with the hanko seal bottom-right.

## Run it

```bash
bun install
bun dev
```
