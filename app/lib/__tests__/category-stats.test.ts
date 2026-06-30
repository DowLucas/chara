import { aggregateByCategory } from '../category-stats';
import type { Expense } from '../api';

const expense = (category: string, amount: string, currency = 'SEK'): Expense => ({
  id: `e-${category}-${amount}`,
  group_id: 'g1',
  title: 't',
  amount,
  currency,
  paid_by_id: 'm1',
  split_method: 'equal',
  category,
  is_reimbursement: false,
  created_by_id: 'u1',
  created_at: '2026-05-23T00:00:00Z',
  updated_at: '2026-05-23T00:00:00Z',
  splits: [],
});

describe('aggregateByCategory', () => {
  it('returns empty for no expenses', () => {
    expect(aggregateByCategory([])).toEqual([]);
  });

  it('sums amounts within a category in minor units', () => {
    const rows = aggregateByCategory([
      expense('food', '10.00'),
      expense('food', '5.50'),
    ]);
    expect(rows).toEqual([{ category: 'food', totals: [{ currency: 'SEK', minor: 1550 }] }]);
  });

  it('orders categories by total spend descending', () => {
    const rows = aggregateByCategory([
      expense('food', '10.00'),
      expense('transport', '40.00'),
      expense('drinks', '25.00'),
    ]);
    expect(rows.map((r) => r.category)).toEqual(['transport', 'drinks', 'food']);
  });

  it('keeps currencies separate within a category (never summed across)', () => {
    const rows = aggregateByCategory([
      expense('food', '10.00', 'SEK'),
      expense('food', '3.00', 'EUR'),
      expense('food', '2.00', 'SEK'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('food');
    expect(rows[0].totals).toEqual([
      { currency: 'SEK', minor: 1200 },
      { currency: 'EUR', minor: 300 },
    ]);
  });

  it('defaults a missing category to general', () => {
    const rows = aggregateByCategory([{ ...expense('', '9.00'), category: '' }]);
    expect(rows[0].category).toBe('general');
  });
});
