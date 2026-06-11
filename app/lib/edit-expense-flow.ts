/**
 * Edit-expense flow helpers — pure, no I/O, no React.
 *
 * The host screen (`app/app/expenses/[server]/[id]/edit.tsx`) hands off the
 * "what kind of confirm should we show?" decision to `decideConfirmFlow`,
 * keeping its own body limited to fetching + dispatching.
 *
 * Spec: docs/superpowers/specs/2026-05-23-edit-expense-design.md §"Edit screen"
 * and §"Settlement Impact Sheet" + §8.4 integration tests.
 */

import type { MemberDelta } from './balance-impact';
import type { Expense, UpdateExpenseInput } from './api';
import type {
  ExpenseWizardInitialValue,
  ExpenseWizardSubmitPayload,
} from '../components/ExpenseWizard';
import { normalizeCategory } from './categories';

export type ConfirmFlow =
  | { kind: 'no-changes' }
  | { kind: 'simple'; affectedCount: number }
  | { kind: 'impact-sheet' };

export interface DecideInput {
  nonShareFieldsChanged: boolean;
  deltas: MemberDelta[];
  affectedSettlementsCount: number;
}

/**
 * Decide which confirmation surface to render on Save.
 *
 * Rules per spec §"Edit screen":
 *   • Nothing changed (no field diff, no delta) → no-changes toast, no PATCH.
 *   • Shares changed AND post-expense settlements involve any affected member →
 *     SettlementImpactSheet.
 *   • Otherwise (only metadata edits, or share changes with no settlement
 *     overlap) → simple "Save changes?" confirm with affected count.
 */
export function decideConfirmFlow(input: DecideInput): ConfirmFlow {
  const sharesChanged = input.deltas.length > 0;
  if (!sharesChanged && !input.nonShareFieldsChanged) {
    return { kind: 'no-changes' };
  }
  if (sharesChanged && input.affectedSettlementsCount > 0) {
    return { kind: 'impact-sheet' };
  }
  return { kind: 'simple', affectedCount: input.deltas.length };
}

/** Decision for the delete flow. Delete always reverses balances, so the
 *  only branch is "show impact sheet" vs "show plain confirm (no overlap)". */
export function decideDeleteFlow(input: {
  deltas: MemberDelta[];
  affectedSettlementsCount: number;
}): { kind: 'impact-sheet' } | { kind: 'simple'; affectedCount: number } {
  if (input.affectedSettlementsCount > 0) return { kind: 'impact-sheet' };
  return { kind: 'simple', affectedCount: input.deltas.length };
}

/**
 * Build the per-row labels used by SettlementImpactSheet.
 *
 * The sheet shows "was owed X / now owed Y" (positive net = creditor) or
 * "owed X / now owes Y" (negative net = debtor). When the sign flips we
 * combine the two phrasings.
 *
 * Returns t-keys + interpolation params so callers stay in i18n.
 */
export interface DeltaCopy {
  prevKey: 'impactSheet.wasOwed' | 'impactSheet.wasOwes';
  newKey: 'impactSheet.nowOwed' | 'impactSheet.nowOwes';
  prevAbsMinor: bigint;
  newAbsMinor: bigint;
  /** True when the new net is "better" than the previous one (more credit
   *  or less debt). Used for green/red colour-coding. */
  improved: boolean;
}

export function deltaCopy(delta: MemberDelta): DeltaCopy {
  const prev = delta.prevNetMinor;
  const next = delta.newNetMinor;
  // Positive net = member is owed money (creditor). Negative = debtor.
  const prevKey = prev >= 0n ? 'impactSheet.wasOwed' : 'impactSheet.wasOwes';
  const newKey = next >= 0n ? 'impactSheet.nowOwed' : 'impactSheet.nowOwes';
  const prevAbsMinor = prev < 0n ? -prev : prev;
  const newAbsMinor = next < 0n ? -next : next;
  return { prevKey, newKey, prevAbsMinor, newAbsMinor, improved: next > prev };
}

/**
 * Sort affected members for the sheet — stable alphabetical by display name.
 */
export function sortDeltasForDisplay(deltas: MemberDelta[]): MemberDelta[] {
  return [...deltas].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Truncate the affected-settlements list to `max` rows, returning the visible
 * slice + the count overflow that should render as "+N more".
 */
export function truncateSettlements<T>(
  list: T[],
  max = 5,
): { visible: T[]; overflow: number } {
  if (list.length <= max) return { visible: list, overflow: 0 };
  return { visible: list.slice(0, max), overflow: list.length - max };
}

/**
 * Determine whether the user's non-share field edits diverge from the original
 * expense. Used by `decideConfirmFlow` to distinguish "nothing changed at all"
 * from "metadata-only change."
 *
 * `notes` is compared loosely (empty / null / undefined collapse). Dates are
 * compared by their ISO yyyy-mm-dd string.
 */
export interface NonShareFieldsSnapshot {
  title: string;
  category: string;
  notes: string;
  expense_date: string;
  currency: string;
  /** Decimal string in the form's display format. Compared via
   *  `normalizeAmount` so "100", "100.00", "100,00" all collapse to the
   *  same value. Including amount here is what catches edits to an
   *  expense whose splits don't produce balance deltas — e.g. an expense
   *  paid by the only participant. */
  amount: string;
}

/**
 * Canonicalises a user-entered amount string for equality comparison.
 * "100", "100.00", "100,00", " 100.0 " all collapse to "100.00".
 * Returns the original (lower-cased) string if it can't be parsed, so two
 * unparseable inputs still compare equal when literally identical.
 */
export function normalizeAmount(s: string | undefined | null): string {
  if (s == null) return '';
  const cleaned = s.trim().replace(',', '.');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return cleaned;
  return n.toFixed(2);
}

export function nonShareFieldsDiffer(
  a: NonShareFieldsSnapshot,
  b: NonShareFieldsSnapshot,
): boolean {
  return (
    a.title.trim() !== b.title.trim() ||
    a.category !== b.category ||
    (a.notes ?? '').trim() !== (b.notes ?? '').trim() ||
    a.expense_date !== b.expense_date ||
    a.currency !== b.currency ||
    normalizeAmount(a.amount) !== normalizeAmount(b.amount)
  );
}

/**
 * Returns the amount/currency the user *entered* when the expense was created.
 *
 * For FX-snapshotted expenses (paid in a non-base currency) the bare
 * `amount`/`currency` fields are canonical group-currency values; the
 * `original_amount`/`original_currency` fields are what the user actually
 * typed. Pre-filling the edit form from canonical would silently swap the
 * currency on save — e.g. "€50 in a SEK group" would show "575.00 SEK", and
 * saving without changes would wipe the FX snapshot and lock the expense to
 * SEK forever.
 */
export function expenseInputCurrencyAmount(
  expense: Pick<Expense, 'amount' | 'currency' | 'original_amount' | 'original_currency'>,
): { amount: string; currency: string } {
  if (expense.original_amount && expense.original_currency) {
    return { amount: expense.original_amount, currency: expense.original_currency };
  }
  return { amount: expense.amount, currency: expense.currency };
}

/**
 * Scales a canonical-currency split share into its input-currency equivalent
 * using the expense's stored FX rate.
 *
 * `fx_rate` is "1 original_currency = fx_rate canonical_currency", so
 * `input = canonical / fx_rate`. For non-FX expenses (no fx_rate stored) this
 * is a passthrough.
 */
export function splitShareInInputCurrency(
  canonicalShare: string,
  expense: Pick<Expense, 'fx_rate' | 'original_currency'>,
): string {
  if (!expense.fx_rate || !expense.original_currency) return canonicalShare;
  const rate = parseFloat(expense.fx_rate);
  if (!isFinite(rate) || rate === 0) return canonicalShare;
  return (parseFloat(canonicalShare) / rate).toFixed(2);
}

/**
 * Projects an expense into a view where amount/currency/splits are all in the
 * user's input currency. Used so `computeBalanceImpact` compares like-for-like
 * against new values (which are always in input currency from the form).
 */
export function projectExpenseToInputCurrency(expense: Expense): Expense {
  if (!expense.original_amount || !expense.original_currency) return expense;
  return {
    ...expense,
    amount: expense.original_amount,
    currency: expense.original_currency,
    splits: (expense.splits ?? []).map((s) => ({
      ...s,
      share: splitShareInInputCurrency(s.share, expense),
    })),
  };
}

/**
 * Pre-fills the edit wizard from the original expense. Legacy / unknown
 * categories collapse to 'other' (`normalizeCategory`); missing notes
 * become ''.
 */
export function expenseToInitialValue(expense: Expense): ExpenseWizardInitialValue {
  const { amount, currency } = expenseInputCurrencyAmount(expense);
  const splits = expense.splits ?? [];
  const exactByMember: Record<string, string> = {};
  // The wire only preserves `share`. For percentage-split expenses the
  // backend re-derives shares on save; pre-filling exactByMember from the
  // projected splits matches the old ExpenseForm behaviour.
  for (const s of splits) {
    exactByMember[s.member_id] = splitShareInInputCurrency(s.share, expense);
  }
  const included: Record<string, boolean> = {};
  if (splits.length > 0) {
    for (const s of splits) included[s.member_id] = true;
  }

  const date = expense.expense_date
    ? new Date(expense.expense_date + 'T00:00:00')
    : new Date();

  return {
    title: expense.title,
    amount: parseFloat(amount).toFixed(2),
    currency,
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    paidByMemberId: expense.paid_by_id,
    splitMethod:
      (expense.split_method as 'equal' | 'exact' | 'percentage') || 'equal',
    included: splits.length > 0 ? included : undefined,
    exactByMember,
    pctByMember: {},
    category: normalizeCategory(expense.category),
    notes: expense.notes ?? '',
  };
}

/**
 * Maps the wizard's submit payload to the PATCH body. Category and notes are
 * always included with the wizard's values — `notes: ''` clears them
 * server-side (tri-state: field absent = unchanged, '' = clear).
 */
export function payloadToUpdateInput(
  p: ExpenseWizardSubmitPayload,
): UpdateExpenseInput {
  const base: UpdateExpenseInput = {
    title: p.title,
    amount: p.amount,
    currency: p.currency,
    paid_by_id: p.paid_by_id,
    expense_date: p.expense_date,
    split_method: p.split_method,
    category: p.category,
    notes: p.notes,
    ...(p.fx ?? {}),
  };
  if (p.participants) base.participants = p.participants;
  if (p.splits) base.splits = p.splits;
  return base;
}
