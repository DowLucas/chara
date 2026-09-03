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

  // Signed into several servers, none of them the hosted one: there is no
  // way to tell which sent the push, so this must not navigate. (With a
  // single account the answer is unambiguous — see the fallback tests.)
  it('reports no_account when no hosted account and the choice is ambiguous', () => {
    expect(
      classifySummaryDeepLink(
        'chara://summary/2026-08',
        deps([makeAccount('https://self.host'), makeAccount('https://second.host')]),
      ),
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

  // Regression: a dev build reaches the backend over Tailscale, so
  // legacyHostedUrl() is http://100.80.90.5:8080 — and 100.64.0.0/10 is not
  // in normalizeServerUrl's private-http allowlist, so the hosted URL itself
  // fails to normalize. The classifier used to return `malformed` and the
  // tap did nothing at all. The link is still unambiguous: the push came
  // from the one server the user has an account on.
  it('falls back to the sole account when the hosted URL will not normalize', () => {
    const dev = 'http://192.168.0.45:8080';
    expect(
      classifySummaryDeepLink('chara://summary/2026-08', {
        accounts: [makeAccount(dev)],
        isLoaded: true,
        hostedUrl: 'http://100.80.90.5:8080', // Tailscale — rejected by normalizeServerUrl
      }),
    ).toEqual({ kind: 'navigate', serverUrl: dev, period: '2026-08' });
  });

  // Same fallback when the hosted URL is fine but the user simply has no
  // account there — one account is still unambiguous.
  it('falls back to the sole account when it is not the hosted one', () => {
    expect(
      classifySummaryDeepLink(
        'chara://summary/2026-08',
        deps([makeAccount('https://self.host')]),
      ),
    ).toEqual({ kind: 'navigate', serverUrl: 'https://self.host', period: '2026-08' });
  });

  // With several accounts and no hosted match there is no way to tell which
  // server sent the push, so guessing would open the wrong data.
  it('refuses to guess between several non-hosted accounts', () => {
    expect(
      classifySummaryDeepLink(
        'chara://summary/2026-08',
        deps([makeAccount('https://self.host'), makeAccount('https://other.host')]),
      ),
    ).toEqual({ kind: 'no_account' });
  });

  // The hosted account still wins when it is present, so production keeps
  // its exact previous behaviour.
  it('prefers the hosted account over the fallback', () => {
    expect(
      classifySummaryDeepLink(
        'chara://summary/2026-08',
        deps([makeAccount('https://self.host'), makeAccount(HOSTED)]),
      ),
    ).toEqual({ kind: 'navigate', serverUrl: HOSTED, period: '2026-08' });
  });

  it('still reports no_account with no accounts at all', () => {
    expect(classifySummaryDeepLink('chara://summary/2026-08', deps([]))).toEqual({
      kind: 'no_account',
    });
  });
});
