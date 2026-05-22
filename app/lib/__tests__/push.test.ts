/**
 * Tests for the push token driver (spec §15).
 *
 * Pure-logic. expo-notifications, expo-device, expo-constants, and the
 * real `apiFor` are all behind a mock + DI seam.
 */

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

// --- mocks for native deps that the module pulls in transitively --------
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
    getAllKeys: async () => [],
    multiRemove: async () => {},
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
}));

// expo-notifications + expo-device aren't directly invoked by the tests
// (we inject `getOrAcquireToken` and `onTokenRotation`), but the module
// imports them at top-level so we need stubs.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: () => {} })),
}));
jest.mock('expo-device', () => ({
  isDevice: true,
}));

// react-native: a thin stub so importing `Platform` works.
const mockPlatformOS: { OS: 'ios' | 'android' | 'web' } = { OS: 'ios' };
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatformOS;
  },
}));

import type { MigrationStorage } from '../migrate-legacy-auth';
import {
  __resetForTests as resetStore,
  addAccount,
  configure,
  load,
  type Account,
} from '../accounts-store';
import {
  __resetForTests as resetPush,
  __getInternalsForTests,
  bootstrapPush,
  registerForAccount,
  unregisterForAccount,
  retryPendingRegistrations,
  type PushDeps,
} from '../push';
import { REFRESH_FLOOR_MS } from '../aggregated-reads-internal';

function makeStorage(): MigrationStorage {
  const items = new Map<string, string>();
  return {
    async getItem(k) {
      return items.get(k) ?? null;
    },
    async setItem(k, v) {
      items.set(k, v);
    },
    async deleteItem(k) {
      items.delete(k);
    },
  };
}

function makeAccount(serverUrl: string): Account {
  return {
    serverUrl,
    token: 't',
    user: { id: 'u', email: 'a@b.c', name: 'A', phone: '', avatar_url: null },
    instance: null,
    addedAt: '2026-05-22T10:00:00Z',
    lastUsedAt: '2026-05-22T10:00:00Z',
  };
}

interface FakeApi {
  registerPushToken: jest.Mock<Promise<void>, [string, 'ios' | 'android' | 'web']>;
  deletePushToken: jest.Mock<Promise<void>, [string]>;
}

function makeFakeApi(opts: { registerFails?: Set<string> } = {}): {
  apiFor: (serverUrl: string) => FakeApi;
  registers: Array<{ serverUrl: string; token: string }>;
  deletes: Array<{ serverUrl: string; token: string }>;
  clients: Map<string, FakeApi>;
} {
  const registers: Array<{ serverUrl: string; token: string }> = [];
  const deletes: Array<{ serverUrl: string; token: string }> = [];
  const clients = new Map<string, FakeApi>();
  return {
    registers,
    deletes,
    clients,
    apiFor: (serverUrl: string): FakeApi => {
      const existing = clients.get(serverUrl);
      if (existing) return existing;
      const c: FakeApi = {
        registerPushToken: jest.fn(
          async (token: string, _platform: 'ios' | 'android' | 'web') => {
            if (opts.registerFails?.has(serverUrl)) {
              throw new Error(`register failed for ${serverUrl}`);
            }
            registers.push({ serverUrl, token });
          },
        ),
        deletePushToken: jest.fn(async (token: string) => {
          deletes.push({ serverUrl, token });
        }),
      };
      clients.set(serverUrl, c);
      return c;
    },
  };
}

function makeDeps(
  overrides: Partial<PushDeps> & { rotationHandlers?: ((tok: string) => void)[] } = {},
): PushDeps & { fireRotation: (token: string) => void } {
  const rotationHandlers: ((tok: string) => void)[] = overrides.rotationHandlers ?? [];
  const fakeApi = makeFakeApi();
  return {
    getOrAcquireToken: overrides.getOrAcquireToken ?? (async () => 'ExpoPushToken[abc]'),
    platform: overrides.platform ?? 'ios',
    apiFor: overrides.apiFor ?? fakeApi.apiFor,
    onTokenRotation:
      overrides.onTokenRotation ??
      ((handler) => {
        rotationHandlers.push(handler);
        return () => {
          const i = rotationHandlers.indexOf(handler);
          if (i >= 0) rotationHandlers.splice(i, 1);
        };
      }),
    fireRotation: (token: string) => {
      for (const h of rotationHandlers) h(token);
    },
  };
}

describe('push driver', () => {
  beforeEach(async () => {
    resetPush();
    resetStore();
    mockPlatformOS.OS = 'ios';
    configure(makeStorage());
    await load();
  });

  it('bootstrapPush is a no-op on web (no token, no registration)', async () => {
    mockPlatformOS.OS = 'web';
    await addAccount(makeAccount('https://a.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({
      getOrAcquireToken: async () => null, // web yields null
      apiFor: fakeApi.apiFor,
    });

    await bootstrapPush(deps);

    expect(fakeApi.registers).toHaveLength(0);
    expect(__getInternalsForTests().token).toBeNull();
  });

  it('bootstrapPush is a no-op when Device.isDevice is false (simulator)', async () => {
    await addAccount(makeAccount('https://a.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({
      getOrAcquireToken: async () => null, // simulator yields null
      apiFor: fakeApi.apiFor,
    });

    await bootstrapPush(deps);

    expect(fakeApi.registers).toHaveLength(0);
  });

  it('bootstrapPush is a no-op when permission is denied (null token)', async () => {
    await addAccount(makeAccount('https://a.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({
      getOrAcquireToken: async () => null, // permission denied yields null
      apiFor: fakeApi.apiFor,
    });

    await bootstrapPush(deps);

    expect(fakeApi.registers).toHaveLength(0);
    expect(__getInternalsForTests().registered).toEqual([]);
  });

  it('bootstrapPush registers every existing account after token acquisition', async () => {
    await addAccount(makeAccount('https://a.example'));
    await addAccount(makeAccount('https://b.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({ apiFor: fakeApi.apiFor });

    await bootstrapPush(deps);

    expect(fakeApi.registers.map((r) => r.serverUrl).sort()).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(fakeApi.registers.every((r) => r.token === 'ExpoPushToken[abc]')).toBe(true);
    expect(__getInternalsForTests().registered.sort()).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('registerForAccount adds the serverUrl to `registered` on success', async () => {
    const fakeApi = makeFakeApi();
    const deps = makeDeps({ apiFor: fakeApi.apiFor });
    await bootstrapPush(deps);
    // bootstrapPush ran with zero accounts; now add one and call directly.
    await addAccount(makeAccount('https://c.example'));

    await registerForAccount('https://c.example');

    expect(__getInternalsForTests().registered).toContain('https://c.example');
    expect(__getInternalsForTests().failed).not.toContain('https://c.example');
    // The api was called with token + platform.
    const client = fakeApi.clients.get('https://c.example');
    expect(client?.registerPushToken).toHaveBeenCalledWith('ExpoPushToken[abc]', 'ios');
  });

  it('registerForAccount adds the serverUrl to `failed` on API error', async () => {
    const fakeApi = makeFakeApi({ registerFails: new Set(['https://bad.example']) });
    const deps = makeDeps({ apiFor: fakeApi.apiFor });
    await bootstrapPush(deps);
    await addAccount(makeAccount('https://bad.example'));

    await registerForAccount('https://bad.example');

    expect(__getInternalsForTests().failed).toContain('https://bad.example');
    expect(__getInternalsForTests().registered).not.toContain('https://bad.example');
  });

  it('unregisterForAccount calls deletePushToken and removes from both sets', async () => {
    await addAccount(makeAccount('https://a.example'));
    const fakeApi = makeFakeApi();
    const deps = makeDeps({ apiFor: fakeApi.apiFor });
    await bootstrapPush(deps);

    expect(__getInternalsForTests().registered).toContain('https://a.example');

    await unregisterForAccount('https://a.example');

    expect(fakeApi.deletes).toEqual([
      { serverUrl: 'https://a.example', token: 'ExpoPushToken[abc]' },
    ]);
    expect(__getInternalsForTests().registered).not.toContain('https://a.example');
    expect(__getInternalsForTests().failed).not.toContain('https://a.example');
  });

  it('retryPendingRegistrations only retries failed serverUrls and respects the throttle', async () => {
    const fakeApi = makeFakeApi({ registerFails: new Set(['https://bad.example']) });
    const deps = makeDeps({ apiFor: fakeApi.apiFor });

    await addAccount(makeAccount('https://ok.example'));
    await addAccount(makeAccount('https://bad.example'));
    await bootstrapPush(deps);

    // After bootstrap: ok registered, bad failed.
    expect(__getInternalsForTests().registered).toContain('https://ok.example');
    expect(__getInternalsForTests().failed).toContain('https://bad.example');

    const registersBefore = fakeApi.registers.length;

    // Flip the failing server to succeed and retry.
    fakeApi.clients.get('https://bad.example')!.registerPushToken.mockImplementation(
      async (token: string) => {
        fakeApi.registers.push({ serverUrl: 'https://bad.example', token });
      },
    );

    await retryPendingRegistrations();

    expect(fakeApi.registers.length).toBe(registersBefore + 1);
    expect(__getInternalsForTests().registered).toContain('https://bad.example');
    expect(__getInternalsForTests().failed).not.toContain('https://bad.example');

    // Immediate second retry is throttled.
    const after = fakeApi.registers.length;
    // Re-introduce a failure to make sure a non-throttled call would fire.
    fakeApi.clients
      .get('https://bad.example')!
      .registerPushToken.mockImplementation(async () => {
        throw new Error('still bad');
      });
    // Manually re-add to failed since the retry succeeded and cleared it.
    // (We simulate a fresh failure to prove the throttle blocks the retry.)
    // Instead of mutating private state, force a fresh registerForAccount
    // call that will fail and re-add it to failed:
    await registerForAccount('https://bad.example');
    expect(__getInternalsForTests().failed).toContain('https://bad.example');

    const beforeThrottled = fakeApi.registers.length;
    await retryPendingRegistrations(); // throttled
    expect(fakeApi.registers.length).toBe(beforeThrottled);
  });

  it('retryPendingRegistrations fires again after the throttle window elapses', async () => {
    const fakeApi = makeFakeApi({ registerFails: new Set(['https://bad.example']) });
    const deps = makeDeps({ apiFor: fakeApi.apiFor });

    await addAccount(makeAccount('https://bad.example'));
    await bootstrapPush(deps);
    expect(__getInternalsForTests().failed).toContain('https://bad.example');

    // First retry consumes the throttle slot.
    await retryPendingRegistrations();

    // Advance wall-clock past the throttle floor.
    const realNow = Date.now;
    Date.now = () => realNow() + REFRESH_FLOOR_MS + 1;
    try {
      const before = fakeApi.registers.length;
      // Make it succeed this time.
      fakeApi.clients.get('https://bad.example')!.registerPushToken.mockImplementation(
        async (token: string) => {
          fakeApi.registers.push({ serverUrl: 'https://bad.example', token });
        },
      );
      await retryPendingRegistrations();
      expect(fakeApi.registers.length).toBe(before + 1);
    } finally {
      Date.now = realNow;
    }
  });

  it('token rotation clears `registered` and re-fans-out to every account', async () => {
    await addAccount(makeAccount('https://a.example'));
    await addAccount(makeAccount('https://b.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({ apiFor: fakeApi.apiFor });
    await bootstrapPush(deps);

    expect(__getInternalsForTests().registered.sort()).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(fakeApi.registers).toHaveLength(2);

    // Fire token rotation.
    deps.fireRotation('ExpoPushToken[NEW]');
    // The rotation handler is synchronous; reconciliation is async, so
    // let microtasks flush.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(__getInternalsForTests().token).toBe('ExpoPushToken[NEW]');
    // Every account re-registered with the new token.
    const newReg = fakeApi.registers.filter((r) => r.token === 'ExpoPushToken[NEW]');
    expect(newReg.map((r) => r.serverUrl).sort()).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('bootstrapPush is idempotent — calling twice does not double-register', async () => {
    await addAccount(makeAccount('https://a.example'));

    const fakeApi = makeFakeApi();
    const deps = makeDeps({ apiFor: fakeApi.apiFor });

    await bootstrapPush(deps);
    await bootstrapPush(deps);

    expect(fakeApi.registers).toHaveLength(1);
  });
});
