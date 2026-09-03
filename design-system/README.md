# Chara Design System

Chara is an open-source, self-hostable bill-splitting app. This system describes its mobile app.

Everything here is generated from or transcribed against **`app/lib/theme.ts`** in the Chara repo. That file is the source of truth; `tokens.css` is a projection of it, kept honest by a test that fails CI when the two drift.

## Foundations

**Palette.** Five working colours do almost all the work: `paper` (canvas), `bone` (content surface), `graphite` (ink), `lead` (secondary ink), and `vermillion` (the seal — primary CTA). Surfaces are flat solid fills. There are no gradients and no drop shadows anywhere in the app.

**Typography.** SN Pro carries language; JetBrains Mono carries number.

- `fontDisplay` (SN Pro SemiBold) — group names, expense titles, hero amounts
- `fontBody` (SN Pro Regular) — prose meta lines, error banners, modal messages
- `fontMono` (JetBrains Mono) — digits, dates, currency codes, eyebrow labels

The test: if a line is text — a sentence, a status word, a name — use the humanist sans. If it is a number, a date, a code or a technical identifier, mono is right.

**The bone card.** Primary content lists (expenses, members, groups, splits) use bone cards: background `bone`, radius 10, **no border**, 16px padding, 8px gap between cards, 16px horizontal margin. Preview and dense lists may use a 1px `ruleSoft` hairline divider instead. The heavy 1.5px `graphite` rule is for hero-level separators only — the top bar and the tab bar.

**Settings-hub lists.** Settings-style screens use a mono eyebrow above each block, a 1px `ruleSoft` top hairline, and one hairline under every row. Navigation rows carry a chevron; read-only rows carry a right-aligned mono value.

## Rules that aren't tokens

These do not survive as CSS, and getting them wrong is what makes a mockup look almost-but-not-Chara.

- **`moss` is `#586D2A`, not the pale brand olive `#8FA055`.** The pale shade fails WCAG AA as text on cream. `palmLeaf` keeps it for surfaces that aren't text.
- **The group accent order is load-bearing.** A group picks its colour by `hash % 8` into the swatch array, so reordering it recolours every group that already exists.
- **Signal colour only where direction matters.** The expenses tab is neutral — it is spend history, not balance. The standings tab is coloured — it is net per person. `graphite` for neutral facts, `brick` for "you owe" and destructive actions, `moss` for "you're owed" and completed settlements.
- **The `+` / `−` prefix belongs only on balance deltas**, never on a plain amount.
- **"Positive" is graphite, not moss.** The positive CTA (settle, mark paid) reuses the active-tab vocabulary so it feels resolved and doesn't share visual weight with the destructive brick family.
- **Money is int64 minor units.** Decimal strings on the wire and on screen; never a float. Totals are per-currency and are never summed across currencies.
- **Text must survive OS font zoom.** The app caps scaling at 2× centrally; a layout that breaks at 200% is a bug, so avoid fixed-height text containers.
- **Every user-facing string is translated.** There are 15 locales, so leave room — German and Finnish run long.

## Files

| Path | What it is |
|---|---|
| `tokens.css` | CSS custom properties (generated) + `@font-face` + component classes |
| `fonts/` | The five static faces the app loads at runtime |
| `preview/` | One specimen per token group and component |
| `ui_kits/app/` | Full 390×844 screen recreations |
