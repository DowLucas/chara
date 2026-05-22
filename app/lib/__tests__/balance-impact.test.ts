import { computeBalanceImpact } from '../balance-impact';
import type { Expense, ExpenseSplit, GroupMember, Settlement } from '../api';

// ---------- fixture helpers ----------
//
// We work end-to-end in minor units. The wire format on `Expense.amount` /
// `ExpenseSplit.share` is a decimal string with two fraction digits. The
// helpers below convert minor-unit numbers ↔ that wire format.

function minorToDecimalString(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function expense(over: Partial<Expense> & { amountMinor?: number } = {}): Expense {
  const { amountMinor, ...rest } = over;
  return {
    id: 'exp-1',
    group_id: 'grp-1',
    title: 'Pizza',
    amount: amountMinor !== undefined ? minorToDecimalString(amountMinor) : '100.00',
    currency: 'SEK',
    paid_by_id: 'a',
    split_method: 'equal',
    category: 'food',
    is_reimbursement: false,
    created_by_id: 'a',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...rest,
  };
}

/** Build an ExpenseSplit from a minor-unit share. */
function split(memberId: string, shareMinor: number, id = `s-${memberId}`): ExpenseSplit {
  return { id, member_id: memberId, share: minorToDecimalString(shareMinor) };
}

function member(id: string, name: string): GroupMember {
  return { id, name };
}

function settlement(over: Partial<Settlement> = {}): Settlement {
  return {
    id: 's-1',
    group_id: 'grp-1',
    from_member_id: 'a',
    to_member_id: 'b',
    amount: '10.00',
    currency: 'SEK',
    created_at: '2026-02-01T00:00:00Z',
    ...over,
  };
}

// ---------- tests ----------

describe('computeBalanceImpact', () => {
  it('equal split: amount goes up — non-payer share increases, payer net improves', () => {
    // before: 100 SEK = 10000 minor; split a/b/c → 3334/3333/3333 (a is lex first)
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [
      split('a', 3334),
      split('b', 3333),
      split('c', 3333),
    ];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 200_00n, // 200.00 = 20000 minor
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b', 'c'],
      members,
      settlements: [],
    });
    expect(result.newCurrency).toBe('SEK');
    // Pre nets:
    //   a paid 10000, share 3334 → net +6666
    //   b paid 0,     share 3333 → net -3333
    //   c paid 0,     share 3333 → net -3333
    // New equal of 20000 / 3 → a=6667, b=6667, c=6666 (remainder 2 to first two)
    //   a paid 20000, share 6667 → net +13333. delta +6667.
    //   b share 6667 → net -6667. delta -3334.
    //   c share 6666 → net -6666. delta -3333.
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    expect(byMember['a'].prevNetMinor).toBe(6666n);
    expect(byMember['a'].newNetMinor).toBe(13333n);
    expect(byMember['a'].deltaMinor).toBe(6667n);
    expect(byMember['b'].deltaMinor).toBe(-3334n);
    expect(byMember['c'].deltaMinor).toBe(-3333n);
  });

  it('equal split: amount goes down — mirror', () => {
    const exp = expense({ amountMinor: 200_00, paid_by_id: 'a' });
    // 20000 / 3 → a=6667, b=6667, c=6666
    const currentSplits = [
      split('a', 6667),
      split('b', 6667),
      split('c', 6666),
    ];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b', 'c'],
      members,
      settlements: [],
    });
    // Pre a: paid 20000, share 6667 → net +13333.
    // New a: paid 10000, share 3334 → net +6666. delta -6667.
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    expect(byMember['a'].deltaMinor).toBe(-6667n);
    expect(byMember['b'].deltaMinor).toBeGreaterThan(0n);
    expect(byMember['c'].deltaMinor).toBeGreaterThan(0n);
  });

  it('switch split method equal → exact: only deltas show, unchanged members omitted', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    // current equal split of 10000 across a/b/c: 3334/3333/3333
    const currentSplits = [
      split('a', 3334),
      split('b', 3333),
      split('c', 3333),
    ];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'a',
      newSplitMethod: 'exact',
      newParticipants: ['a', 'b', 'c'],
      newSplits: [
        { memberId: 'a', amountMinor: 3334n }, // unchanged from current
        { memberId: 'b', amountMinor: 5000n }, // bigger
        { memberId: 'c', amountMinor: 1666n }, // smaller; sums to 10000
      ],
      members,
      settlements: [],
    });
    const ids = result.deltas.map((d) => d.memberId).sort();
    expect(ids).toEqual(['b', 'c']);
  });

  it('add a participant who was not on the original split — prev net 0, new net negative', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b', 'c'],
      members,
      settlements: [],
    });
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    expect(byMember['c'].prevNetMinor).toBe(0n);
    expect(byMember['c'].newNetMinor).toBeLessThan(0n);
  });

  it('remove a participant — prev net was a debt, new net is 0, positive delta', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 3334), split('b', 3333), split('c', 3333)];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements: [],
    });
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    expect(byMember['c'].prevNetMinor).toBe(-3333n);
    expect(byMember['c'].newNetMinor).toBe(0n);
    expect(byMember['c'].deltaMinor).toBe(3333n);
  });

  it('change payer — old payer drops by (total - their share); new payer rises', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'b',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements: [],
    });
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    // a: was paid 10000, share 5000 → +5000. Now paid 0, share 5000 → -5000. delta -10000.
    expect(byMember['a'].prevNetMinor).toBe(5000n);
    expect(byMember['a'].newNetMinor).toBe(-5000n);
    expect(byMember['a'].deltaMinor).toBe(-10000n);
    // b: was -5000, now +5000. delta +10000.
    expect(byMember['b'].deltaMinor).toBe(10000n);
  });

  it('rounding edge: equal split 99 → 100 cents across 3 leaves no member unchanged', () => {
    // 99 cents / 3 = a=33, b=33, c=33 (no remainder).
    // 100 cents / 3 = a=34, b=33, c=33 (remainder 1 to first sorted).
    const exp = expense({ amountMinor: 99, paid_by_id: 'a' });
    const currentSplits = [split('a', 33), split('b', 33), split('c', 33)];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b', 'c'],
      members,
      settlements: [],
    });
    // a: prev paid 99 share 33 net +66. new paid 100 share 34 net +66. unchanged.
    // b: prev -33, new -33, unchanged.
    // c: prev -33, new -33, unchanged.
    expect(result.deltas).toEqual([]);
  });

  it('settlements do not affect delta calculation (deltas are share-based only)', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob')];
    const settlements: Settlement[] = [
      settlement({ id: 's-1', from_member_id: 'b', to_member_id: 'a', amount: '50.00' }),
    ];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 200_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements,
    });
    // Pre a: paid 10000, share 5000 → +5000.
    // New a: paid 20000, share 10000 → +10000. delta +5000.
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    expect(byMember['a'].deltaMinor).toBe(5000n);
    expect(byMember['b'].deltaMinor).toBe(-5000n);
  });

  it('returns affected settlements: post-expense, same currency, involving a changed member, not reverted', () => {
    const exp = expense({
      amountMinor: 100_00,
      paid_by_id: 'a',
      created_at: '2026-01-01T00:00:00Z',
    });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')];
    const settlements: Settlement[] = [
      // included: post-expense, SEK, involves b who has a delta
      settlement({
        id: 's-included',
        from_member_id: 'b',
        to_member_id: 'a',
        amount: '50.00',
        currency: 'SEK',
        created_at: '2026-02-01T00:00:00Z',
      }),
      // excluded: pre-expense
      settlement({
        id: 's-pre',
        created_at: '2025-12-01T00:00:00Z',
      }),
      // excluded: reverted
      settlement({
        id: 's-reverted',
        created_at: '2026-02-02T00:00:00Z',
        reverted_at: '2026-02-03T00:00:00Z',
      }),
      // excluded: different currency
      settlement({
        id: 's-eur',
        created_at: '2026-02-02T00:00:00Z',
        currency: 'EUR',
      }),
      // excluded: not involving any changed member
      settlement({
        id: 's-noinvolve',
        from_member_id: 'c',
        to_member_id: 'd',
        created_at: '2026-02-02T00:00:00Z',
      }),
    ];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 200_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements,
    });
    expect(result.affectedSettlements.map((s) => s.id)).toEqual(['s-included']);
  });

  it('stable-sorts deltas by display name (ties broken by member id)', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'p' });
    const currentSplits = [
      split('p', 2500),
      split('z', 2500),
      split('y', 2500),
      split('x', 2500),
    ];
    const members = [
      member('p', 'Payer'),
      member('z', 'Alice'),
      member('y', 'Bob'),
      member('x', 'Carol'),
    ];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 200_00n,
      newPayerId: 'p',
      newSplitMethod: 'equal',
      newParticipants: ['p', 'z', 'y', 'x'],
      members,
      settlements: [],
    });
    const names = result.deltas.map((d) => d.displayName);
    expect(names).toEqual(['Alice', 'Bob', 'Carol', 'Payer']);
  });

  it('cross-currency edit: impact reported in new currency only', () => {
    const exp = expense({ amountMinor: 100_00, currency: 'SEK', paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob')];
    const settlements: Settlement[] = [
      settlement({ currency: 'SEK', created_at: '2026-02-01T00:00:00Z' }),
    ];
    const result = computeBalanceImpact({
      expense: { ...exp, currency: 'EUR' }, // new currency
      currentSplits,
      newAmountMinor: 200_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements,
    });
    expect(result.newCurrency).toBe('EUR');
    // SEK settlement is excluded because filter requires currency match
    expect(result.affectedSettlements).toEqual([]);
  });

  it('delete mode (amount=0, no participants): all current shares zeroed', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 0n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: [],
      members,
      settlements: [],
    });
    const byMember = Object.fromEntries(result.deltas.map((d) => [d.memberId, d]));
    // a: was paid 10000, share 5000 → +5000; now 0. delta -5000.
    expect(byMember['a'].newNetMinor).toBe(0n);
    expect(byMember['a'].deltaMinor).toBe(-5000n);
    // b: was -5000, now 0. delta +5000.
    expect(byMember['b'].newNetMinor).toBe(0n);
    expect(byMember['b'].deltaMinor).toBe(5000n);
  });

  it('returns empty deltas when nothing changes (no-op edit)', () => {
    const exp = expense({ amountMinor: 100_00, paid_by_id: 'a' });
    const currentSplits = [split('a', 5000), split('b', 5000)];
    const members = [member('a', 'Alice'), member('b', 'Bob')];
    const result = computeBalanceImpact({
      expense: exp,
      currentSplits,
      newAmountMinor: 100_00n,
      newPayerId: 'a',
      newSplitMethod: 'equal',
      newParticipants: ['a', 'b'],
      members,
      settlements: [],
    });
    expect(result.deltas).toEqual([]);
  });
});
