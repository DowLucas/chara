# Chara App Store Screenshot Kit

This directory is the source of truth for App Store / Play Store screenshot generation. It encodes Chara's visual system the way an art director would brief a designer — so an AI image model (or a human) produces screens that actually look like Chara, not like generic SaaS.

## Files

| File | Purpose |
|---|---|
| [`design-system.md`](./design-system.md) | Colors, typography, layout, and "what makes a Chara screen feel like Chara." Pulled directly from `app/lib/theme.ts`. |
| [`voice-and-copy.md`](./voice-and-copy.md) | Tone, cadence, and verbatim phrasings from the live marketing site at [getchara.lovable.app](https://getchara.lovable.app/). Read this before writing any headline. |
| [`screen-sequence.md`](./screen-sequence.md) | The 10-screen sequence for the App Store — headlines lifted from the site's voice, with subhead and what the device frame must show. |
| [`ai-prompt.md`](./ai-prompt.md) | The master AI prompt — paste-and-run for Midjourney / Flux / DALL·E / Figma AI. Includes per-screen variations. |
| [`technical-spec.md`](./technical-spec.md) | Dimensions, export formats, file naming, and submission notes. |

## The two aesthetics — resolved

Chara has two visual surfaces and they look different on purpose:

- **The app itself** — warm Nordic paper. Cream `#F0E5CC`, espresso text, mono digits. This is `app/lib/theme.ts`.
- **The marketing site** — minimalist Japanese ukiyo-e influence, chapter-label structure, Hokusai/Hiroshige imagery references.

**Rule for App Store screenshots:**

- **Inside the device frame** = the app's Nordic-paper aesthetic (because that's what the user actually sees when they install).
- **Around the device frame** (background, headlines, eyebrow tags) = also Nordic-paper, *not* ukiyo-e. App Store screenshots are a *product* surface, not a *marketing site* surface. Keep them consistent with what the user opens.
- **Copy and voice** (headlines, subheads) = lifted straight from the marketing site. See [`voice-and-copy.md`](./voice-and-copy.md).

The ukiyo-e treatment belongs on the .lovable.app site only. Don't mix it into the App Store kit.

## How to use this kit

1. **Read `design-system.md` first.** Every other file assumes you've internalized the palette, typography, and "color as verb" rule.
2. **Capture real screens from the running app** — never let AI invent in-device UI. AI hallucinates buttons. Use Expo, take real PNGs.
3. **Use `ai-prompt.md` to generate the backdrop + composition** in Midjourney / Flux. Overlay the real screen captures and headlines in Figma.
4. **Cross-check against `screen-sequence.md`** for headline copy and what each slide must communicate.
5. **Export per `technical-spec.md`.**

## Hard rules

- **Cream background `#F0E5CC` everywhere.** Never pure white. Never bright.
- **No AI-generated UI.** Real captures only inside the device frame.
- **No emoji decoration.** Mono labels and signal-color chips do that job.
- **Signal color is a verb.** Rust = "you owe." Sage = "you're owed." Amber = primary action. Everything else stays graphite.
- **Mono digits, big.** The numbers are the protagonist.
