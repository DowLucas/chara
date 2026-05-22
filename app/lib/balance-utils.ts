/**
 * Pure helpers for reasoning about net balances coming back from
 * `/api/me/balances`.
 *
 * The server returns net balances as decimal strings ("0", "0.00",
 * "-3.25", "12.50") — we never coerce these to floats elsewhere in the
 * app to avoid precision loss, so the "is zero?" check is string-based.
 */

export interface MinimalBalance {
  /** Decimal string, e.g. "0", "0.00", "-3.25", "12.50". */
  net_balance: string;
}

/**
 * Returns true iff the input represents a non-zero amount.
 *
 * Tolerates whitespace, leading sign, trailing dot, and any number of
 * zeros / fractional zeros ("0", "+0", "-0.00", " 0 " → all zero).
 * Anything that doesn't parse as a number is also treated as non-zero
 * (better to block a removal than swallow garbage).
 */
export function isNonZeroDecimal(value: string): boolean {
  if (typeof value !== 'string') return true;
  const s = value.trim();
  if (s.length === 0) return false;
  // Strip a leading sign.
  const unsigned = s.replace(/^[+-]/, '');
  // Must look like a decimal: digits, optional dot, more digits.
  if (!/^\d+(\.\d+)?$|^\.\d+$|^\d+\.$/.test(unsigned)) return true;
  // Any non-zero digit anywhere → non-zero.
  return /[1-9]/.test(unsigned);
}

/** True iff any entry in `balances` has a non-zero `net_balance`. */
export function hasOpenBalance(balances: MinimalBalance[]): boolean {
  return balances.some((b) => isNonZeroDecimal(b.net_balance));
}
