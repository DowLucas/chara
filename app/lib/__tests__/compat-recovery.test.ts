/**
 * Tests for the cold-launch / foreground recovery probe (spec §9).
 */

// React Native's `__DEV__` global isn't defined in node; api.ts reads it at
// import time inside resolveBaseUrl().
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

import type { MigrationStorage } from '../migrate-legacy-auth';

// Mock AsyncStorage so accounts-store's evictServer (called by removeAccount,
// which we don't use here but the module pulls in) doesn't blow up.
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

// compat-recovery → api → react-native / expo-* native modules. Mock the
// native-only deps so import doesn't try to hit them.
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
  markIncompatible,
  accountFor,
  type Account,
} from '../accounts-store';
import { runRecoveryProbes } from '../compat-recovery';

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

describe('runRecoveryProbes', () => {
  beforeEach(async () => {
    __resetForTests();
    configure(makeStorage());
    await load();
  });

  it('probes only accounts whose status is incompatible', async () => {
    await addAccount(makeAccount('https://ok.example'));
    await addAccount(makeAccount('https://bad.example'));
    await markIncompatible('https://bad.example');

    const probed: string[] = [];
    await runRecoveryProbes({
      probe: async (serverUrl) => {
        probed.push(serverUrl);
        return { ok: false, reason: 'app_too_old' };
      },
    });

    expect(probed).toEqual(['https://bad.example']);
  });

  it('clears status when the probe succeeds', async () => {
    await addAccount(makeAccount('https://srv.example'));
    await markIncompatible('https://srv.example');
    expect(accountFor('https://srv.example')?.status).toBe('incompatible');

    await runRecoveryProbes({
      probe: async () => ({ ok: true }),
    });

    expect(accountFor('https://srv.example')?.status).toBeUndefined();
  });

  it('leaves status alone when the probe still reports incompatibility', async () => {
    await addAccount(makeAccount('https://srv.example'));
    await markIncompatible('https://srv.example');

    await runRecoveryProbes({
      probe: async () => ({ ok: false, reason: 'app_too_new' }),
    });

    expect(accountFor('https://srv.example')?.status).toBe('incompatible');
  });

  it('leaves status alone when the probe throws', async () => {
    await addAccount(makeAccount('https://srv.example'));
    await markIncompatible('https://srv.example');

    await runRecoveryProbes({
      probe: async () => {
        throw new Error('network down');
      },
    });

    expect(accountFor('https://srv.example')?.status).toBe('incompatible');
  });

  it('does nothing when no accounts are incompatible', async () => {
    await addAccount(makeAccount('https://srv.example'));

    let called = false;
    await runRecoveryProbes({
      probe: async () => {
        called = true;
        return { ok: true };
      },
    });

    expect(called).toBe(false);
  });

  it('probes multiple incompatible accounts in parallel and clears the recovered ones', async () => {
    await addAccount(makeAccount('https://a.example'));
    await addAccount(makeAccount('https://b.example'));
    await addAccount(makeAccount('https://c.example'));
    await markIncompatible('https://a.example');
    await markIncompatible('https://b.example');
    await markIncompatible('https://c.example');

    await runRecoveryProbes({
      probe: async (serverUrl) => {
        if (serverUrl === 'https://b.example') return { ok: true };
        return { ok: false, reason: 'app_too_old' };
      },
    });

    expect(accountFor('https://a.example')?.status).toBe('incompatible');
    expect(accountFor('https://b.example')?.status).toBeUndefined();
    expect(accountFor('https://c.example')?.status).toBe('incompatible');
  });
});
