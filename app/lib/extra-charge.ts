// An optional secondary charge on an expense: a fee, service charge, or
// Swedish "pant" (bottle/can deposit) that belongs to the receipt as a whole
// rather than to any one line item.
//
// Receipts routinely print such a charge inside the total while none of the
// line items account for it, which otherwise leaves an unassignable remainder
// the user has to reconcile by hand. Because it can't be attributed to anyone
// in particular, it is shared evenly by everyone on the expense.

import { equalSplit } from './split';

export interface ExtraCharge {
  /** Free-text label shown in the UI, e.g. "Pant" or "Service fee". */
  label: string;
  amountMinor: number;
}

/**
 * Split an extra charge evenly across `participants`.
 *
 * Reuses `equalSplit` so the remainder rule is identical to the backend's
 * `split.Equal` / `money.SplitEqual`: leftover minor units go to the
 * lexicographically-first member ids. Returns {} when there is nothing to
 * split, so callers can merge the result unconditionally.
 */
export function splitExtraCharge(
  amountMinor: number,
  participants: string[],
): Record<string, number> {
  if (amountMinor === 0 || participants.length === 0) return {};
  const out: Record<string, number> = {};
  for (const share of equalSplit(BigInt(amountMinor), participants)) {
    out[share.memberId] = Number(share.amountMinor);
  }
  return out;
}

/**
 * Merge an extra charge into an existing per-member amount map (e.g. the
 * itemised or manually entered base split). Members absent from `base` are
 * added — an extra charge is shared by everyone on the expense, including
 * someone who happened to order nothing.
 */
export function withExtraCharge(
  base: Record<string, number>,
  amountMinor: number,
  participants: string[],
): Record<string, number> {
  const extra = splitExtraCharge(amountMinor, participants);
  const out: Record<string, number> = { ...base };
  for (const [memberId, minor] of Object.entries(extra)) {
    out[memberId] = (out[memberId] ?? 0) + minor;
  }
  return out;
}
