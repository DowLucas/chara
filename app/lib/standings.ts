import type { Balance, Expense, GroupMember } from './api';
import { decimalToMinor } from './money-utils';

export type StandingEntry = {
  currency: string;
  netMinor: number;
};

export type StandingRow = {
  memberId: string;
  entries: StandingEntry[];
  isSettled: boolean;
};

export function computeStandings(members: GroupMember[], balances: Balance[]): StandingRow[] {
  const rows = members.map((m) => {
    const entries: StandingEntry[] = [];
    for (const b of balances) {
      if (b.member_id !== m.id) continue;
      if (!b.currency) continue;
      entries.push({ currency: b.currency, netMinor: decimalToMinor(b.net_balance) });
    }
    const isSettled = entries.length === 0 || entries.every((e) => e.netMinor === 0);
    return { memberId: m.id, entries, isSettled };
  });

  // Sort most positive (owed the most) → most negative (owes the most).
  // Cross-currency groups are rare; sum the per-currency nets purely as an
  // ordering key (never shown — display stays per-currency). Stable for ties,
  // so same-net members keep their original member order.
  const netSum = (r: StandingRow) => r.entries.reduce((s, e) => s + e.netMinor, 0);
  return rows.sort((a, b) => netSum(b) - netSum(a));
}

export function expensesInvolvingMember(expenses: Expense[], memberId: string): Expense[] {
  return expenses.filter(
    (e) => e.paid_by_id === memberId || (e.splits?.some((s) => s.member_id === memberId) ?? false),
  );
}
