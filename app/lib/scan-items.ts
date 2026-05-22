// Pure helpers for the OCR "assign items" step in add-expense flow.
//
// The flow is scan-time-only (Option A): the user assigns each item to one
// or more group members, we compute per-member subtotals + prorated tax/tip,
// and the result is saved as a regular exact-split expense. No per-item
// provenance is persisted.

export interface ScanItem {
  /** Client-side stable id (we generate it on the mobile side — Gemini
   *  doesn't return ids). */
  id: string;
  description: string;
  qty: number;
  unit_price_minor: number;
  total_minor: number;
}

/** memberID[] per item id. Empty array (or missing) = unassigned. */
export type ItemAssignment = Record<string, string[]>;

export interface ProrateInput {
  items: ScanItem[];
  assignments: ItemAssignment;
  taxMinor: number;
  tipMinor: number;
  /** All group member IDs eligible for the expense. Used for unassigned
   *  item redistribution and to filter unknown IDs out of assignments. */
  participants: string[];
}

/** Distribute `total` int minor units across `count` recipients as evenly
 *  as possible. First `remainder` recipients get one extra minor unit. */
function distributeInt(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total === 0) return new Array(count).fill(0);
  const base = Math.trunc(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Compute per-participant amounts (in minor units) from itemized assignments.
 *
 * Algorithm:
 *  1. For each item, split `total_minor` equally across the assigned member
 *     set. If unassigned, redistribute equally across all participants.
 *     Remainders go to the lowest-sorted memberID (deterministic).
 *  2. Tax + tip are prorated proportionally to each participant's item
 *     subtotal share. If the item subtotal is zero (e.g. comped items),
 *     tax + tip is split equally across all participants.
 *  3. Sum of outputs is guaranteed to equal sum(items) + tax + tip.
 */
export function prorateItemAssignments(input: ProrateInput): Record<string, number> {
  const { items, assignments, taxMinor, tipMinor, participants } = input;

  if (items.length === 0 && taxMinor === 0 && tipMinor === 0) {
    return {};
  }

  // Allow stable remainder allocation by working off a sorted member list.
  const sortedParticipants = [...participants].sort();
  const participantSet = new Set(sortedParticipants);

  const perMember: Record<string, number> = {};
  for (const p of sortedParticipants) perMember[p] = 0;

  // 1. Item subtotals --------------------------------------------------------
  for (const item of items) {
    const raw = assignments[item.id] ?? [];
    // Filter out unknown member IDs; dedupe.
    const targetsFiltered = Array.from(new Set(raw.filter((m) => participantSet.has(m))));
    const targets = targetsFiltered.length > 0 ? targetsFiltered : sortedParticipants;
    // Sort so the remainder consistently lands on the lowest memberID.
    targets.sort();

    const shares = distributeInt(item.total_minor, targets.length);
    targets.forEach((memberId, i) => {
      perMember[memberId] = (perMember[memberId] ?? 0) + shares[i];
    });
  }

  // Capture per-member subtotal *before* tax/tip so proration uses item
  // share, not item+other-stuff.
  const subtotalByMember: Record<string, number> = { ...perMember };
  const totalSubtotal = Object.values(subtotalByMember).reduce((s, v) => s + v, 0);
  const taxTip = taxMinor + tipMinor;

  // 2. Tax + tip proration ---------------------------------------------------
  if (taxTip !== 0) {
    if (totalSubtotal > 0) {
      // Proportional with deterministic remainder. Compute provisional
      // floor amounts; distribute leftover one minor unit at a time to
      // the members with the largest fractional remainder, breaking ties
      // by sorted memberID.
      const provisional: Array<{ id: string; floor: number; frac: number }> = [];
      let assigned = 0;
      for (const id of sortedParticipants) {
        const share = (subtotalByMember[id] ?? 0) * taxTip;
        const floor = Math.trunc(share / totalSubtotal);
        const frac = share - floor * totalSubtotal; // 0..totalSubtotal-1
        provisional.push({ id, floor, frac });
        assigned += floor;
      }
      let remainder = taxTip - assigned;
      // Sort by largest frac, then by id ascending for tie-break.
      provisional.sort((a, b) => {
        if (b.frac !== a.frac) return b.frac - a.frac;
        return a.id.localeCompare(b.id);
      });
      for (let i = 0; i < provisional.length && remainder > 0; i++) {
        provisional[i].floor += 1;
        remainder -= 1;
      }
      for (const { id, floor } of provisional) {
        perMember[id] = (perMember[id] ?? 0) + floor;
      }
    } else {
      // Subtotal zero → spread equally.
      const shares = distributeInt(taxTip, sortedParticipants.length);
      sortedParticipants.forEach((id, i) => {
        perMember[id] = (perMember[id] ?? 0) + shares[i];
      });
    }
  }

  // Drop zero entries to keep the result tidy (callers can default to 0).
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(perMember)) {
    if (v !== 0) out[id] = v;
  }
  return out;
}
