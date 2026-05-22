/**
 * Pure / React-free internals for `aggregated-reads.ts`.
 *
 * Split out so that the helpers (filter, dedup map, key builder) can be
 * exercised in jest without pulling in `react-native` (no RTL is wired
 * up in this repo).
 */

import type { Account } from './accounts-store';
import type { CacheKey } from './cache';

export type ReadStatus = 'idle' | 'loading' | 'ok' | 'error';
export type Endpoint = 'groups' | 'balances' | 'activity';

export interface AccountRead<T> {
  serverUrl: string;
  user: Account['user'];
  status: ReadStatus;
  data: T | null;
  error: Error | null;
  /** True when `data` came from cache and a refresh is in flight (or pending). */
  stale: boolean;
}

/** Minimum interval (ms) between automatic refreshes triggered by foregrounding. */
export const REFRESH_FLOOR_MS = 60_000;

// --- filter helpers ------------------------------------------------------

/**
 * Accounts excluded from fan-out per spec §9 / §12. They still appear in
 * the returned array (with status: 'idle') so the screen can render the
 * "re-auth needed" / "version mismatch" strip rows.
 */
export function isQueryable(account: Account): boolean {
  return account.status !== 'reauth_required' && account.status !== 'incompatible';
}

export function filterQueryableAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isQueryable);
}

// --- dedup map -----------------------------------------------------------

const inflight = new Map<string, Promise<unknown>>();

export function dedupKey(serverUrl: string, endpoint: Endpoint): string {
  return `${serverUrl}::${endpoint}`;
}

/**
 * Run `factory` for `(serverUrl, endpoint)` unless another caller is
 * already fetching it; in that case, await the existing in-flight
 * promise and return its value.
 */
export async function getOrFetch<T>(
  serverUrl: string,
  endpoint: Endpoint,
  factory: () => Promise<T>,
): Promise<T> {
  const key = dedupKey(serverUrl, endpoint);
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = factory().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** Test-only: clear the dedup map. */
export function __resetInflightForTests(): void {
  inflight.clear();
}

// --- initial read shape + cache key --------------------------------------

export function initialRead<T>(a: Account): AccountRead<T> {
  return {
    serverUrl: a.serverUrl,
    user: a.user,
    status: 'idle',
    data: null,
    error: null,
    stale: false,
  };
}

export function cacheKeyFor(account: Account, endpoint: Endpoint): CacheKey | null {
  // Spec §12: cache is keyed by `(serverUrl, userId, endpoint)`. A
  // placeholder account (post-migration, pre-/api/me-fill) has an empty
  // user id — skip the cache in that case so we don't store under "".
  if (!account.user.id) return null;
  return { serverUrl: account.serverUrl, userId: account.user.id, endpoint };
}
