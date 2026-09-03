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

/** How many months the 1c strip shows at once. */
const STRIP_MONTHS = 3;

export interface StripMonth {
  period: string;
  /** Three-letter month label, uppercased — 'JUL'. Locale-formatted by the
   *  caller, which has the i18n context this module deliberately lacks. */
  monthIndex: number;
  selected: boolean;
}

/**
 * The three-month strip that replaces the prev/next arrows in 1c.
 *
 * Same bounds the arrows had: never past the current month, never before the
 * first month with any spend. The window slides to keep the selected month
 * visible rather than always centring it, so the ends of the range still
 * show a full strip instead of a stub.
 */
export function monthStrip(period: string, firstPeriod: string, now: Date = new Date()): StripMonth[] {
  if (!period) return [];
  const latest = currentPeriod(now);
  const first = firstPeriod && firstPeriod <= latest ? firstPeriod : period;

  // Start one month back, then pull the window inside the range.
  let start = shiftPeriod(period, -1);
  if (start < first) start = first;
  // If the window would overrun the current month, slide it back.
  let end = shiftPeriod(start, STRIP_MONTHS - 1);
  while (end > latest && start > first) {
    start = shiftPeriod(start, -1);
    end = shiftPeriod(start, STRIP_MONTHS - 1);
  }

  const out: StripMonth[] = [];
  for (let i = 0; i < STRIP_MONTHS; i++) {
    const p = shiftPeriod(start, i);
    if (p > latest) break;
    out.push({ period: p, monthIndex: Number(p.slice(5, 7)) - 1, selected: p === period });
  }
  return out;
}

export interface DayCell {
  /** null for the leading blanks that align the 1st to its weekday. */
  day: number | null;
  active: boolean;
}

/**
 * The active-day grid for 1c: leading blanks so the 1st lands under its
 * weekday, then one cell per day of the month.
 *
 * Monday-first, matching the M T W T F S S header in the design (and every
 * locale Chara ships except en-US, which the app does not target).
 */
export function dayGrid(period: string, activeDates: number[]): DayCell[] {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) return [];
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  // UTC throughout: a local-time Date would shift the 1st across a timezone
  // boundary and rotate the whole grid by a day.
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const jsDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay(); // 0 = Sunday
  const leading = (jsDow + 6) % 7; // Monday-first

  const active = new Set(activeDates);
  const cells: DayCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ day: null, active: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, active: active.has(d) });
  return cells;
}

/**
 * Category bar width, as a percentage of the track.
 *
 * Scaled against the biggest category rather than against 100: the top row
 * always fills the track, so the shape of the month stays readable even when
 * every category is a single-digit share. A non-zero category never rounds
 * away to an invisible bar.
 */
export function barWidthPct(pct: number, topPct: number): number {
  if (topPct <= 0 || pct <= 0) return 0;
  return Math.max(2, Math.round((pct / topPct) * 100));
}
