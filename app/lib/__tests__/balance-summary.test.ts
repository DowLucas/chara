/**
 * Characterization tests for the balance aggregation extracted out of
 * `app/(tabs)/index.tsx`. These were written against the *existing* inline
 * behaviour before the extraction, so a green run proves the refactor is
 * behaviour-preserving — and the widget snapshot builder, which consumes the
 * same functions, cannot drift from the home screen.
 */

import type { Group, MyBalance } from '../api';
import {
  groupPosition,
  mergeGroupsWithBalances,
  netByCurrency,
  type MergedGroup,
} from '../balance-summary';

function group(id: string, over: Partial<Group> = {}): Group {
  return {
    id,
    name: `Group ${id}`,
    currency: 'SEK',
    language: 'en',
    invite_token: `tok-${id}`,
    created_at: '2026-01-01T00:00:00Z',
    is_locked: false,
    is_archived: false,
    ...over,
  } as Group;
}

function bal(groupId: string, currency: string, net: string): MyBalance {
  return {
    group_id: groupId,
    group_name: `Group ${groupId}`,
    currency,
    net_balance: net,
  } as MyBalance;
}

describe('netByCurrency', () => {
  it('returns nothing for empty reads', () => {
    expect(netByCurrency([])).toEqual([]);
  });

  it('skips reads that have not resolved', () => {
    expect(netByCurrency([{ serverUrl: 'https://a.test', data: null }])).toEqual([]);
  });

  it('sums the same currency across separate accounts', () => {
    const rows = netByCurrency([
      { serverUrl: 'https://a.test', data: [bal('g1', 'SEK', '100.00')] },
      { serverUrl: 'https://b.test', data: [bal('g2', 'SEK', '25.50')] },
    ]);
    expect(rows).toEqual([{ currency: 'SEK', minor: 12550 }]);
  });

  it('nets opposing signs within a currency', () => {
    const rows = netByCurrency([
      { serverUrl: 'https://a.test', data: [bal('g1', 'SEK', '100.00'), bal('g2', 'SEK', '-30.00')] },
    ]);
    expect(rows).toEqual([{ currency: 'SEK', minor: 7000 }]);
  });

  it('sorts by absolute value so a large debt outranks a small credit', () => {
    const rows = netByCurrency([
      {
        serverUrl: 'https://a.test',
        data: [bal('g1', 'EUR', '5.00'), bal('g2', 'SEK', '-900.00')],
      },
    ]);
    expect(rows.map((r) => r.currency)).toEqual(['SEK', 'EUR']);
    expect(rows[0].minor).toBe(-90000);
  });
});

describe('mergeGroupsWithBalances', () => {
  it('attaches every per-currency row for a group', () => {
    const rows = mergeGroupsWithBalances(
      [{ serverUrl: 'https://a.test', data: [group('g1')] }],
      [
        {
          serverUrl: 'https://a.test',
          data: [bal('g1', 'EUR', '100.00'), bal('g1', 'USD', '-30.00')],
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].balances).toHaveLength(2);
  });

  it('keys on (serverUrl, groupId) so two servers sharing a group id do not cross-contaminate', () => {
    const rows = mergeGroupsWithBalances(
      [
        { serverUrl: 'https://a.test', data: [group('shared')] },
        { serverUrl: 'https://b.test', data: [group('shared')] },
      ],
      [
        { serverUrl: 'https://a.test', data: [bal('shared', 'SEK', '100.00')] },
        { serverUrl: 'https://b.test', data: [bal('shared', 'EUR', '-50.00')] },
      ],
    );
    const a = rows.find((r) => r.serverUrl === 'https://a.test')!;
    const b = rows.find((r) => r.serverUrl === 'https://b.test')!;
    expect(a.balances).toEqual([bal('shared', 'SEK', '100.00')]);
    expect(b.balances).toEqual([bal('shared', 'EUR', '-50.00')]);
  });

  it('yields an empty balance list for a group with no rows', () => {
    const rows = mergeGroupsWithBalances(
      [{ serverUrl: 'https://a.test', data: [group('g1')] }],
      [{ serverUrl: 'https://a.test', data: [] }],
    );
    expect(rows[0].balances).toEqual([]);
  });

  it('drops balance rows whose group is unknown', () => {
    const rows = mergeGroupsWithBalances(
      [{ serverUrl: 'https://a.test', data: [group('g1')] }],
      [{ serverUrl: 'https://a.test', data: [bal('ghost', 'SEK', '10.00')] }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].balances).toEqual([]);
  });

  it('ignores unresolved reads on both sides', () => {
    expect(
      mergeGroupsWithBalances(
        [{ serverUrl: 'https://a.test', data: null }],
        [{ serverUrl: 'https://a.test', data: null }],
      ),
    ).toEqual([]);
  });
});

describe('groupPosition', () => {
  function merged(balances: MyBalance[], g: Group = group('g1')): MergedGroup {
    return { group: g, serverUrl: 'https://a.test', balances };
  }

  it('picks the largest absolute row as dominant and flags mixed signs', () => {
    const pos = groupPosition(
      merged([bal('g1', 'EUR', '100.00'), bal('g1', 'USD', '-30.00')]),
    );
    expect(pos.currency).toBe('EUR');
    expect(pos.minor).toBe(10000);
    expect(pos.direction).toBe('owed');
    expect(pos.mixedSigns).toBe(true);
    expect(pos.settled).toBe(false);
  });

  it('is independent of input row order', () => {
    const a = groupPosition(merged([bal('g1', 'EUR', '100.00'), bal('g1', 'USD', '-30.00')]));
    const b = groupPosition(merged([bal('g1', 'USD', '-30.00'), bal('g1', 'EUR', '100.00')]));
    expect(a).toEqual(b);
  });

  it('reports settled when every row is zero', () => {
    const pos = groupPosition(merged([bal('g1', 'SEK', '0.00'), bal('g1', 'EUR', '0.00')]));
    expect(pos.settled).toBe(true);
    expect(pos.mixedSigns).toBe(false);
    expect(pos.direction).toBe('settled');
  });

  it('falls back to the group currency when there is no activity', () => {
    const pos = groupPosition(merged([], group('g1', { currency: 'NOK' })));
    expect(pos.hasActivity).toBe(false);
    expect(pos.minor).toBe(0);
    expect(pos.currency).toBe('NOK');
    expect(pos.direction).toBe('settled');
  });

  it('breaks an absolute-value tie deterministically on the first row', () => {
    const pos = groupPosition(
      merged([bal('g1', 'EUR', '50.00'), bal('g1', 'USD', '-50.00')]),
    );
    expect(pos.currency).toBe('EUR');
  });

  it('reports a single negative row as owed by the user', () => {
    const pos = groupPosition(merged([bal('g1', 'SEK', '-42.50')]));
    expect(pos.direction).toBe('owe');
    expect(pos.minor).toBe(-4250);
    expect(pos.mixedSigns).toBe(false);
  });
});
