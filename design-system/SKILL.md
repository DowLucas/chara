---
name: chara-design
description: Use this skill to design well-branded interfaces for Chara, the open-source bill-splitting app — production screens, mockups, or throwaway prototypes. Contains the real design tokens, typefaces, component specs, and the rules that make a screen read as Chara.
user-invocable: true
---

Read `README.md` in this skill, then explore the other files.

For visual artifacts (mocks, explorations, slides), copy the fonts out and build static HTML against `tokens.css`. For production work, read the rules here and write React Native against `app/lib/theme.ts` — the tokens in this skill are a projection of that file, and it is the source of truth.

If the user invokes this skill with no other guidance, ask what they want to design, ask a few questions, and act as an expert designer.

## Quick orientation

- **Chara** is a self-hostable bill-splitting app (a Splitwise alternative). Phone-first, iOS + Android + web from one Expo codebase.
- The look is **Edo-period print discipline**: warm cream paper, near-black ink, a single vermillion seal. Flat, quiet, no gradients, no shadows, no glass.
- Canvas is `paper` `#F0E5CC`. Content surfaces are `bone` `#E6D9BB`. Ink is `graphite` `#2D1F1A`.
- Type: **SN Pro** (regular / medium / semibold) for language, **JetBrains Mono** for number.
- Signature motif: the **bone card** — bone on paper, radius 10, *no border*. The contrast does the separation.

## Files to read first

1. `README.md` — voice, foundations, and the rules that aren't tokens
2. `tokens.css` — import directly into any HTML you build
3. `preview/*.html` — token and component specimens
4. `ui_kits/app/*.html` — full 390×844 screen recreations to compose against

## Do / don't

- **Do** put language in SN Pro and number in JetBrains Mono. Amounts get `tabular-nums`.
- **Do** keep surfaces flat — solid fills only, no gradients, no drop shadows.
- **Do** apply signal colour only where direction actually matters.
- **Don't** use emoji. Anywhere.
- **Don't** invent icons — the app uses Feather from `@expo/vector-icons`.
- **Don't** put status words ("active", "settled") in mono; they read like console output.
- **Don't** round corners heavily. The scale tops out at 16, and cards use 10.
