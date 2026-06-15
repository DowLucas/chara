/**
 * Tests for refreshAccountInstance — re-reads a server's advertised
 * capabilities (`/.well-known/chara-instance`) and persists them onto the
 * account so the sign-in screen's auth buttons self-heal from a stale cache
 * (e.g. an "Apple: off" snapshot captured during a server outage, which on
 * iOS survives app reinstall via the Keychain).
 */

// React Native's `__DEV__` global isn't defined in node; api.ts reads it at
// import time inside resolveBaseUrl().
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

import type { MigrationStorage } from '../migrate-legacy-auth';

// accounts-store / api pull in native-only modules; mock them so import works
// in the node test environment (same posture as compat-recovery.test.ts).
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
  default: { expoConfig: {}, manifest: {} },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  __resetForTests,
  addAccount,
  configure,
  load,
  accountFor,
  type Account,
  type AccountInstanceInfo,
} from '../accounts-store';
import { refreshAccountInstance } from '../refresh-instance';

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

const HOSTED = 'https://api.chara.app';

const VALID_RAW = {
  mode: 'hosted',
  version: '0.1.0',
  protocol_version: 1,
  min_app_protocol: 0,
  max_app_protocol: 2,
  auth_methods: ['magic_link', 'google', 'apple'],
  features: { google_auth: true, apple_auth: true, ocr: true },
};

const STALE_EMAIL_ONLY: AccountInstanceInfo = {
  mode: 'hosted',
  version: '0.1.0',
  protocol_version: 1,
  min_app_protocol: 0,
  max_app_protocol: 2,
  auth_methods: ['magic_link'],
  features: { apple_auth: false, google_auth: false },
};

describe('refreshAccountInstance', () => {
  beforeEach(async () => {
    __resetForTests();
    configure(makeStorage());
    await load();
  });

  it('parses and persists fresh capabilities onto an existing account', async () => {
    await addAccount(makeAccount(HOSTED));
    expect(accountFor(HOSTED)?.instance).toBeNull();

    const parsed = await refreshAccountInstance(HOSTED, {
      fetchInstanceInfo: async () => VALID_RAW,
    });

    expect(parsed?.features.apple_auth).toBe(true);
    expect(accountFor(HOSTED)?.instance?.features.apple_auth).toBe(true);
    expect(accountFor(HOSTED)?.instance?.auth_methods).toContain('apple');
  });

  it('heals a stale email-only snapshot (apple/google off -> on)', async () => {
    const acct = makeAccount(HOSTED);
    acct.instance = STALE_EMAIL_ONLY;
    await addAccount(acct);

    await refreshAccountInstance(HOSTED, {
      fetchInstanceInfo: async () => VALID_RAW,
    });

    const inst = accountFor(HOSTED)?.instance;
    expect(inst?.features.apple_auth).toBe(true);
    expect(inst?.features.google_auth).toBe(true);
  });

  it('returns the parsed instance but does NOT persist when no account exists', async () => {
    const parsed = await refreshAccountInstance(HOSTED, {
      fetchInstanceInfo: async () => VALID_RAW,
    });
    expect(parsed?.features.apple_auth).toBe(true);
    expect(accountFor(HOSTED)).toBeNull();
  });

  it('returns null and does not persist when the response is not a Chara instance', async () => {
    const acct = makeAccount(HOSTED);
    acct.instance = STALE_EMAIL_ONLY;
    await addAccount(acct);

    const parsed = await refreshAccountInstance(HOSTED, {
      fetchInstanceInfo: async () => ({ nope: true }),
    });

    expect(parsed).toBeNull();
    // Cache left untouched, not wiped.
    expect(accountFor(HOSTED)?.instance?.auth_methods).toEqual(['magic_link']);
  });

  it('returns null when the fetch throws (server unreachable)', async () => {
    await addAccount(makeAccount(HOSTED));
    const parsed = await refreshAccountInstance(HOSTED, {
      fetchInstanceInfo: async () => {
        throw new Error('network down');
      },
    });
    expect(parsed).toBeNull();
  });
});
