/**
 * The widget snapshot is the only thing the homescreen widgets ever render.
 * Two properties matter most and are asserted hard below:
 *
 *   1. Privacy — a signed-out snapshot must carry no group names and no
 *      amounts. The homescreen is visible without unlocking on Android and
 *      on iOS Today view, so a stale balance outliving sign-out is a leak.
 *   2. Currency honesty — amounts are never summed across currencies, and a
 *      group whose currencies disagree in sign is flagged, mirroring the
 *      home screen (see balance-summary.ts).
 */

import type { Group, MyBalance, MyNetResponse } from '../api';
import { buildWidgetSnapshot, type SnapshotDeps } from '../widget-snapshot';
import { MAX_WIDGET_GROUPS, WIDGET_SNAPSHOT_VERSION } from '../widget-snapshot-types';

function group(id: string, name: string, over: Partial<Group> = {}): Group {
  return {
    id,
    name,
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

function myNet(over: Partial<MyNetResponse> = {}): MyNetResponse {
  return {
    home_currency: 'SEK',
    net_minor: '-100.00',
    total_legs: 4,
    converted_legs: 2,
    estimated_legs: 0,
    contributing_groups: 2,
    ...over,
  };
}

/** Deterministic deps: no i18next, no clock, no locale lookup. */
const deps: SnapshotDeps = {
  scheme: 'chara',
  t: (key) => `T:${key}`,
  formatAmount: (minor, currency) => `${minor} ${currency}`,
  formatAmountCompact: (minor, currency) => `${minor}${currency}`,
  formatTime: () => '14:32',
  locale: 'sv-SE',
  language: 'sv',
  now: () => new Date('2026-07-20T12:32:00.000Z'),
};

const SERVER = 'https://api.example.com';

function baseInput() {
  return {
    accountsTotal: 1,
    homeCurrency: 'SEK',
    groupReads: [{ serverUrl: SERVER, data: [group('g1', 'Skiing trip')] }],
    balanceReads: [{ serverUrl: SERVER, data: [bal('g1', 'SEK', '-420.00')] }],
    myNetReads: [{ serverUrl: SERVER, data: myNet() }],
    lastActiveGroup: null,
  };
}

describe('buildWidgetSnapshot — envelope', () => {
  it('stamps the current schema version and clock', () => {
    const s = buildWidgetSnapshot(baseInput(), deps);
    expect(s.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(s.generatedAt).toBe('2026-07-20T12:32:00.000Z');
    expect(s.updatedAtText).toBe('14:32');
    expect(s.locale).toBe('sv-SE');
  });

  it('resolves every string, so no raw key reaches native', () => {
    const s = buildWidgetSnapshot(baseInput(), deps);
    for (const [k, v] of Object.entries(s.strings)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
      expect(k).toBeTruthy();
    }
  });
});

describe('buildWidgetSnapshot — privacy', () => {
  it('emits a signed_out snapshot with no balances when there are no accounts', () => {
    const s = buildWidgetSnapshot({ ...baseInput(), accountsTotal: 0 }, deps);
    expect(s.state).toBe('signed_out');
    expect(s.currencies).toEqual([]);
    expect(s.groups).toEqual([]);
    expect(s.homeNet).toBeNull();
    expect(s.shortcut).toBeNull();
  });

  it('leaks no group name or amount when signed out, even with populated reads', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        accountsTotal: 0,
        lastActiveGroup: { serverUrl: SERVER, groupId: 'g1', name: 'Skiing trip' },
      },
      deps,
    );
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain('Skiing trip');
    expect(serialized).not.toContain('420');
    expect(serialized).not.toContain(SERVER);
  });
});

describe('buildWidgetSnapshot — currency honesty', () => {
  it('keeps one row per currency and never sums across them', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        groupReads: [{ serverUrl: SERVER, data: [group('g1', 'Trip'), group('g2', 'Flat')] }],
        balanceReads: [
          {
            serverUrl: SERVER,
            data: [bal('g1', 'EUR', '100.00'), bal('g2', 'SEK', '-900.00')],
          },
        ],
      },
      deps,
    );
    expect(s.currencies.map((c) => c.currency)).toEqual(['SEK', 'EUR']);
    expect(s.currencies[0].minor).toBe(-90000);
    expect(s.currencies[0].direction).toBe('owe');
    expect(s.currencies[1].minor).toBe(10000);
    expect(s.currencies[1].direction).toBe('owed');
  });

  it('formats amounts absolutely and carries direction in the caption', () => {
    const s = buildWidgetSnapshot(baseInput(), deps);
    const row = s.currencies[0];
    expect(row.minor).toBe(-42000);
    expect(row.amountText).toBe('42000 SEK');
    expect(row.captionText).toBe('T:widget.youOwe');
  });

  it('propagates mixed signs onto the group row', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        balanceReads: [
          {
            serverUrl: SERVER,
            data: [bal('g1', 'EUR', '100.00'), bal('g1', 'USD', '-30.00')],
          },
        ],
      },
      deps,
    );
    expect(s.groups[0].mixedSigns).toBe(true);
    expect(s.groups[0].currency).toBe('EUR');
  });

  it('reports all-settled distinctly from having no groups', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        balanceReads: [{ serverUrl: SERVER, data: [bal('g1', 'SEK', '0.00')] }],
      },
      deps,
    );
    expect(s.state).toBe('ok');
    expect(s.currencies[0].direction).toBe('settled');
    expect(s.currencies[0].captionText).toBe('T:widget.allSettled');
  });

  it('reports empty when signed in with no groups at all', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        groupReads: [{ serverUrl: SERVER, data: [] }],
        balanceReads: [{ serverUrl: SERVER, data: [] }],
      },
      deps,
    );
    expect(s.state).toBe('empty');
    expect(s.groups).toEqual([]);
  });
});

describe('buildWidgetSnapshot — groups', () => {
  it('sorts by absolute balance and drops settled / inactive groups', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        groupReads: [
          {
            serverUrl: SERVER,
            data: [
              group('g1', 'Small'),
              group('g2', 'Big'),
              group('g3', 'Settled'),
              group('g4', 'Untouched'),
            ],
          },
        ],
        balanceReads: [
          {
            serverUrl: SERVER,
            data: [
              bal('g1', 'SEK', '-10.00'),
              bal('g2', 'SEK', '-900.00'),
              bal('g3', 'SEK', '0.00'),
            ],
          },
        ],
      },
      deps,
    );
    expect(s.groups.map((g) => g.name)).toEqual(['Big', 'Small']);
  });

  it('caps the group list', () => {
    const many = Array.from({ length: 12 }, (_, i) => group(`g${i}`, `Group ${i}`));
    const balances = many.map((g, i) => bal(g.id, 'SEK', `-${(i + 1) * 10}.00`));
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        groupReads: [{ serverUrl: SERVER, data: many }],
        balanceReads: [{ serverUrl: SERVER, data: balances }],
      },
      deps,
    );
    expect(s.groups).toHaveLength(MAX_WIDGET_GROUPS);
  });

  it('encodes the server URL exactly once in the deep link', () => {
    const s = buildWidgetSnapshot(baseInput(), deps);
    expect(s.groups[0].deepLink).toBe(
      `chara://groups/${encodeURIComponent(SERVER)}/g1`,
    );
    expect(s.groups[0].deepLink).toContain('https%3A%2F%2Fapi.example.com');
    expect(s.groups[0].serverUrl).toBe(SERVER);
  });

  it('mints deep links with the app scheme it was given (dev variant)', () => {
    // The dev build ships scheme `charadev`; a hardcoded `chara://` link would
    // not route to the installed dev app.
    const s = buildWidgetSnapshot(baseInput(), { ...deps, scheme: 'charadev' });
    expect(s.groups[0].deepLink.startsWith('charadev://groups/')).toBe(true);
  });

  it('keeps groups from different servers that share an id distinct', () => {
    const other = 'https://other.example.com';
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        accountsTotal: 2,
        groupReads: [
          { serverUrl: SERVER, data: [group('shared', 'Mine')] },
          { serverUrl: other, data: [group('shared', 'Theirs')] },
        ],
        balanceReads: [
          { serverUrl: SERVER, data: [bal('shared', 'SEK', '-100.00')] },
          { serverUrl: other, data: [bal('shared', 'SEK', '-200.00')] },
        ],
        myNetReads: [
          { serverUrl: SERVER, data: myNet() },
          { serverUrl: other, data: myNet() },
        ],
      },
      deps,
    );
    expect(s.groups.map((g) => g.name)).toEqual(['Theirs', 'Mine']);
    expect(new Set(s.groups.map((g) => g.deepLink)).size).toBe(2);
  });
});

describe('buildWidgetSnapshot — partial failure', () => {
  it('flags partial and still renders the healthy account', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        accountsTotal: 2,
        groupReads: [
          { serverUrl: SERVER, data: [group('g1', 'Skiing trip')] },
          { serverUrl: 'https://down.example.com', data: null },
        ],
        balanceReads: [
          { serverUrl: SERVER, data: [bal('g1', 'SEK', '-420.00')] },
          { serverUrl: 'https://down.example.com', data: null },
        ],
      },
      deps,
    );
    expect(s.partial).toBe(true);
    expect(s.accountsOk).toBe(1);
    expect(s.accountsTotal).toBe(2);
    expect(s.groups).toHaveLength(1);
  });

  it('treats an unresolved account (reauth_required / incompatible) as not ok', () => {
    // Such accounts are filtered from the fan-out, so they arrive as data:null
    // and must never contribute rows from a stale cache.
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        accountsTotal: 2,
        balanceReads: [
          { serverUrl: SERVER, data: [bal('g1', 'SEK', '-420.00')] },
          { serverUrl: 'https://stale.example.com', data: null },
        ],
      },
      deps,
    );
    expect(s.partial).toBe(true);
    expect(s.accountsOk).toBe(1);
    expect(JSON.stringify(s)).not.toContain('stale.example.com');
  });

  it('is not partial when every account resolved', () => {
    expect(buildWidgetSnapshot(baseInput(), deps).partial).toBe(false);
  });
});

describe('buildWidgetSnapshot — home net', () => {
  it('is null for a single-currency user, where it would duplicate the hero', () => {
    expect(buildWidgetSnapshot(baseInput(), deps).homeNet).toBeNull();
  });

  it('is populated when a foreign balance exists', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        balanceReads: [
          { serverUrl: SERVER, data: [bal('g1', 'EUR', '-420.00')] },
        ],
      },
      deps,
    );
    expect(s.homeNet).not.toBeNull();
    expect(s.homeNet!.currency).toBe('SEK');
    expect(s.homeNet!.estimated).toBe(false);
  });

  it('marks the aggregate estimated when a leg was estimated', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        balanceReads: [{ serverUrl: SERVER, data: [bal('g1', 'EUR', '-420.00')] }],
        myNetReads: [{ serverUrl: SERVER, data: myNet({ estimated_legs: 2 }) }],
      },
      deps,
    );
    expect(s.homeNet!.estimated).toBe(true);
  });

  it('marks the aggregate estimated when an account was skipped', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        accountsTotal: 2,
        balanceReads: [{ serverUrl: SERVER, data: [bal('g1', 'EUR', '-420.00')] }],
        myNetReads: [
          { serverUrl: SERVER, data: myNet() },
          { serverUrl: 'https://down.example.com', data: null },
        ],
      },
      deps,
    );
    expect(s.homeNet!.estimated).toBe(true);
  });
});

describe('buildWidgetSnapshot — expense shortcut', () => {
  it('targets the most recently opened group', () => {
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        lastActiveGroup: { serverUrl: SERVER, groupId: 'g1', name: 'Skiing trip' },
      },
      deps,
    );
    expect(s.shortcut).toEqual({
      name: 'Skiing trip',
      deepLink: `chara://groups/${encodeURIComponent(SERVER)}/g1/add-expense`,
    });
  });

  it('is null when no group has been opened yet', () => {
    expect(buildWidgetSnapshot(baseInput(), deps).shortcut).toBeNull();
  });

  it('is null when the remembered group is no longer visible', () => {
    // Left a group, or removed the account it lived on. Deep-linking there
    // would land on an error screen.
    const s = buildWidgetSnapshot(
      {
        ...baseInput(),
        lastActiveGroup: { serverUrl: SERVER, groupId: 'gone', name: 'Old group' },
      },
      deps,
    );
    expect(s.shortcut).toBeNull();
  });
});
