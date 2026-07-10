import { expenseToRecurringPrefill } from '../from-expense';
import type { Expense, GroupMember } from '../../api';

function member(id: string, name: string): GroupMember {
  return { id, name } as GroupMember;
}

const members = [member('m1', 'Ada'), member('m2', 'Bea'), member('m3', 'Cy')];

function baseExpense(over: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    group_id: 'g1',
    title: 'Netflix',
    amount: '120.00',
    currency: 'SEK',
    paid_by_id: 'm1',
    split_method: 'equal',
    category: 'entertainment',
    is_reimbursement: false,
    created_by_id: 'm1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Expense;
}

describe('expenseToRecurringPrefill', () => {
  it('carries scalar fields and converts amount to minor units', () => {
    const p = expenseToRecurringPrefill(baseExpense(), members);
    expect(p.title).toBe('Netflix');
    expect(p.amount_minor).toBe(12000);
    expect(p.currency).toBe('SEK');
    expect(p.category).toBe('entertainment');
    expect(p.paid_by_id).toBe('m1');
  });

  it('equal split with explicit rows keeps those members (value placeholder)', () => {
    const p = expenseToRecurringPrefill(
      baseExpense({
        split_method: 'equal',
        splits: [
          { id: 's1', member_id: 'm1', share: '60.00' },
          { id: 's2', member_id: 'm2', share: '60.00' },
        ],
      }),
      members,
    );
    expect(p.split_method).toBe('equal');
    expect(p.splits.map((s) => s.member_id)).toEqual(['m1', 'm2']);
  });

  it('empty splits falls back to equal across all current members', () => {
    const p = expenseToRecurringPrefill(baseExpense({ splits: [] }), members);
    expect(p.split_method).toBe('equal');
    expect(p.splits.map((s) => s.member_id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('exact split converts each share to minor units', () => {
    const p = expenseToRecurringPrefill(
      baseExpense({
        amount: '100.00',
        split_method: 'exact',
        splits: [
          { id: 's1', member_id: 'm1', share: '70.00' },
          { id: 's2', member_id: 'm2', share: '30.00' },
        ],
      }),
      members,
    );
    expect(p.split_method).toBe('exact');
    expect(p.splits).toEqual([
      { member_id: 'm1', value: 7000 },
      { member_id: 'm2', value: 3000 },
    ]);
  });

  it('percentage split reconstructs basis points from share / amount', () => {
    const p = expenseToRecurringPrefill(
      baseExpense({
        amount: '200.00',
        split_method: 'percentage',
        splits: [
          { id: 's1', member_id: 'm1', share: '120.00' }, // 60%
          { id: 's2', member_id: 'm2', share: '80.00' }, // 40%
        ],
      }),
      members,
    );
    expect(p.split_method).toBe('percentage');
    expect(p.splits).toEqual([
      { member_id: 'm1', value: 6000 },
      { member_id: 'm2', value: 4000 },
    ]);
  });

  it('unknown split method degrades to equal', () => {
    const p = expenseToRecurringPrefill(
      baseExpense({ split_method: 'shares' as unknown as string, splits: [] }),
      members,
    );
    expect(p.split_method).toBe('equal');
  });
});
