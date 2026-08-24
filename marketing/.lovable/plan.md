
# Wire two uploaded ukiyo-e prints into Ch.02 scenarios

The two uploads map to:
- `Image_20260522_232254.png` → **`trip`** scenario (group at the inn courtyard with travel hats, scroll-bill, calm figure with phone on the step).
- `Generated_Image_May_22_2026_-_11_24PM.jpg` → **`couple`** scenario (two figures at the chabudai, one holding the phone with the vermillion CHARA chop).

## Steps

1. Copy uploads into the project:
   - `user-uploads://Image_20260522_232254.png` → `src/assets/scenario-trip.png`
   - `user-uploads://Generated_Image_May_22_2026_-_11_24PM.jpg` → `src/assets/scenario-couple.jpg`

2. In `src/routes/index.tsx`:
   - Add ES6 imports for both assets at the top.
   - Build a small `scenarioImages` map keyed by scenario id (`trip`, `couple`) so it's trivial to add more later as you generate them.
   - In `ScenarioPanelContent`, when `scenarioImages[active]` exists, render the image as a print *above or beside* the mock receipt (within the existing right panel). Use a bone-cream framed `<figure>` with a 1.5px sumi keyblock border to match `HankoSeal`/`LegalPrint` treatment. `loading="lazy"`, descriptive `alt` per scenario, `aspect-ratio` preserved (the trip print is ~1:1, the couple print is ~3:4).
   - Keep the existing mock-receipt card; the print sits as the hero of the panel and the receipt sits beneath it on mobile / beside it on `lg`.

3. Add alt-text strings to `src/i18n/en.ts` and `src/i18n/sv.ts` under `scenarios.panels.trip.alt` and `scenarios.panels.couple.alt` so the alt copy is translatable and stays in the same shape as existing panel content.

4. No layout change for scenarios that don't yet have an image — they keep the current text + mock-receipt layout. The image slot renders only when a mapping exists.

## Technical notes

- Imports stay as `import tripImg from "@/assets/scenario-trip.png"` etc., per project convention (`src/assets` + ES6 import, not `public/`).
- The image frame should reuse existing tokens (`bg-bone`, `border-sumi/15`, `paper-grain` if appropriate) — no new colors, no new CSS variables.
- AnimatePresence transitions already wrap the panel; the image will fade with the rest of the panel content on tab change. No extra motion needed.
- TS-strict: both imports must exist before the file references them — copy assets in the same edit batch as the index.tsx change.

## Out of scope

- Generating the remaining four scenario prints (`living`, `dinner`, `event`, `recurring`) and the section-level prints (hero, belief, CTA). Happy to do those next once you confirm this wiring looks right.
