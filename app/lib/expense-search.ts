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

export type FilterMenuEntry =
  | { kind: 'search' }
  | { kind: 'all' }
  | { kind: 'payer'; memberId: string; mine: boolean };

/** The group screen's filter sheet: search first, then who-paid filters.
 *  A one-member group gets search only — filtering by payer is a no-op. */
export function filterMenuEntries(
  members: { id: string }[],
  myMemberId: string | undefined,
): FilterMenuEntry[] {
  if (members.length <= 1) return [{ kind: 'search' }];
  const others = members.filter((m) => m.id !== myMemberId);
  return [
    { kind: 'search' },
    { kind: 'all' },
    ...(myMemberId ? [{ kind: 'payer' as const, memberId: myMemberId, mine: true }] : []),
    ...others.map((m) => ({ kind: 'payer' as const, memberId: m.id, mine: false })),
  ];
}
