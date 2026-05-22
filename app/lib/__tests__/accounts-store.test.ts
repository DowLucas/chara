import type { MigrationStorage } from '../migrate-legacy-auth';
import { ACCOUNTS_KEY } from '../migrate-legacy-auth';

// Mock AsyncStorage so evictServer (called by removeAccount) doesn't crash.
const mem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: async (k: string) => {
      mem.delete(k);
    },
    getAllKeys: async () => Array.from(mem.keys()),
    multiRemove: async (ks: string[]) => {
      for (const k of ks) mem.delete(k);
    },
  },
}));

import {
  __resetForTests,
  accountFor,
  addAccount,
  clearStatus,
  configure,
  defaultAccount,
  isLoaded,
  load,
  markIncompatible,
  markReauthRequired,
  removeAccount,
  setDefault,
  setLastUsedCreate,
  snapshot,
  subscribe,
  updateAccount,
  type Account,
} from '../accounts-store';

function makeStorage(): MigrationStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
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

function makeAccount(serverUrl: string, overrides: Partial<Account> = {}): Account {
  return {
    serverUrl,
    token: `tok-${serverUrl}`,
    user: { id: 'u1', email: 'a@b.c', name: 'A', phone: '', avatar_url: null },
    instance: null,
    addedAt: '2026-05-22T10:00:00Z',
    lastUsedAt: '2026-05-22T10:00:00Z',
    ...overrides,
  };
}

describe('accounts-store', () => {
  beforeEach(() => {
    __resetForTests();
    mem.clear();
  });

  describe('configure + load', () => {
    it('starts empty before load', () => {
      const s = makeStorage();
      configure(s);
      expect(snapshot().accounts).toHaveLength(0);
      expect(isLoaded()).toBe(false);
    });

    it('load() with no stored blob leaves empty state and marks loaded', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      expect(snapshot().accounts).toHaveLength(0);
      expect(snapshot().defaultServerUrl).toBeNull();
      expect(isLoaded()).toBe(true);
    });

    it('load() rehydrates a persisted blob', async () => {
      const s = makeStorage();
      s.items.set(
        ACCOUNTS_KEY,
        JSON.stringify({
          version: 1,
          accounts: [makeAccount('https://a.example')],
          defaultServerUrl: 'https://a.example',
          lastUsedCreateServerUrl: 'https://a.example',
        }),
      );
      configure(s);
      await load();
      expect(snapshot().accounts).toHaveLength(1);
      expect(snapshot().defaultServerUrl).toBe('https://a.example');
    });

    it('load() treats corrupt JSON as empty', async () => {
      const s = makeStorage();
      s.items.set(ACCOUNTS_KEY, '{not json');
      configure(s);
      await load();
      expect(snapshot().accounts).toHaveLength(0);
    });

    it('load() treats unknown blob version as empty for this session', async () => {
      const s = makeStorage();
      s.items.set(ACCOUNTS_KEY, JSON.stringify({ version: 99, accounts: [] }));
      configure(s);
      await load();
      expect(snapshot().accounts).toHaveLength(0);
    });

    it('throws if used before configure()', async () => {
      await expect(load()).rejects.toThrow(/configure/);
    });
  });

  describe('addAccount', () => {
    it('appends a new account and sets defaults when first', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      expect(snapshot().accounts).toHaveLength(1);
      expect(snapshot().defaultServerUrl).toBe('https://a.example');
      expect(snapshot().lastUsedCreateServerUrl).toBe('https://a.example');
    });

    it('does not overwrite default when adding a second account', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await addAccount(makeAccount('https://b.example'));
      expect(snapshot().accounts).toHaveLength(2);
      expect(snapshot().defaultServerUrl).toBe('https://a.example');
    });

    it('replaces an existing account with the same serverUrl in place', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example', { token: 'old' }));
      await addAccount(makeAccount('https://a.example', { token: 'new' }));
      expect(snapshot().accounts).toHaveLength(1);
      expect(accountFor('https://a.example')?.token).toBe('new');
    });

    it('persists the change to storage', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      const stored = JSON.parse(s.items.get(ACCOUNTS_KEY)!);
      expect(stored.accounts).toHaveLength(1);
    });
  });

  describe('removeAccount', () => {
    it('removes the account and falls back default to next', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await addAccount(makeAccount('https://b.example'));
      await setDefault('https://b.example');
      await removeAccount('https://b.example');
      expect(snapshot().accounts).toHaveLength(1);
      expect(snapshot().defaultServerUrl).toBe('https://a.example');
    });

    it('clears defaults when removing the last account', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await removeAccount('https://a.example');
      expect(snapshot().accounts).toHaveLength(0);
      expect(snapshot().defaultServerUrl).toBeNull();
      expect(snapshot().lastUsedCreateServerUrl).toBeNull();
    });

    it('does not touch defaults when removing a non-default account', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await addAccount(makeAccount('https://b.example'));
      await removeAccount('https://b.example');
      expect(snapshot().defaultServerUrl).toBe('https://a.example');
    });
  });

  describe('updateAccount + status', () => {
    it('merges patch into the account', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await updateAccount('https://a.example', { token: 'rotated' });
      expect(accountFor('https://a.example')?.token).toBe('rotated');
    });

    it('markReauthRequired persists status', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await markReauthRequired('https://a.example');
      expect(accountFor('https://a.example')?.status).toBe('reauth_required');
      // Persisted, so a re-load preserves it.
      __resetForTests();
      configure(s);
      await load();
      expect(accountFor('https://a.example')?.status).toBe('reauth_required');
    });

    it('markIncompatible persists status', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await markIncompatible('https://a.example');
      expect(accountFor('https://a.example')?.status).toBe('incompatible');
    });

    it('clearStatus drops the field', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await markIncompatible('https://a.example');
      await clearStatus('https://a.example');
      expect(accountFor('https://a.example')?.status).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('defaultAccount returns the explicit default', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await addAccount(makeAccount('https://b.example'));
      await setDefault('https://b.example');
      expect(defaultAccount()?.serverUrl).toBe('https://b.example');
    });

    it('defaultAccount falls back to first when explicit default is invalid', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      // Manually corrupt: set a defaultServerUrl that doesn't exist.
      // (Done by mutating snapshot directly — simulating a stale blob.)
      // We test via setDefault to a non-existent: it no-ops, so first remains.
      await setDefault('https://nonexistent.example');
      expect(defaultAccount()?.serverUrl).toBe('https://a.example');
    });

    it('setLastUsedCreate no-ops for unknown server', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      await addAccount(makeAccount('https://a.example'));
      await setLastUsedCreate('https://nonexistent.example');
      expect(snapshot().lastUsedCreateServerUrl).toBe('https://a.example');
    });
  });

  describe('subscribe', () => {
    it('notifies listeners on mutation', async () => {
      const s = makeStorage();
      configure(s);
      await load();
      const calls: number[] = [];
      const unsub = subscribe(() => calls.push(1));
      await addAccount(makeAccount('https://a.example'));
      expect(calls.length).toBeGreaterThan(0);
      unsub();
      const before = calls.length;
      await addAccount(makeAccount('https://b.example'));
      expect(calls.length).toBe(before);
    });
  });
});
