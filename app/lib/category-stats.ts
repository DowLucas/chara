import type { Expense } from './api';
import { decimalToMinor } from './money-utils';

export interface CategoryTotal {
  category: string;
  /** Per-currency totals in minor units; never summed across currencies. */
  totals: { currency: string; minor: number }[];
}

/**
 * Group expenses by category, totalling per currency. Categories are ordered
 * by overall spend (sum of per-currency minor totals used purely as an
 * ordering key — never displayed). Within a category, currencies are ordered
 * by amount descending.
 */
export function aggregateByCategory(expenses: Expense[]): CategoryTotal[] {
  const byCat = new Map<string, Map<string, number>>();
  for (const e of expenses) {
    const cat = e.category || 'general';
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    const m = byCat.get(cat)!;
    m.set(e.currency, (m.get(e.currency) ?? 0) + decimalToMinor(e.amount));
  }

  const rows: CategoryTotal[] = [];
  for (const [category, m] of byCat) {
    const totals = [...m.entries()].map(([currency, minor]) => ({ currency, minor }));
    totals.sort((a, b) => b.minor - a.minor);
    rows.push({ category, totals });
  }

  const sumMinor = (r: CategoryTotal) => r.totals.reduce((s, t) => s + t.minor, 0);
  return rows.sort((a, b) => sumMinor(b) - sumMinor(a));
}
