/**
 * Deep-link routing must validate that the embedded server is one the
 * user is signed into. Without this, any push notification or universal
 * link can shove the app into a group screen on an arbitrary server URL.
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

import { classifyGroupDeepLink } from '../deep-link';
import type { Account } from '../accounts-store';

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

describe('classifyGroupDeepLink', () => {
  it('returns a navigate intent when the server is a known account', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g123`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('navigate');
    if (intent.kind === 'navigate') {
      expect(intent.groupId).toBe('g123');
      expect(intent.serverUrl).toBe('https://api.example.com');
    }
  });

  it('routes to the settle screen when the path ends in /settle', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g123/settle`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('navigate');
    if (intent.kind === 'navigate') {
      expect(intent.groupId).toBe('g123');
      expect(intent.target).toBe('settle');
    }
  });

  it('leaves target undefined for a plain group link', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g123`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    if (intent.kind === 'navigate') {
      expect(intent.target).toBeUndefined();
    }
  });

  it('routes to add-expense when the path ends in /add-expense', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g123/add-expense`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('navigate');
    if (intent.kind === 'navigate') {
      expect(intent.groupId).toBe('g123');
      expect(intent.target).toBe('add-expense');
    }
  });

  it('ignores an unrecognised sub-target rather than inventing a route', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g123/wat`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    if (intent.kind === 'navigate') {
      expect(intent.target).toBeUndefined();
    }
  });

  // The dev variant ships scheme `charadev` (app.config.ts). A hardcoded
  // `chara://` prefix silently dropped every dev-build deep link — push
  // notifications and widget taps alike — which is exactly the build we
  // test in.
  it('accepts the dev-variant scheme', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `charadev://groups/${encodeURIComponent('https://api.example.com')}/g123`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('navigate');
    if (intent.kind === 'navigate') {
      expect(intent.groupId).toBe('g123');
    }
  });

  it('still ignores a foreign scheme that merely contains our own', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `notchara://groups/${encodeURIComponent('https://api.example.com')}/g123`;
    expect(classifyGroupDeepLink(url, { accounts, isLoaded: true }).kind).toBe('ignore');
  });

  it('refuses to navigate to a server the user is not signed into', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://unknown.example.com')}/g1`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('unknown_server');
  });

  it('returns a "not_yet_loaded" intent if accounts blob is still loading', () => {
    const url = `chara://groups/${encodeURIComponent('https://api.example.com')}/g1`;
    const intent = classifyGroupDeepLink(url, { accounts: [], isLoaded: false });
    expect(intent.kind).toBe('not_loaded');
  });

  it('returns "ignore" for non-group URLs', () => {
    const intent = classifyGroupDeepLink('chara://join?invite=foo', {
      accounts: [],
      isLoaded: true,
    });
    expect(intent.kind).toBe('ignore');
  });

  it('returns "malformed" when the path lacks both server and group id', () => {
    const intent = classifyGroupDeepLink('chara://groups/', {
      accounts: [],
      isLoaded: true,
    });
    expect(intent.kind).toBe('malformed');
  });

  it('returns "malformed" when the embedded server URL is invalid', () => {
    const url = `chara://groups/${encodeURIComponent('not-a-url')}/g1`;
    const intent = classifyGroupDeepLink(url, {
      accounts: [makeAccount('https://api.example.com')],
      isLoaded: true,
    });
    expect(intent.kind).toBe('malformed');
  });

  it('matches the account even when the embedded URL has a trailing slash', () => {
    const accounts = [makeAccount('https://api.example.com')];
    const url = `chara://groups/${encodeURIComponent('https://api.example.com/')}/g1`;
    const intent = classifyGroupDeepLink(url, { accounts, isLoaded: true });
    expect(intent.kind).toBe('navigate');
  });

  it('returns null gracefully for empty/null input', () => {
    expect(classifyGroupDeepLink(null, { accounts: [], isLoaded: true }).kind).toBe('ignore');
    expect(classifyGroupDeepLink(undefined, { accounts: [], isLoaded: true }).kind).toBe('ignore');
    expect(classifyGroupDeepLink('', { accounts: [], isLoaded: true }).kind).toBe('ignore');
  });
});
