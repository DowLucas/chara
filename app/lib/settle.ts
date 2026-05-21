// Mirror of backend/internal/settle/suggest.go — greedy max-creditor /
// max-debtor matching, per currency. ≤ N-1 transfers per currency. The
// algorithm runs on the client so the standings tab stays responsive and
// keeps working if the new /settle-suggestions endpoint isn't reachable.

import type { Balance, SettlementSuggestion } from './api';
import { decimalToMinor } from './i18n';

interface Entry {
  memberId: string;
  amount: number; // minor units, positive
}

export function computeSuggestions(balances: Balance[]): SettlementSuggestion[] {
  const byCurrency = new Map<string, Balance[]>();
  for (const b of balances) {
    const list = byCurrency.get(b.currency) ?? [];
    list.push(b);
    byCurrency.set(b.currency, list);
  }

  const currencies = [...byCurrency.keys()].sort();
  const out: SettlementSuggestion[] = [];
  for (const currency of currencies) {
    out.push(...suggestOne(currency, byCurrency.get(currency)!));
  }
  return out;
}

function suggestOne(currency: string, balances: Balance[]): SettlementSuggestion[] {
  const creditors: Entry[] = [];
  const debtors: Entry[] = [];
  for (const b of balances) {
    const amount = decimalToMinor(b.net_balance);
    if (amount > 0) creditors.push({ memberId: b.member_id, amount });
    else if (amount < 0) debtors.push({ memberId: b.member_id, amount: -amount });
  }
  // Tiebreak by member id for determinism, then sort descending.
  const sortDesc = (a: Entry, b: Entry) => b.amount - a.amount || a.memberId.localeCompare(b.memberId);
  creditors.sort(sortDesc);
  debtors.sort(sortDesc);

  const transfers: SettlementSuggestion[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.amount, d.amount);
    transfers.push({
      from_member_id: d.memberId,
      to_member_id: c.memberId,
      amount: minorToDecimal(amount),
      currency,
    });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    else creditors.sort(sortDesc);
    if (d.amount === 0) debtors.shift();
    else debtors.sort(sortDesc);
  }
  return transfers;
}

function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
