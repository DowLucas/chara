/**
 * Behavioral tests for the per-server `requestOn()` request helper.
 *
 * Covers the bits Wave 2C added:
 *   - Protocol header injection.
 *   - Authorization header from the account's token.
 *   - 401 flips status to `reauth_required`.
 *   - 426 flips status to `incompatible`.
 *   - NoAccountError when no account exists for the URL.
 */

// React Native's `__DEV__` global isn't defined in node; api.ts reads it
// at import time inside resolveBaseUrl().
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

import { PROTOCOL_HEADER, APP_PROTOCOL_VERSION } from '../protocol';

// Mock AsyncStorage so evictServer (transitively imported via accounts-store)
// doesn't blow up at module-load time.
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

// Mock expo-secure-store / expo-constants / react-native so importing api.ts
// doesn't try to hit native modules.
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {}, manifest: {} },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  __resetForTests,
  addAccount,
  accountFor,
  configure,
  type Account,
} from '../accounts-store';
import { NoAccountError, requestOn } from '../api';

function makeAccount(serverUrl: string, token: string): Account {
  return {
    serverUrl,
    token,
    user: { id: 'u1', email: 'a@b.c', name: 'A' },
    instance: null,
    addedAt: '2026-05-22T10:00:00Z',
    lastUsedAt: '2026-05-22T10:00:00Z',
  };
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    async getItem(k: string) {
      return items.get(k) ?? null;
    },
    async setItem(k: string, v: string) {
      items.set(k, v);
    },
    async deleteItem(k: string) {
      items.delete(k);
    },
  };
}

describe('requestOn', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    __resetForTests();
    configure(memoryStorage());
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('injects the protocol header on every call', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestOn('https://a.example', '/api/me');

    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      [PROTOCOL_HEADER]: String(APP_PROTOCOL_VERSION),
    });
  });

  it('injects Authorization: Bearer when an account exists', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await requestOn('https://a.example', '/api/me/logout', { method: 'POST' });

    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: 'Bearer tok-a',
    });
  });

  it('targets the right server URL', async () => {
    await addAccount(makeAccount('https://b.example', 'tok-b'));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestOn('https://b.example', '/api/groups');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://b.example/api/groups');
  });

  it('on 401, flips the account to reauth_required', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(new Response('expired', { status: 401 }));

    await expect(requestOn('https://a.example', '/api/me')).rejects.toThrow();

    // Status updates are fire-and-forget (void promise inside requestOn).
    // Flush a microtask so the markReauthRequired() promise resolves.
    await new Promise((r) => setImmediate(r));

    expect(accountFor('https://a.example')?.status).toBe('reauth_required');
  });

  it('on 426, flips the account to incompatible', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'app_too_old', min_app_protocol: 2 }), {
        status: 426,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(requestOn('https://a.example', '/api/me')).rejects.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(accountFor('https://a.example')?.status).toBe('incompatible');
  });

  it('on 200, does not flip status', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'u', email: '', name: '' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestOn('https://a.example', '/api/me');
    await new Promise((r) => setImmediate(r));

    expect(accountFor('https://a.example')?.status).toBeUndefined();
  });

  it('throws NoAccountError when no account exists and requireAuth is true', async () => {
    await expect(requestOn('https://unknown.example', '/api/me')).rejects.toBeInstanceOf(
      NoAccountError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('permits requireAuth=false without an account (for /.well-known probes)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ mode: 'hosted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await requestOn('https://unknown.example', '/.well-known/chara-instance', {
      requireAuth: false,
    });

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers as Record<string, string>).not.toHaveProperty(
      'Authorization',
    );
  });

  it('returns parsed JSON on 200', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'u', email: 'x@y.z', name: 'X' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await requestOn<{ id: string }>('https://a.example', '/api/me');
    expect(result).toEqual({ id: 'u', email: 'x@y.z', name: 'X' });
  });

  it('returns undefined on 204', async () => {
    await addAccount(makeAccount('https://a.example', 'tok-a'));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await requestOn('https://a.example', '/api/me/logout', { method: 'POST' });
    expect(result).toBeUndefined();
  });

  it('does not flip status when the URL has no matching account (e.g., during well-known probe)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('expired', { status: 401 }));
    await expect(
      requestOn('https://unknown.example', '/.well-known/chara-instance', {
        requireAuth: false,
      }),
    ).rejects.toThrow();
    // No account → nothing to flag.
    expect(accountFor('https://unknown.example')).toBeNull();
  });
});
