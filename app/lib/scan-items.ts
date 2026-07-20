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

/**
 * Everything needed to re-derive an itemised split.
 *
 * Owned by the expense wizard rather than the assign modal, so that switching
 * split method is non-destructive: the per-item assignments survive a trip
 * through "evenly" / "%" and the user can return to the itemised split
 * without rescanning the receipt.
 */
export interface Itemization {
  items: ScanItem[];
  assignments: ItemAssignment;
  taxMinor: number;
  tipMinor: number;
}

/**
 * Per-member amounts for an itemisation, re-derived against the *current*
 * participant set rather than a snapshot taken at scan time. Toggling a member
 * off therefore redistributes their items across whoever is left, instead of
 * leaving a stale amount behind.
 */
export function itemizedAmounts(
  itemization: Itemization,
  participants: string[],
): Record<string, number> {
  return prorateItemAssignments({
    items: itemization.items,
    assignments: itemization.assignments,
    taxMinor: itemization.taxMinor,
    tipMinor: itemization.tipMinor,
    participants,
  });
}

export interface ProrateInput {
  items: ScanItem[];
  assignments: ItemAssignment;
  taxMinor: number;
  tipMinor: number;
  /** All group member IDs eligible for the expense. Used for unassigned
   *  item redistribution and to filter unknown IDs out of assignments. */
  participants: string[];
}

/** Minimal shape of a scanned line item this module needs to scale. */
export interface ConvertibleItem {
  unit_price_minor: number;
  total_minor: number;
}

export interface ScanItemsState<I extends ConvertibleItem> {
  items: I[];
  taxMinor: number;
  tipMinor: number;
  /** Container deposit ("pant") from the receipt. Part of the total but not
   *  of the items, so it is offered as an evenly-shared extra charge rather
   *  than prorated like tax/tip. */
  depositMinor: number;
  totalMinor: number;
  currency: string;
}

/**
 * Decide whether (and how) to open the itemised assign view after a receipt
 * scan, scaling line items + tax + tip into the group's currency.
 *
 * Returns `null` when there are no line items, or when the applied amount is
 * NOT in the group currency (the FX-failed fallback, where the wizard's own FX
 * section converts instead and an itemised split in the receipt currency would
 * be inconsistent with the converted total).
 *
 * When the receipt was foreign and converted, every minor amount is scaled by
 * `applied.amount_minor / receipt.total_minor` — the exact rate the user
 * accepted on the scan screen, including any bank-rate bump. Same-currency
 * receipts have factor 1, so this is a no-op for them.
 */
export function buildScanItemsState<I extends ConvertibleItem>(
  receipt: {
    currency: string;
    total_minor: number;
    tax_minor?: number;
    tip_minor?: number;
    deposit_minor?: number;
    items?: I[];
  },
  applied: { amount_minor: number; currency: string },
  groupCurrency: string,
): ScanItemsState<I> | null {
  const items = receipt.items ?? [];
  if (items.length === 0 || applied.currency !== groupCurrency) return null;

  // Tax-inclusivity heuristic, computed in the receipt currency (ratios are
  // conversion-invariant): line-item prices on most non-US receipts already
  // include VAT, and Gemini *also* returns tax separately, so naively summing
  // items + tax + tip double-counts. Pick whichever candidate reconciles
  // better against the printed total; ties go to tax-exclusive.
  //
  // The deposit is part of the printed total but never part of the items, so
  // it is netted out first — otherwise a pant (or refund) the same size as the
  // moms line flips the comparison and the wrong candidate wins.
  const tax = receipt.tax_minor ?? 0;
  const tip = receipt.tip_minor ?? 0;
  const deposit = receipt.deposit_minor ?? 0;
  const itemsSum = items.reduce((s, it) => s + it.total_minor, 0);
  const totalNetDeposit = receipt.total_minor - deposit;
  const inclusiveErr = Math.abs(itemsSum + tip - totalNetDeposit);
  const exclusiveErr = Math.abs(itemsSum + tax + tip - totalNetDeposit);
  const taxAlreadyInItems = tax > 0 && inclusiveErr < exclusiveErr;

  const factor =
    receipt.total_minor > 0 ? applied.amount_minor / receipt.total_minor : 1;
  const conv = (m: number) => Math.round(m * factor);
  const convItems =
    factor === 1
      ? items
      : items.map((it) => ({
          ...it,
          unit_price_minor: conv(it.unit_price_minor),
          total_minor: conv(it.total_minor),
        }));

  return {
    items: convItems,
    taxMinor: taxAlreadyInItems ? 0 : conv(tax),
    tipMinor: conv(tip),
    // Signed: a pant charge is positive, a pantretur refund negative. The
    // deposit is part of the total but not the items, so the sign has to
    // survive or the assign screen can't reconcile a refunded receipt.
    depositMinor: conv(deposit),
    totalMinor: applied.amount_minor,
    currency: applied.currency,
  };
}

/**
 * Whether a scanned receipt's assigned split reconciles with its printed
 * total, within one minor unit of rounding slack.
 *
 * `proratedMinor` is the sum of the per-member item + tax + tip amounts.
 * `depositMinor` is the evenly-shared deposit, which is deliberately NOT
 * prorated into members — it becomes the wizard's "split the rest" remainder —
 * yet it is still part of the receipt total. Leaving it out of this check is
 * what made a pant receipt unable to leave the assign screen.
 */
export function scanTotalReconciles(
  proratedMinor: number,
  depositMinor: number,
  totalMinor: number,
): boolean {
  return Math.abs(proratedMinor + depositMinor - totalMinor) <= 1;
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
