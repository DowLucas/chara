# Chara — App UI kit

Mobile-first. The canonical surface is a 390 × 844 iPhone-class screen.

## Screens
1. **Groups** — list of all groups with net balance hero.
2. **Group detail** — single group, expenses, balance breakdown.
3. **New expense** — amount-first form with category chips.
4. **Settle** — review who pays whom, send via Swish.
5. **Settled** — the "Chara. Nice." moment with the CHARA stamp.

## Components
- `TopBar`, `IconButton`, `Section`
- `Avatar`, `AvatarStack` (initials-only, no images)
- `ListRow` (handles settled strike-through)
- `Stamp` (the CHARA signature)
- `Button` (primary, secondary, ghost)
- `Chip` (small mono pill — solid, outline, accent)
- `TabBar` (bottom, 4 tabs)
- `Field` (label + input, amount variant)
- `EmptyState`
- `Icon` (Lucide bridge — outline, 1.5px stroke)

## Implementation notes
- All numerals are JetBrains Mono with `font-variant-numeric: tabular-nums`.
- Balance figures hit 56px on hero, 17px in rows.
- Settled rows: strike-through the **title**, dim the amount. The amount itself is not struck.
- The CHARA stamp is the only ALL-CAPS in the app.
- No images. No emoji. Avatars are initials in a circle.
