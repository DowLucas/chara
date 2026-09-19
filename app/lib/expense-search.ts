import type { Expense } from './api';

// Case- and diacritic-insensitive: "cafe" finds "Café", "ake" finds "Åke".
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** True when every whitespace-separated token of `query` appears in the
 *  expense title, notes, or payer name. An empty query matches everything. */
export function matchesExpenseQuery(
  expense: Pick<Expense, 'title' | 'notes'>,
  payerName: string | undefined,
  query: string,
): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = normalize([expense.title, expense.notes, payerName].filter(Boolean).join('\n'));
  return tokens.every((token) => haystack.includes(token));
}
