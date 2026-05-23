import { computeStandings, expensesInvolvingMember } from '../standings';
import type { Balance, Expense, GroupMember } from '../api';

const member = (id: string, name: string): GroupMember => ({ id, name });

describe('computeStandings', () => {
  it('returns one row per member, preserving order', () => {
    const members = [member('m1', 'Alice'), member('m2', 'Bob'), member('m3', 'Carol')];
    const rows = computeStandings(members, []);
    expect(rows.map((r) => r.memberId)).toEqual(['m1', 'm2', 'm3']);
  });

  it('marks members with no balance row as settled', () => {
    const rows = computeStandings([member('m1', 'A')], []);
    expect(rows[0]).toMatchObject({ memberId: 'm1', entries: [], isSettled: true });
  });

  it('marks empty-currency balance rows as settled (group with no expenses)', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: '', net_balance: '0' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0]).toMatchObject({ entries: [], isSettled: true });
  });

  it('reports positive net balance as not settled (member is owed)', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: 'SEK', net_balance: '495.82' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0]).toEqual({
      memberId: 'm1',
      entries: [{ currency: 'SEK', netMinor: 49582 }],
      isSettled: false,
    });
  });

  it('reports negative net balance as not settled (member owes)', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: 'SEK', net_balance: '-99.16' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0]).toEqual({
      memberId: 'm1',
      entries: [{ currency: 'SEK', netMinor: -9916 }],
      isSettled: false,
    });
  });

  it('treats zero net balance as settled even when a row exists', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: 'SEK', net_balance: '0' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0]).toEqual({
      memberId: 'm1',
      entries: [{ currency: 'SEK', netMinor: 0 }],
      isSettled: true,
    });
  });

  it('returns multiple entries when a member has balances in multiple currencies', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: 'SEK', net_balance: '100.00' },
      { member_id: 'm1', user_id: 'u1', currency: 'EUR', net_balance: '-12.50' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0].entries).toEqual([
      { currency: 'SEK', netMinor: 10000 },
      { currency: 'EUR', netMinor: -1250 },
    ]);
    expect(rows[0].isSettled).toBe(false);
  });

  it('counts a member as not settled when only some currencies are zero', () => {
    const balances: Balance[] = [
      { member_id: 'm1', user_id: 'u1', currency: 'SEK', net_balance: '0' },
      { member_id: 'm1', user_id: 'u1', currency: 'EUR', net_balance: '5.00' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0].isSettled).toBe(false);
  });

  it('ignores balances for members that are not in the list', () => {
    const balances: Balance[] = [
      { member_id: 'ghost', user_id: 'u9', currency: 'SEK', net_balance: '100.00' },
    ];
    const rows = computeStandings([member('m1', 'A')], balances);
    expect(rows[0].entries).toEqual([]);
  });
});

const expense = (id: string, paidBy: string, splitMembers: string[]): Expense => ({
  id,
  group_id: 'g1',
  title: id,
  amount: '100.00',
  currency: 'SEK',
  paid_by_id: paidBy,
  split_method: 'equal',
  category: 'other',
  is_reimbursement: false,
  created_by_id: paidBy,
  created_at: '2026-05-23T00:00:00Z',
  updated_at: '2026-05-23T00:00:00Z',
  splits: splitMembers.map((memberId, i) => ({
    id: `s${id}-${i}`,
    member_id: memberId,
    share: '50.00',
  })),
});

describe('expensesInvolvingMember', () => {
  it('includes expenses where the member paid', () => {
    const e = expense('e1', 'm1', ['m2', 'm3']);
    expect(expensesInvolvingMember([e], 'm1')).toEqual([e]);
  });

  it('includes expenses where the member is in the split but did not pay', () => {
    const e = expense('e1', 'm1', ['m2', 'm3']);
    expect(expensesInvolvingMember([e], 'm2')).toEqual([e]);
  });

  it('excludes expenses where the member is neither payer nor in the split', () => {
    const e = expense('e1', 'm1', ['m2', 'm3']);
    expect(expensesInvolvingMember([e], 'm4')).toEqual([]);
  });

  it('treats undefined splits as not-involved (member did not pay)', () => {
    const e: Expense = { ...expense('e1', 'm1', []), splits: undefined };
    expect(expensesInvolvingMember([e], 'm2')).toEqual([]);
    expect(expensesInvolvingMember([e], 'm1')).toEqual([e]);
  });

  it('does not duplicate an expense when the payer is also in the split', () => {
    const e = expense('e1', 'm1', ['m1', 'm2']);
    expect(expensesInvolvingMember([e], 'm1')).toEqual([e]);
  });
});
