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

export async function addAccount(account: Account): Promise<void> {
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
