import { DEBT_AGE_THRESHOLD_DAYS, debtAgeDays } from '../balance-age';

import type { MyBalance } from '../api';

const NOW = new Date('2026-06-09T12:00:00Z');

function row(overrides: Partial<MyBalance>): MyBalance {
  return {
    group_id: 'g1',
    group_name: 'Trip',
    currency: 'SEK',
    net_balance: '-50.00',
    last_balance_change_at: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('debtAgeDays', () => {
  it('exports a 7-day threshold (mirrors the server default)', () => {
    expect(DEBT_AGE_THRESHOLD_DAYS).toBe(7);
  });

  it('returns whole days for a debtor older than the threshold', () => {
    expect(debtAgeDays([row({ last_balance_change_at: daysAgo(9) })], NOW)).toBe(9);
  });

  it('returns the day count at exactly the threshold', () => {
    expect(debtAgeDays([row({ last_balance_change_at: daysAgo(7) })], NOW)).toBe(7);
  });

  it('returns null for a debtor newer than the threshold', () => {
    expect(debtAgeDays([row({ last_balance_change_at: daysAgo(3) })], NOW)).toBeNull();
  });

  it('returns null for a creditor', () => {
    expect(
      debtAgeDays([row({ net_balance: '50.00', last_balance_change_at: daysAgo(30) })], NOW),
    ).toBeNull();
  });

  it('returns null for a zero balance', () => {
    expect(
      debtAgeDays([row({ net_balance: '0.00', last_balance_change_at: daysAgo(30) })], NOW),
    ).toBeNull();
  });

  it('returns null when the timestamp is missing', () => {
    expect(debtAgeDays([row({ last_balance_change_at: null })], NOW)).toBeNull();
    expect(debtAgeDays([row({ last_balance_change_at: undefined })], NOW)).toBeNull();
  });

  it('returns null on an empty list', () => {
    expect(debtAgeDays([], NOW)).toBeNull();
  });

  it('picks the oldest debtor row across currencies', () => {
    const balances = [
      row({ currency: 'SEK', net_balance: '-10.00', last_balance_change_at: daysAgo(9) }),
      row({ currency: 'EUR', net_balance: '-5.00', last_balance_change_at: daysAgo(21) }),
    ];
    expect(debtAgeDays(balances, NOW)).toBe(21);
  });

  it('ignores creditor rows when picking the oldest debtor row', () => {
    const balances = [
      row({ currency: 'SEK', net_balance: '100.00', last_balance_change_at: daysAgo(40) }),
      row({ currency: 'EUR', net_balance: '-5.00', last_balance_change_at: daysAgo(12) }),
    ];
    expect(debtAgeDays(balances, NOW)).toBe(12);
  });
});
