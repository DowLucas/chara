/**
 * Convert an existing one-off expense into a prefill for the recurring-bill
 * create form. Used by the "Make recurring" action on the expense detail
 * screen (see app/app/expenses/[server]/[id]/index.tsx).
 *
 * Only the identity fields carry over — title, amount, currency, category,
 * payer, and the split (participants + method). Schedule fields (frequency,
 * start date, time, timezone) have no source on a one-off expense and are
 * left to the RecurringForm defaults.
 */

import type { Expense, GroupMember } from '../api';
import type { RecurringPrefill } from '../api-types-recurring';

type Method = RecurringPrefill['split_method'];

function normalizeMethod(m: string): Method {
  return m === 'exact' || m === 'percentage' ? m : 'equal';
}

export function expenseToRecurringPrefill(
  expense: Expense,
  members: GroupMember[],
): RecurringPrefill {
  const amount_minor = Math.round(parseFloat(expense.amount) * 100);
  const rows = expense.splits ?? [];

  // No explicit split rows = the expense was split equally across everyone;
  // seed the recurring rule with all current members.
  if (rows.length === 0) {
    return {
      title: expense.title,
      amount_minor,
      currency: expense.currency,
      category: expense.category,
      paid_by_id: expense.paid_by_id,
      split_method: 'equal',
      // Equal splits carry value 0 — the backend recomputes the per-member
      // minor units and rejects any non-zero value (recurring.go).
      splits: members.map((m) => ({ member_id: m.id, value: 0 })),
    };
  }

  const method = normalizeMethod(expense.split_method);
  const splits = rows.map((s) => {
    const shareMinor = Math.round(parseFloat(s.share) * 100);
    let value: number;
    if (method === 'exact') {
      value = shareMinor;
    } else if (method === 'percentage') {
      // Reconstruct basis points from the resolved share (the expense API
      // returns amounts, not the original percentages).
      value = amount_minor > 0 ? Math.round((shareMinor / amount_minor) * 10000) : 0;
    } else {
      // equal — the backend recomputes shares and requires value 0.
      value = 0;
    }
    return { member_id: s.member_id, value };
  });

  return {
    title: expense.title,
    amount_minor,
    currency: expense.currency,
    category: expense.category,
    paid_by_id: expense.paid_by_id,
    split_method: method,
    splits,
  };
}
