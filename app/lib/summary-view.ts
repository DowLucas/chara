/**
 * Pure helpers behind the monthly summary screen.
 *
 * This repo has no component-render testing, so the convention is that the
 * logic lives in a `lib/` module unit-tested directly and the screen stays a
 * thin dispatcher. Everything here is a plain function over the wire shapes
 * in `api.ts` — no React, no i18n, no clock unless it is passed in.
 */

/** Shift a 'YYYY-MM' period by whole months. */
export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map((p) => parseInt(p, 10));
  // Date handles the year rollover; month is 0-based going in and out.
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Whether an earlier month is worth offering. `firstPeriod` is the earliest
 * month the user has any spend in; below it every month is empty, so paging
 * further is paging into nothing.
 */
export function canGoPrevious(period: string, firstPeriod: string): boolean {
  if (!firstPeriod) return false;
  return period > firstPeriod; // 'YYYY-MM' sorts lexicographically.
}

/**
 * Whether a later month exists yet. The endpoint 400s on a future period,
 * so the affordance must stop at the current one.
 */
export function canGoNext(period: string, now: Date = new Date()): boolean {
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return period < current;
}

/** True when at least one leg had no exchange rate and was therefore
 *  EXCLUDED from the converted totals — not converted at a substitute rate.
 *  The distinction matters: the headline is understated, not imprecise, so
 *  the copy says "couldn't be included" (matching home.homeNetSheetEstimated,
 *  which reports the identical backend semantics). */
export function hasExcludedLegs(converted: { estimated_legs: number }): boolean {
  return converted.estimated_legs > 0;
}

/**
 * The sign of a net balance, as a colour/direction decision.
 *
 * Zero is its own case on purpose: painting "0.00" as either owed or owing
 * puts a signal colour on a value that carries no direction.
 */
export function netDirection(net: string): 'owed' | 'owe' | 'even' {
  const n = parseFloat(net);
  if (!Number.isFinite(n) || n === 0) return 'even';
  return n > 0 ? 'owed' : 'owe';
}

/**
 * Percent change in this month's share against last month's, rounded to a
 * whole percent. Null when there is no comparison to make — a first month,
 * or a previous month of zero, where the change is infinite rather than
 * large.
 */
export function changeVsPrevious(share: string, previousShare: string | null): number | null {
  if (previousShare === null) return null;
  const now = parseFloat(share);
  const before = parseFloat(previousShare);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Whether the month has anything to show, or wants the empty state. */
export function hasContent(summary: { counts: { expenses: number } }): boolean {
  return summary.counts.expenses > 0;
}

/** The calendar month a date falls in, as a 'YYYY-MM' period. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Which linked account, if any, has a monthly summary to show.
 *
 * The feature is hosted-only, so at most one account normally qualifies.
 * Gating on the server's advertised feature rather than on "is this the
 * hosted URL" means a self-hoster who later enables it is picked up for
 * free, and a backend predating the feature (flag absent) reads as
 * unsupported rather than being offered a screen that 404s.
 *
 * Feed this LIVE instance data — see `summary-server.ts`, which is the only
 * caller. Passing the accounts array straight from `useAccounts()` looks
 * like it works and does not: `account.instance` is written only at
 * sign-in, so anyone already signed in when the feature shipped has a
 * snapshot with no `monthly_summary` key and would never see the entry
 * point.
 */
export function summaryServerUrl(
  accounts: { serverUrl: string; instance?: { features?: { monthly_summary?: boolean } } | null }[],
): string | null {
  return accounts.find((a) => a.instance?.features?.monthly_summary === true)?.serverUrl ?? null;
}
