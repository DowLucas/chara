/**
 * Reconciliation logic for the import flow: given the extracted `people[]`
 * names and the group's existing members, decide which names auto-match an
 * existing member (case-insensitive, trimmed) and which must be created as
 * name-only placeholder members. Drives the reconcile screen + enables
 * "confirm" once every name is resolved.
 *
 * Pure; no React, no i18n. Unit-tested by lib/__tests__/import-reconcile.test.ts.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

import type { GroupMember } from './api';

/** A single extracted-name → resolution decision. */
export interface ReconcileEntry {
  /** Extracted name as it appeared in the screenshots. */
  name: string;
  /** Resolved member id, or `null` when the name will become a placeholder. */
  memberId: string | null;
  /** True when the resolution was filled in automatically by name match. */
  auto: boolean;
}

export interface ReconcileState {
  entries: ReconcileEntry[];
  /** Names (verbatim) that resolve to a new placeholder member. */
  newMembers: string[];
  /** Every name is resolved (matched or marked as a new placeholder). */
  canConfirm: boolean;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Initial reconciliation: auto-match each extracted name to a member whose
 * name matches case-insensitively. Unmatched names default to a new
 * placeholder (memberId null). `overrides` lets the screen apply user edits
 * (name → chosen memberId, or null to force a placeholder) on recompute.
 */
export function reconcile(
  people: string[],
  members: Pick<GroupMember, 'id' | 'name'>[],
  overrides: Record<string, string | null> = {},
): ReconcileState {
  const byName = new Map<string, string>();
  for (const m of members) {
    const key = norm(m.name);
    if (key && !byName.has(key)) byName.set(key, m.id);
  }

  const seen = new Set<string>();
  const entries: ReconcileEntry[] = [];
  for (const raw of people) {
    const name = raw.trim();
    if (!name) continue;
    const dedupKey = norm(name);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      entries.push({ name, memberId: overrides[name], auto: false });
      continue;
    }
    const match = byName.get(dedupKey) ?? null;
    entries.push({ name, memberId: match, auto: match != null });
  }

  const newMembers = entries.filter((e) => e.memberId == null).map((e) => e.name);
  // Always resolvable: unmatched names simply become placeholders. Confirm is
  // blocked only if there are no people at all to import.
  const canConfirm = entries.length > 0;

  return { entries, newMembers, canConfirm };
}

/** Look up the resolved member id for a name, given a finished reconcile state. */
export function resolvedMemberId(state: ReconcileState, name: string): string | null {
  return state.entries.find((e) => norm(e.name) === norm(name))?.memberId ?? null;
}
