/**
 * Review-and-confirm validation for the standings import flow. Each row is one
 * counterparty's net balance, read relative to the importing user. A row is
 * valid when:
 *   - its amount parses to a positive minor-unit value, and
 *   - its direction is a known enum member (`owes_you` | `you_owe`).
 * The whole batch is blocked if the extracted currency differs from the group
 * currency (we never silently convert). Rows are sorted low-confidence first so
 * the user inspects the riskiest extractions before importing.
 *
 * Pure; no React, no i18n. Unit-tested by lib/__tests__/import-review.test.ts.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

import { decimalToMinor } from './money-utils';

export type StandingDirection = 'owes_you' | 'you_owe';

export interface ReviewRow {
  /** Stable key for React lists (e.g. extracted index). */
  key: string;
  /** Counterparty name (resolved to a member or placeholder on commit). */
  name: string;
  /** Balance direction relative to the importing user. */
  direction: StandingDirection;
  /** Decimal string, group currency. */
  amount: string;
  /** 0–1 extraction confidence; lower floats to top. */
  confidence: number;
}

export interface ReviewRowValidity {
  key: string;
  amountValid: boolean;
  directionValid: boolean;
  /** Both row-level checks pass. */
  ok: boolean;
}

export interface ReviewState {
  /** Rows sorted low-confidence first (stable for ties). */
  sortedRows: ReviewRow[];
  rowValidity: ReviewRowValidity[];
  /** Group currency !== extracted currency — blocks the whole import. */
  currencyMismatch: boolean;
  /** Sum of valid `owes_you` amounts in minor units (footer total). */
  owedToYouMinor: number;
  /** Sum of valid `you_owe` amounts in minor units (footer total). */
  youOweMinor: number;
  /** Confirm enabled: currency matches, ≥1 row, every row valid. */
  canConfirm: boolean;
}

function isPositiveAmount(amount: string): boolean {
  const s = (amount ?? '').trim();
  if (!s) return false;
  // Reject anything that isn't a plain non-negative decimal.
  if (!/^\d+(\.\d+)?$/.test(s)) return false;
  return decimalToMinor(s) > 0;
}

function isValidDirection(d: unknown): d is StandingDirection {
  return d === 'owes_you' || d === 'you_owe';
}

export function reviewRowValidity(row: ReviewRow): ReviewRowValidity {
  const amountValid = isPositiveAmount(row.amount);
  const directionValid = isValidDirection(row.direction);
  return {
    key: row.key,
    amountValid,
    directionValid,
    ok: amountValid && directionValid,
  };
}

export function reviewState(opts: {
  rows: ReviewRow[];
  groupCurrency: string;
  extractedCurrency: string;
}): ReviewState {
  const { rows, groupCurrency, extractedCurrency } = opts;
  const currencyMismatch =
    !!extractedCurrency &&
    extractedCurrency.toUpperCase() !== groupCurrency.toUpperCase();

  // Stable sort, low confidence first.
  const sortedRows = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.confidence - b.r.confidence || a.i - b.i)
    .map(({ r }) => r);

  const rowValidity = sortedRows.map(reviewRowValidity);

  let owedToYouMinor = 0;
  let youOweMinor = 0;
  for (const r of sortedRows) {
    if (!isPositiveAmount(r.amount)) continue;
    const minor = decimalToMinor(r.amount);
    if (r.direction === 'owes_you') owedToYouMinor += minor;
    else if (r.direction === 'you_owe') youOweMinor += minor;
  }

  const canConfirm =
    !currencyMismatch && rows.length > 0 && rowValidity.every((v) => v.ok);

  return {
    sortedRows,
    rowValidity,
    currencyMismatch,
    owedToYouMinor,
    youOweMinor,
    canConfirm,
  };
}
