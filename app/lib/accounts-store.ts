/**
 * External (non-React) store for the multi-account blob.
 *
 * The blob is the source of truth for which servers the device is signed
 * into. React renders via `useSyncExternalStore` (see `accounts.tsx`).
 * `apiFor()` reads via `snapshot()` directly so non-React callers
 * (background work, deep-link handlers, the migration's placeholder
 * fill) can resolve a server's token without a React context.
 *
 * Schema: spec §5.
 */

import type { MigrationStorage } from './migrate-legacy-auth';
import { ACCOUNTS_KEY } from './migrate-legacy-auth';
import { evictServer } from './cache';

export type AddAccountMethod = 'magic_link' | 'google' | 'apple';

/**
 * Lazy analytics accessor. `analytics.ts` imports `react-native`, which
 * blows up the node-environment unit tests for this store unless we defer
 * the require until first call. The wrapper itself is no-op-by-default,
 * so callers don't need to know whether analytics is wired.
 */
function analyticsModule(): typeof import('./analytics') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./analytics') as typeof import('./analytics');
  } catch {
    return null;
  }
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  avatar_url?: string | null;
  /** Server-relative path to the user's avatar object, when uploaded. */
  avatar_object_url?: string | null;
}

export interface AccountInstanceInfo {
  mode: 'hosted' | 'selfhost';
  version: string;
  protocol_version: number;
  min_app_protocol: number;
  max_app_protocol: number;
  auth_methods: string[];
  features: Record<string, boolean>;
}

export type AccountStatus = 'ok' | 'reauth_required' | 'incompatible' | 'unreachable';

export interface Account {
  serverUrl: string;
  token: string;
  /**
   * Long-lived refresh token (default 1y, server-side revocable). Used to
   * silently mint a new access `token` when the short-lived one (24h) expires,
   * so the user stays signed in without re-authenticating. Optional: accounts
   * created before refresh tokens existed (or via the legacy single-token
   * sign-in) won't have one and fall back to full re-auth on expiry.
   */
  refreshToken?: string;
  user: AccountUser;
  instance: AccountInstanceInfo | null;
  addedAt: string;
  lastUsedAt: string;
  /**
   * Per spec §5: `reauth_required` and `incompatible` are persisted;
   * `unreachable` is per-fetch and not persisted (recomputed each session).
   */
  status?: 'reauth_required' | 'incompatible';
}

export interface AccountsBlob {
  version: 1;
  accounts: Account[];
  defaultServerUrl: string | null;
  lastUsedCreateServerUrl: string | null;
  /** ISO 4217 currency the home-screen hero aggregates into. Optional —
   *  when unset, the home aggregate falls back to the device-locale
   *  currency (resolved in `useHomeCurrency()`). See
   *  2026-05-24-home-currency-aggregation-design.md. */
  homeCurrency?: string;
}

const EMPTY: AccountsBlob = {
  version: 1,
  accounts: [],
  defaultServerUrl: null,
  lastUsedCreateServerUrl: null,
};

// --- internal mutable state ---

let blob: AccountsBlob = EMPTY;
let storage: MigrationStorage | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

// --- subscription / snapshot for useSyncExternalStore ---

export function snapshot(): AccountsBlob {
  return blob;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isLoaded(): boolean {
  return loaded;
}

/**
 * Wire the storage adapter. Idempotent. Must be called before `load()` and
 * before any mutation. The provider calls this once at boot.
 */
export function configure(s: MigrationStorage): void {
  storage = s;
}

export async function load(): Promise<void> {
  if (!storage) throw new Error('accounts-store: configure() not called');
  const raw = await storage.getItem(ACCOUNTS_KEY);
  if (raw === null) {
    blob = EMPTY;
  } else {
    try {
      const parsed = JSON.parse(raw) as AccountsBlob;
      // Defensive: if a future format ships, keep the loaded shape but
      // clamp unknown statuses back to ok-by-omission. We only persist
      // version 1 today.
      if (parsed.version !== 1) {
        // Forward-incompatible — leave as-is so a downgrade doesn't wipe
        // a user's data; but treat as empty for this session.
        blob = EMPTY;
      } else {
        blob = parsed;
      }
    } catch {
      blob = EMPTY;
    }
  }
  loaded = true;
  notify();
}

async function persist(next: AccountsBlob): Promise<void> {
  if (!storage) throw new Error('accounts-store: configure() not called');
  blob = next;
  notify();
  // Persist after notify so React re-renders don't block on disk I/O.
  await storage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
}

// --- mutations ---

export function accountFor(serverUrl: string): Account | null {
  return blob.accounts.find((a) => a.serverUrl === serverUrl) ?? null;
}

export function defaultAccount(): Account | null {
  if (!blob.defaultServerUrl) return blob.accounts[0] ?? null;
  return accountFor(blob.defaultServerUrl) ?? blob.accounts[0] ?? null;
}

export async function addAccount(
  account: Account,
  method?: AddAccountMethod,
): Promise<void> {
  const preCount = blob.accounts.length;
  const existing = blob.accounts.findIndex((a) => a.serverUrl === account.serverUrl);
  const accounts = [...blob.accounts];
  if (existing >= 0) {
    accounts[existing] = account;
  } else {
    accounts.push(account);
  }
  await persist({
    ...blob,
    accounts,
    defaultServerUrl: blob.defaultServerUrl ?? account.serverUrl,
    lastUsedCreateServerUrl: blob.lastUsedCreateServerUrl ?? account.serverUrl,
  });

  // Analytics: fire-and-forget. Wrapper swallows errors and no-ops when the
  // PostHog API key isn't set, so this is safe to call unconditionally.
  const analytics = analyticsModule();
  if (analytics) {
    if (preCount === 0) {
      // First account on this device — identify the install.
      void analytics.identify(account.user.id, account.serverUrl);
    }
    const accountIndex = existing >= 0 ? existing : accounts.length - 1;
    analytics.track('auth_completed', {
      method,
      account_index: accountIndex,
    });
  }
}

export async function removeAccount(serverUrl: string): Promise<void> {
  const accounts = blob.accounts.filter((a) => a.serverUrl !== serverUrl);
  const fallback = accounts[0]?.serverUrl ?? null;
  await persist({
    ...blob,
    accounts,
    defaultServerUrl:
      blob.defaultServerUrl === serverUrl ? fallback : blob.defaultServerUrl,
    lastUsedCreateServerUrl:
      blob.lastUsedCreateServerUrl === serverUrl ? fallback : blob.lastUsedCreateServerUrl,
  });
  await evictServer(serverUrl);
}

export async function updateAccount(
  serverUrl: string,
  patch: Partial<Omit<Account, 'serverUrl'>>,
): Promise<void> {
  const accounts = blob.accounts.map((a) =>
    a.serverUrl === serverUrl ? { ...a, ...patch } : a,
  );
  await persist({ ...blob, accounts });
}

export async function setDefault(serverUrl: string): Promise<void> {
  if (!accountFor(serverUrl)) return;
  await persist({ ...blob, defaultServerUrl: serverUrl });
}

export async function setLastUsedCreate(serverUrl: string): Promise<void> {
  if (!accountFor(serverUrl)) return;
  await persist({ ...blob, lastUsedCreateServerUrl: serverUrl });
}

export async function setHomeCurrency(currency: string | null): Promise<void> {
  if (currency != null) {
    // ISO 4217 is 3 uppercase letters; reject anything that obviously isn't
    // one so we never persist garbage that breaks downstream rate lookups.
    if (!/^[A-Z]{3}$/.test(currency)) return;
  }
  await persist({ ...blob, homeCurrency: currency ?? undefined });
}

export async function markReauthRequired(serverUrl: string): Promise<void> {
  await updateAccount(serverUrl, { status: 'reauth_required' });
}

export async function markIncompatible(serverUrl: string): Promise<void> {
  await updateAccount(serverUrl, { status: 'incompatible' });
}

export async function clearStatus(serverUrl: string): Promise<void> {
  const a = accountFor(serverUrl);
  if (!a) return;
  const { status: _drop, ...rest } = a;
  await updateAccount(serverUrl, { ...rest, status: undefined });
}

/** Test-only: reset the module-level state. */
export function __resetForTests(): void {
  blob = EMPTY;
  storage = null;
  loaded = false;
  listeners.clear();
}
