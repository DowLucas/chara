/**
 * TypeScript port of `backend/internal/split/split.go`.
 *
 * IMPORTANT: This file must produce byte-identical output to the Go engine
 * for the same inputs. See `__tests__/split-fixture.test.ts` for the
 * cross-engine parity check.
 *
 * All amounts are int64 minor units, represented here as `bigint`.
 */

/** A computed share for one member, in minor units. */
export type Share = { memberId: string; amountMinor: bigint };

/** Input for the `exact` split method: each member's explicit share. */
export type ExactShareInput = { memberId: string; amountMinor: bigint };

/** Input for the `percentage` split method: each member's percentage (0–100). */
export type PercentageShareInput = { memberId: string; percentage: number };

/** Generic shape accepted by `computeSplits`. */
export type SplitShareInput = {
  memberId: string;
  amountMinor?: bigint;
  percentage?: number;
};

/**
 * Splits `total` evenly across `memberIds`. Remainder pennies are distributed
 * to members in ascending lexicographic order of their ID, matching the Go
 * implementation (`split.Equal` + `money.Amount.SplitEqual`).
 *
 * Output is sorted by memberId ascending.
 */
export function equalSplit(total: bigint, memberIds: string[]): Share[] {
  if (memberIds.length === 0) {
    throw new Error('split: memberIDs must not be empty');
  }
  const sorted = [...memberIds].sort();
  const n = BigInt(sorted.length);
  const base = total / n;
  // Remainder is positive when total > 0; for negative totals the Go behaviour
  // is dictated by Go's integer division truncating toward zero, which matches
  // JS BigInt division. The remainder may be negative for negative totals;
  // distribute its absolute count of pennies. But the Go code uses `int(a%n)`
  // and a loop `if i < remainder`, which silently skips when remainder<0 — to
  // stay byte-identical, mirror that semantics: only positive remainder buckets
  // get +1.
  const remainderBig = total - base * n;
  const remainder = Number(remainderBig); // small int, safe
  return sorted.map((id, i) => ({
    memberId: id,
    amountMinor: i < remainder ? base + 1n : base,
  }));
}

/**
 * Validates and returns caller-supplied shares unchanged (preserving input
 * order). Throws if any share is negative or the shares do not sum to `total`.
 * Matches `split.Exact`.
 */
export function exactSplit(total: bigint, shares: ExactShareInput[]): Share[] {
  let sum = 0n;
  for (const s of shares) {
    if (s.amountMinor < 0n) {
      throw new Error(`split: negative share for member "${s.memberId}"`);
    }
    sum += s.amountMinor;
  }
  if (sum !== total) {
    throw new Error(`split: shares sum to ${sum}, expected ${total}`);
  }
  return shares.map((s) => ({ memberId: s.memberId, amountMinor: s.amountMinor }));
}

/** Internal: percentage split keyed by basis points (10000 == 100%). */
type BasisPointShare = { memberId: string; basisPoints: number };

/**
 * Splits `total` according to basis points (10000 == 100%). Throws if basis
 * points do not sum to 10000 or the slice is empty. Remainder pennies go to
 * members with the largest fractional remainders. Matches `split.Percentage`.
 *
 * Note: input order is preserved (Go behaviour — `split.Percentage` does not
 * sort).
 */
export function percentageSplit(total: bigint, pcts: BasisPointShare[]): Share[] {
  if (pcts.length === 0) {
    throw new Error('split: pcts must not be empty');
  }
  let bpSum = 0;
  for (const p of pcts) {
    bpSum += p.basisPoints;
  }
  if (bpSum !== 10000) {
    throw new Error(`split: basis points sum to ${bpSum}, must be 10000`);
  }

  const result: Share[] = new Array(pcts.length);
  let assigned = 0n;
  const tenThousand = 10000n;
  for (let i = 0; i < pcts.length; i++) {
    const bp = BigInt(pcts[i].basisPoints);
    const share = (total * bp) / tenThousand; // truncation toward zero, matches Go
    result[i] = { memberId: pcts[i].memberId, amountMinor: share };
    assigned += share;
  }

  const remainder = Number(total - assigned);
  if (remainder > 0) {
    // Compute fractional remainders: total*bp % 10000 (Go uses int64, here bigint→number safe)
    const fracs = pcts.map((p, i) => ({
      i,
      frac: Number((total * BigInt(p.basisPoints)) % tenThousand),
    }));
    // Stable sort by frac descending. The Go implementation uses sort.Slice
    // which is NOT stable; to remain byte-identical for the same inputs we
    // mirror "sort by frac descending; ties keep original input order"
    // (which happens to be what most ties resolve to in practice with Go's
    // pdqsort on small slices, but the test fixture is the contract).
    fracs.sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let i = 0; i < remainder; i++) {
      result[fracs[i].i].amountMinor += 1n;
    }
  }

  return result;
}

/**
 * High-level split entry point used by the edit-expense screen. Routes to the
 * appropriate engine based on `method`.
 *
 * - `equal`: ignores `splits`; splits `amountMinor` across `participants`.
 * - `exact`: requires `splits[i].amountMinor` for every participant.
 * - `percentage`: requires `splits[i].percentage` for every participant
 *   (percentages are converted to basis points by multiplying by 100 and
 *   rounding to nearest).
 */
export function computeSplits(
  amountMinor: bigint,
  method: 'equal' | 'exact' | 'percentage',
  participants: string[],
  splits?: SplitShareInput[],
): Share[] {
  switch (method) {
    case 'equal':
      return equalSplit(amountMinor, participants);

    case 'exact': {
      if (!splits || splits.length === 0) {
        throw new Error('split: exact method requires splits');
      }
      const exact: ExactShareInput[] = splits.map((s) => {
        if (s.amountMinor === undefined) {
          throw new Error(`split: exact share for "${s.memberId}" is missing amountMinor`);
        }
        return { memberId: s.memberId, amountMinor: s.amountMinor };
      });
      return exactSplit(amountMinor, exact);
    }

    case 'percentage': {
      if (!splits || splits.length === 0) {
        throw new Error('split: percentage method requires splits');
      }
      const bps: BasisPointShare[] = splits.map((s) => {
        if (s.percentage === undefined) {
          throw new Error(`split: percentage share for "${s.memberId}" is missing percentage`);
        }
        // Convert percentage (0–100, possibly fractional) → basis points (0–10000).
        // Round to nearest to mirror UI behaviour; the validator below catches drift.
        const bp = Math.round(s.percentage * 100);
        return { memberId: s.memberId, basisPoints: bp };
      });
      return percentageSplit(amountMinor, bps);
    }

    default:
      throw new Error(`split: unknown method "${method}"`);
  }
}
