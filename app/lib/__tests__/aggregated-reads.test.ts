/**
 * Tests for the pure / module-level pieces of aggregated-reads. The React
 * hook itself is not rendered (RTL isn't wired up in this repo); the
 * filter + dedup helpers are extracted so they can be exercised in
 * isolation.
 */

import type { Account } from '../accounts-store';
import {
  __resetInflightForTests,
  dedupKey,
  filterQueryableAccounts,
  getOrFetch,
  isQueryable,
  REFRESH_FLOOR_MS,
} from '../aggregated-reads-internal';

function makeAccount(serverUrl: string, status?: Account['status']): Account {
  return {
    serverUrl,
    token: 't',
    user: { id: 'u', email: 'a@b.c', name: 'A', phone: '', avatar_url: null },
    instance: null,
    addedAt: '2026-05-22T10:00:00Z',
    lastUsedAt: '2026-05-22T10:00:00Z',
    ...(status ? { status } : {}),
  };
}

describe('isQueryable / filterQueryableAccounts', () => {
  it('treats accounts with no status as queryable', () => {
    expect(isQueryable(makeAccount('https://a'))).toBe(true);
  });

  it('excludes reauth_required accounts', () => {
    expect(isQueryable(makeAccount('https://a', 'reauth_required'))).toBe(false);
  });

  it('excludes incompatible accounts', () => {
    expect(isQueryable(makeAccount('https://a', 'incompatible'))).toBe(false);
  });

  it('filterQueryableAccounts drops only the non-queryable ones and preserves order', () => {
    const accounts = [
      makeAccount('https://a'),
      makeAccount('https://b', 'reauth_required'),
      makeAccount('https://c'),
      makeAccount('https://d', 'incompatible'),
    ];
    const result = filterQueryableAccounts(accounts);
    expect(result.map((a) => a.serverUrl)).toEqual([
      'https://a',
      'https://c',
    ]);
  });
});

describe('dedupKey', () => {
  it('produces stable keys per (serverUrl, endpoint)', () => {
    expect(dedupKey('https://a', 'groups')).toBe(dedupKey('https://a', 'groups'));
    expect(dedupKey('https://a', 'groups')).not.toBe(
      dedupKey('https://a', 'balances'),
    );
    expect(dedupKey('https://a', 'groups')).not.toBe(
      dedupKey('https://b', 'groups'),
    );
  });
});

describe('getOrFetch', () => {
  beforeEach(() => {
    __resetInflightForTests();
  });

  it('runs the factory exactly once when called concurrently for the same key', async () => {
    let calls = 0;
    let resolveFn: ((v: number) => void) | null = null;
    const factory = () => {
      calls++;
      return new Promise<number>((resolve) => {
        resolveFn = resolve;
      });
    };

    const p1 = getOrFetch('https://a', 'groups', factory);
    const p2 = getOrFetch('https://a', 'groups', factory);

    expect(calls).toBe(1);

    resolveFn!(42);
    await expect(p1).resolves.toBe(42);
    await expect(p2).resolves.toBe(42);
  });

  it('runs the factory again after the previous one settles', async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(calls);
    };

    await getOrFetch('https://a', 'groups', factory);
    await getOrFetch('https://a', 'groups', factory);
    expect(calls).toBe(2);
  });

  it('does not dedup across different endpoints for the same server', async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return new Promise<number>(() => {
        /* never resolves; we only care about call count */
      });
    };

    void getOrFetch('https://a', 'groups', factory);
    void getOrFetch('https://a', 'balances', factory);

    expect(calls).toBe(2);
  });

  it('does not dedup across different servers for the same endpoint', async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return new Promise<number>(() => {});
    };

    void getOrFetch('https://a', 'groups', factory);
    void getOrFetch('https://b', 'groups', factory);

    expect(calls).toBe(2);
  });

  it('removes the in-flight entry even when the factory rejects', async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.reject(new Error('boom'));
    };

    await expect(getOrFetch('https://a', 'groups', factory)).rejects.toThrow('boom');
    // A retry kicks off a fresh factory call.
    await expect(getOrFetch('https://a', 'groups', factory)).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });
});

describe('REFRESH_FLOOR_MS', () => {
  it('matches the spec §12 60-second floor', () => {
    expect(REFRESH_FLOOR_MS).toBe(60_000);
  });
});
