/**
 * The monthly summary deep link carries no server segment — the feature is
 * hosted-only, so there is exactly one server it can mean, and a link that
 * cannot name a server cannot be crafted to point the app at an attacker's
 * host. The classifier therefore resolves the server itself, and refuses
 * when the user holds no account there.
 */

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

import { classifySummaryDeepLink } from '../summary-deep-link';
import type { Account } from '../accounts-store';

const HOSTED = 'https://api.chara.example';

function makeAccount(serverUrl: string): Account {
  return {
    serverUrl,
    token: 't',
    user: { id: 'u', email: 'a@b.c', name: 'a' },
    instance: null,
    addedAt: '2026-05-25T00:00:00Z',
    lastUsedAt: '2026-05-25T00:00:00Z',
  };
}

function deps(accounts: Account[], isLoaded = true) {
  return { accounts, isLoaded, hostedUrl: HOSTED };
}

describe('classifySummaryDeepLink', () => {
  it('navigates to the hosted account for a well-formed link', () => {
    expect(
      classifySummaryDeepLink('chara://summary/2026-08', deps([makeAccount(HOSTED)])),
    ).toEqual({ kind: 'navigate', serverUrl: HOSTED, period: '2026-08' });
  });

  // The dev build ships its own scheme; matching only `chara://` would drop
  // every link minted by the build we actually test in.
  it('accepts the charadev scheme', () => {
    expect(
      classifySummaryDeepLink('charadev://summary/2026-08', deps([makeAccount(HOSTED)])),
    ).toEqual({ kind: 'navigate', serverUrl: HOSTED, period: '2026-08' });
  });

  it('ignores links that are not summary links', () => {
    for (const url of ['', 'chara://groups/x/y', 'https://example.com', 'chara://join?invite=x']) {
      expect(classifySummaryDeepLink(url, deps([makeAccount(HOSTED)])).kind).toBe('ignore');
    }
  });

  it('defers until the accounts blob has loaded', () => {
    expect(classifySummaryDeepLink('chara://summary/2026-08', deps([], false)).kind).toBe(
      'not_loaded',
    );
  });

  // The period is interpolated straight into an API query, so anything that
  // is not exactly YYYY-MM is rejected here rather than at the edge.
  it('rejects a malformed period', () => {
    for (const p of ['2026-8', '2026-13', '2026-00', 'august', '', '../../etc', '2026-08-01']) {
      expect(
        classifySummaryDeepLink(`chara://summary/${p}`, deps([makeAccount(HOSTED)])).kind,
      ).toBe('malformed');
    }
  });

  // Signed into a self-host but not Chara Cloud: there is no account the
  // summary could belong to, so this must not navigate.
  it('reports no_account when the user has no hosted account', () => {
    expect(
      classifySummaryDeepLink('chara://summary/2026-08', deps([makeAccount('https://self.host')])),
    ).toEqual({ kind: 'no_account' });
  });

  // A server segment is not part of the shape; accepting one would reopen
  // exactly the attack the server-less link closes.
  it('rejects an attempt to smuggle a server into the path', () => {
    expect(
      classifySummaryDeepLink(
        'chara://summary/https%3A%2F%2Fevil.example/2026-08',
        deps([makeAccount(HOSTED)]),
      ).kind,
    ).toBe('malformed');
  });

  it('tolerates a query string', () => {
    expect(
      classifySummaryDeepLink('chara://summary/2026-08?src=push', deps([makeAccount(HOSTED)])),
    ).toEqual({ kind: 'navigate', serverUrl: HOSTED, period: '2026-08' });
  });
});
