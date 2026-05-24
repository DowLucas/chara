/**
 * React surface over the external accounts store.
 *
 *   useAccounts()              — list + default + mutators
 *   useAccount(serverUrl)      — one account by URL
 *   useDefaultAccount()        — convenience: the default-server account
 *   useAuth()                  — DEPRECATED backward-compat shim for the
 *                                single-account `app/lib/auth.tsx` API.
 *                                Resolves to the default account. Removed
 *                                in the route-refactor wave once every
 *                                call site routes through useAccount(serverUrl).
 *
 * The store is in `accounts-store.ts` and lives outside React so that
 * non-React callers (the future `apiFor(serverUrl)` factory, deep-link
 * handlers) can resolve a token without a context.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  Account,
  AccountsBlob,
  accountFor,
  addAccount as storeAddAccount,
  configure,
  defaultAccount as storeDefaultAccount,
  isLoaded,
  load,
  removeAccount as storeRemoveAccount,
  setDefault as storeSetDefault,
  setHomeCurrency as storeSetHomeCurrency,
  setLastUsedCreate as storeSetLastUsedCreate,
  snapshot,
  subscribe,
  updateAccount as storeUpdateAccount,
} from './accounts-store';
import { blobStorage } from './blob-storage';
import { migrateLegacyAuth } from './migrate-legacy-auth';
import { legacyHostedUrl } from './legacy-hosted-url';
import { ApiError, BASE_URL, getMe, setToken as setLegacyToken, clearToken as clearLegacyToken } from './api';

interface AccountsState {
  accounts: Account[];
  defaultAccount: Account | null;
  defaultServerUrl: string | null;
  lastUsedCreateServerUrl: string | null;
  /** ISO 4217 currency for the home-screen aggregate, or null if unset. */
  homeCurrency: string | null;
  loading: boolean;
  accountFor: (serverUrl: string) => Account | null;
  addAccount: (account: Account) => Promise<void>;
  removeAccount: (serverUrl: string) => Promise<void>;
  updateAccount: (serverUrl: string, patch: Partial<Account>) => Promise<void>;
  setDefault: (serverUrl: string) => Promise<void>;
  setLastUsedCreate: (serverUrl: string) => Promise<void>;
  setHomeCurrency: (currency: string | null) => Promise<void>;
}

const AccountsContext = createContext<AccountsState | null>(null);

function useBlob(): AccountsBlob {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function useLoaded(): boolean {
  // isLoaded() is a module-level flag that flips once on first load().
  // We re-read it on every store notification.
  return useSyncExternalStore(subscribe, isLoaded, isLoaded);
}

export function AccountsProvider({ children }: { children: React.ReactNode }) {
  // Configure + run migration + initial load. Runs exactly once per app
  // launch (the effect has no deps; the underlying functions are
  // idempotent so a Fast-Refresh double-mount is harmless).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      configure(blobStorage);
      // Migration is a no-op if the blob already exists (per spec §11).
      // The deps here mirror the legacy single-token resolution that
      // existed in app/lib/api.ts.
      await migrateLegacyAuth({
        storage: blobStorage,
        legacyHostedUrl,
        nowIso: () => new Date().toISOString(),
      });
      if (cancelled) return;
      await load();
      // Opportunistically fill placeholder user(s) — spec §11 step 5.
      // Failures surface as the standard per-account error UI later;
      // we don't block here.
      const def = storeDefaultAccount();
      if (def && (def.user.id === '' || def.user.email === '')) {
        try {
          const fresh = await getMe();
          await storeUpdateAccount(def.serverUrl, { user: fresh });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            // Spec §11: revoked legacy token → reauth_required, account stays.
            await storeUpdateAccount(def.serverUrl, { status: 'reauth_required' });
          }
          // Other errors: leave placeholder; the per-account error strip
          // / refresh path will retry later.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blob = useBlob();
  const loading = !useLoaded();

  const value = useMemo<AccountsState>(() => {
    const def = blob.defaultServerUrl
      ? blob.accounts.find((a) => a.serverUrl === blob.defaultServerUrl) ?? blob.accounts[0] ?? null
      : blob.accounts[0] ?? null;
    return {
      accounts: blob.accounts,
      defaultAccount: def,
      defaultServerUrl: blob.defaultServerUrl,
      lastUsedCreateServerUrl: blob.lastUsedCreateServerUrl,
      homeCurrency: blob.homeCurrency ?? null,
      loading,
      accountFor,
      addAccount: storeAddAccount,
      removeAccount: storeRemoveAccount,
      updateAccount: storeUpdateAccount,
      setDefault: storeSetDefault,
      setLastUsedCreate: storeSetLastUsedCreate,
      setHomeCurrency: storeSetHomeCurrency,
    };
  }, [blob, loading]);

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsState {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error('useAccounts must be used inside AccountsProvider');
  return ctx;
}

export function useAccount(serverUrl: string | null | undefined): Account | null {
  const { accounts } = useAccounts();
  if (!serverUrl) return null;
  return accounts.find((a) => a.serverUrl === serverUrl) ?? null;
}

export function useDefaultAccount(): Account | null {
  return useAccounts().defaultAccount;
}

// --- Backward-compat `useAuth()` shim ----------------------------------
//
// Spec §17 deletes auth.tsx as part of the route refactor (Wave 2D). Until
// then, every existing `useAuth()` call site resolves to the *default*
// account. New code MUST NOT consume this — use useAccount(serverUrl) or
// useDefaultAccount() directly.

interface LegacyAuthState {
  user: Account['user'] | null;
  token: string | null;
  loading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: Account['user']) => void;
  refreshUser: () => Promise<Account['user'] | null>;
}

export function useAuth(): LegacyAuthState {
  const { defaultAccount, loading, addAccount, removeAccount, updateAccount, accounts } =
    useAccounts();

  const signIn = useCallback(
    async (token: string) => {
      // The legacy sign-in screen only knows about the hosted server.
      // We persist the token in the existing SecureStore key too, so the
      // legacy api.ts request() helper (which reads from that key) keeps
      // working through Waves 2C–2D.
      await setLegacyToken(token);
      const serverUrl = legacyHostedUrl();
      // Fetch /api/me using the just-set legacy token.
      let user: Account['user'] = { id: '', email: '', name: '', phone: '', avatar_url: null };
      try {
        user = await getMe();
      } catch {
        /* leave placeholder; refresh path handles it */
      }
      await addAccount({
        serverUrl,
        token,
        user,
        instance: null,
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      });
    },
    [addAccount],
  );

  const signOut = useCallback(async () => {
    await clearLegacyToken();
    // "Sign out" in single-account land == sign out of everything.
    for (const a of accounts) {
      await removeAccount(a.serverUrl);
    }
  }, [accounts, removeAccount]);

  const setUser = useCallback(
    (user: Account['user']) => {
      if (!defaultAccount) return;
      void updateAccount(defaultAccount.serverUrl, { user });
    },
    [defaultAccount, updateAccount],
  );

  const refreshUser = useCallback(async () => {
    if (!defaultAccount) return null;
    try {
      const fresh = await getMe();
      await updateAccount(defaultAccount.serverUrl, { user: fresh });
      return fresh;
    } catch {
      return null;
    }
  }, [defaultAccount, updateAccount]);

  return {
    user: defaultAccount?.user ?? null,
    token: defaultAccount?.token ?? null,
    loading,
    signIn,
    signOut,
    setUser,
    refreshUser,
  };
}

// Compatibility re-export so `import { AuthProvider } from '@/lib/auth'`
// keeps working during the transition. The Wave 2D refactor flips imports
// to AccountsProvider directly.
export const AuthProvider = AccountsProvider;

// Re-export BASE_URL so any caller that needs a default URL (legacy
// sign-in, etc.) can find it through the same module that holds the
// hosted-URL helper.
export { BASE_URL };
