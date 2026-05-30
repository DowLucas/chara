# Import on-ramp in the empty group

**Date:** 2026-05-30
**Status:** Approved, ready to implement
**Related:** `docs/superpowers/specs/2026-05-28-import-from-another-app-design.md`

## Problem

The "Import balances from another app" flow is reachable only from an existing
group's **Settings** hub (`groups/[server]/[id]/settings.tsx`). It is not part of
the create-group wizard or onboarding. The highest-value moment to import — when
a user is migrating from Splitwise/Tricount and wants to carry over existing
balances — is right after a group is created, while it is still empty. At that
point the feature is invisible.

Surfacing import inside the create-group wizard is awkward because a freshly
created group has exactly **one member** (the creator); other people only become
members after they accept the invite. Import itself, however, *creates* members
for the names it finds in screenshots (its reconcile step has a "new member"
fallback), so import is a valid on-ramp even for a solo creator.

## Goal

Surface "Import from another app" as a migration on-ramp in the **empty group**
(Overview tab, zero expenses), without removing the permanent Settings entry.

Non-goals (YAGNI): no onboarding-wizard step, no member-count gate, no analytics
event, no dismiss state, no bottom-bar changes, no lock/archive gating beyond what
the existing "Add expense" button already does.

## Trigger

- Overview tab of `groups/[server]/[id]/index.tsx`, when `expenses.length === 0`.
- Shown regardless of member count (import creates members from screenshots).
- Not separately gated on lock/archive — mirrors the existing always-visible
  "Add expense" button. If write-gating on locked groups is added later, the
  empty-state "Add first expense" and the bottom-bar "Add expense" should gate
  together; that is out of scope here.

## UI

New presentational component `components/GroupEmptyState.tsx`:

- Icon + title + body (migration-aware copy).
- Two stacked buttons: **Add first expense** (primary) and **Import from another
  app** (secondary).
- Props: `{ onAddExpense: () => void; onImport: () => void }`. No navigation or
  data logic inside — keeps it trivially testable and reusable.

The shared `components/EmptyState.tsx` is **not** modified — it stays a plain
title/body/icon used by the standings and payments empty states.

In `index.tsx`, the `expenses.length === 0` branch of the Overview tab renders
`<GroupEmptyState>` instead of the current `<EmptyState>`.

The bottom CTA bar (Add expense + Settle) is left unchanged. Accepted trade-off:
while empty, "Add first expense" and the bottom-bar "Add expense" are two buttons
with the same effect; this can be collapsed later if it proves noisy.

## Navigation

- Add first expense → `/groups/${encodeURIComponent(serverUrl)}/${id}/add-expense`
- Import → `/groups/${encodeURIComponent(serverUrl)}/${id}/import`

Both targets already exist; the import target is the same picker the Settings
entry routes to.

## i18n

New keys under `groupDetail` in `app/lib/locales/en.json`:

- reuse existing `emptyTitle` ("No expenses yet")
- `emptyBodyImport` — migration-aware body
- `emptyAddFirst` — "Add first expense"
- `emptyImport` — "Import from another app"

Run `pnpm i18n:extract` after wiring the `t()` calls.

## Testing (TDD)

Because the action logic lives in the isolated `GroupEmptyState`, write the test
first:

- Renders `GroupEmptyState`; asserts both buttons are present.
- Pressing "Add first expense" calls `onAddExpense`; pressing "Import from another
  app" calls `onImport`.

The `index.tsx` change is a one-line branch swap, covered by the component test
plus manual verification on a device.
