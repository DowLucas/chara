/**
 * Debt-age helper for the home screen's "owed for N days" chip.
 *
 * Works off the per-currency `MyBalance` rows for a single group: the user
 * is "in debt" when any row's net_balance is negative (negative = you owe —
 * same sign convention the home/standings UI renders with).
 */

import { decimalToMinor } from './money-utils';

import type { MyBalance } from './api';

/** Minimum debt age (whole days) before the chip shows. Mirrors the
 *  server-side default. */
export const DEBT_AGE_THRESHOLD_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days the user has been in debt in this group, or null when the chip
 * should not render: no debtor row in any currency, no usable timestamp on
 * any debtor row, or the debt is younger than the threshold.
 *
 * Multi-currency groups: the oldest debtor row wins — the chip reports how
 * long the user has owed *anything* in the group.
 */
export function debtAgeDays(balances: MyBalance[], now: Date): number | null {
  let oldest: number | null = null;
  for (const b of balances) {
    if (decimalToMinor(b.net_balance) >= 0) continue; // creditor or settled row
    if (!b.last_balance_change_at) continue;
    const t = new Date(b.last_balance_change_at).getTime();
    if (Number.isNaN(t)) continue;
    if (oldest === null || t < oldest) oldest = t;
  }
  if (oldest === null) return null;
  const days = Math.floor((now.getTime() - oldest) / MS_PER_DAY);
  return days >= DEBT_AGE_THRESHOLD_DAYS ? days : null;
}
