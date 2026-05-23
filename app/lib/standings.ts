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
  return members.map((m) => {
    const entries: StandingEntry[] = [];
    for (const b of balances) {
      if (b.member_id !== m.id) continue;
      if (!b.currency) continue;
      entries.push({ currency: b.currency, netMinor: decimalToMinor(b.net_balance) });
    }
    const isSettled = entries.length === 0 || entries.every((e) => e.netMinor === 0);
    return { memberId: m.id, entries, isSettled };
  });
}

export function expensesInvolvingMember(expenses: Expense[], memberId: string): Expense[] {
  return expenses.filter(
    (e) => e.paid_by_id === memberId || (e.splits?.some((s) => s.member_id === memberId) ?? false),
  );
}
