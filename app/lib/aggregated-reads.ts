/**
 * Aggregated reads across every linked server-account (spec §12).
 *
 *   useAggregatedGroups()    — every account's /api/groups, merged
 *   useAggregatedBalances()  — every account's /api/me/balances
 *   useAggregatedActivity()  — every account's /api/me/activity
 *
 * Each hook fans out via `Promise.allSettled`, surfaces per-account
 * status, and tolerates partial failure. The two cold-start endpoints
 * (groups list, balances) are stale-while-revalidate via the
 * `(serverUrl, userId, endpoint)` cache helper. Activity is online-only
 * — the spec only persists the cold-start endpoints.
 *
 * Hooks are safe to mount from multiple components: in-flight fetches
 * are deduplicated by `(serverUrl, endpoint)` via a module-level map
 * in `aggregated-reads-internal.ts`.
 *
 * Accounts in `reauth_required` or `incompatible` status are filtered
 * out before fan-out (spec §9 / §12) — they still appear in the result
 * array with `status: 'idle'` so the consumer screen can render error
 * strips / re-auth chips.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { apiFor, ActivityEvent, Group, MyBalance } from './api';
import { useAccounts } from './accounts';
import { readCache, writeCache } from './cache';
import {
  AccountRead,
  Endpoint,
  REFRESH_FLOOR_MS,
  cacheKeyFor,
  filterQueryableAccounts,
  getOrFetch,
  initialRead,
  isQueryable,
} from './aggregated-reads-internal';

export type { AccountRead, ReadStatus, Endpoint } from './aggregated-reads-internal';
export { REFRESH_FLOOR_MS } from './aggregated-reads-internal';

type Fetcher<T> = (serverUrl: string) => Promise<T>;

// Module-level pub/sub so any component (e.g. the home pull-to-refresh)
// can force every mounted aggregated-read hook to refetch immediately.
// No floor, no AppState dance — explicit user intent.
const refreshListeners = new Set<() => void>();

/** Imperatively refresh every mounted aggregated-read hook. Used by the
 *  home pull-to-refresh and any mutator that wants the next render to
 *  reflect freshly-fetched server state without waiting for AppState. */
export function refreshAggregatedReads(): void {
  for (const l of refreshListeners) l();
}

/**
 * Shared implementation for all three aggregated-read hooks.
 *
 * `cacheable` toggles SWR: when true, the hook hydrates each account
 * from `readCache(...)` on mount and writes back on success. When
 * false (activity feed), the cache layer is bypassed entirely.
 */
function useAggregated<T>(
  endpoint: Endpoint,
  fetcher: Fetcher<T>,
  cacheable: boolean,
): AccountRead<T>[] {
  const { accounts } = useAccounts();
  const [reads, setReads] = useState<AccountRead<T>[]>(() =>
    accounts.map((a) => initialRead<T>(a)),
  );
  const lastRefreshRef = useRef<number>(0);
  // Bump to force-refresh from the AppState handler / Retry callbacks.
  const [refreshTick, setRefreshTick] = useState(0);

  // Keep `reads` aligned with the set of accounts. Carry over existing
  // data when an account is still present so a status change doesn't
  // reset prior good data.
  useEffect(() => {
    setReads((prev) => {
      const byUrl = new Map(prev.map((r) => [r.serverUrl, r]));
      return accounts.map((a) => byUrl.get(a.serverUrl) ?? initialRead<T>(a));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map((a) => a.serverUrl).join('|')]);

  // Hydrate from cache + fire live fetch.
  useEffect(() => {
    let cancelled = false;

    const queryable = filterQueryableAccounts(accounts);

    // Mark non-queryable accounts as idle (so the strip can render).
    setReads((prev) =>
      prev.map((r) => {
        const a = accounts.find((x) => x.serverUrl === r.serverUrl);
        if (!a) return r;
        if (!isQueryable(a)) {
          return { ...r, status: 'idle', stale: false };
        }
        return r;
      }),
    );

    for (const account of queryable) {
      void (async () => {
        if (cacheable) {
          const key = cacheKeyFor(account, endpoint);
          if (key) {
            try {
              const cached = await readCache<T>(key);
              if (!cancelled && cached) {
                setReads((prev) =>
                  prev.map((r) =>
                    r.serverUrl === account.serverUrl
                      ? { ...r, status: 'ok', data: cached.value, error: null, stale: true }
                      : r,
                  ),
                );
              }
            } catch {
              /* cache miss / corruption is silent — live fetch follows */
            }
          }
        }

        if (!cancelled) {
          setReads((prev) =>
            prev.map((r) =>
              r.serverUrl === account.serverUrl
                ? { ...r, status: r.data == null ? 'loading' : r.status }
                : r,
            ),
          );
        }

        try {
          const value = await getOrFetch(account.serverUrl, endpoint, () =>
            fetcher(account.serverUrl),
          );
          if (cancelled) return;
          if (cacheable) {
            const key = cacheKeyFor(account, endpoint);
            if (key) {
              void writeCache(key, value);
            }
          }
          setReads((prev) =>
            prev.map((r) =>
              r.serverUrl === account.serverUrl
                ? { ...r, status: 'ok', data: value, error: null, stale: false }
                : r,
            ),
          );
        } catch (err) {
          if (cancelled) return;
          setReads((prev) =>
            prev.map((r) =>
              r.serverUrl === account.serverUrl
                ? {
                    ...r,
                    status: 'error',
                    error: err instanceof Error ? err : new Error(String(err)),
                    // Keep prior `data` so the screen can render last-known-good.
                    stale: r.data != null,
                  }
                : r,
            ),
          );
        }
      })();
    }

    lastRefreshRef.current = Date.now();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    accounts.map((a) => `${a.serverUrl}:${a.status ?? 'ok'}`).join('|'),
    refreshTick,
  ]);

  // Foreground refresh: spec §12, 60s floor.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      const since = Date.now() - lastRefreshRef.current;
      if (since < REFRESH_FLOOR_MS) return;
      setRefreshTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // Imperative pull-to-refresh: subscribe to the module bus so external
  // callers (HomeScreen's RefreshControl, mutators) can force a refetch.
  useEffect(() => {
    const listener = () => setRefreshTick((n) => n + 1);
    refreshListeners.add(listener);
    return () => {
      refreshListeners.delete(listener);
    };
  }, []);

  // In-app navigation refresh: when the screen consuming this hook is
  // re-focused (e.g. after creating a group, joining via QR, settling),
  // force a refresh. No floor — the user explicitly came back, the data
  // they expect to see may have just changed because of their own action.
  // Skips the first focus (initial mount already fetched).
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      setRefreshTick((n) => n + 1);
    }, []),
  );

  return reads;
}

// --- public hooks ---------------------------------------------------------

export function useAggregatedGroups(): AccountRead<Group[]>[] {
  return useAggregated<Group[]>(
    'groups',
    (serverUrl) => apiFor(serverUrl).listGroups(),
    true,
  );
}

export function useAggregatedBalances(): AccountRead<MyBalance[]>[] {
  return useAggregated<MyBalance[]>(
    'balances',
    (serverUrl) => apiFor(serverUrl).listMyBalances(),
    true,
  );
}

export function useAggregatedActivity(limit = 50): AccountRead<ActivityEvent[]>[] {
  return useAggregated<ActivityEvent[]>(
    'activity',
    (serverUrl) => apiFor(serverUrl).listMyActivity(limit),
    false,
  );
}

/**
 * Per-account `/api/me/net?in=<currency>` fan-out. Each row carries the
 * server's locked-in historical-FX aggregate in `homeCurrency`. The
 * caller sums `net_minor` across rows for the cross-server total.
 *
 * Keyed on `homeCurrency` so switching home in You-tab refetches all
 * accounts instead of showing stale per-server numbers.
 */
export function useAggregatedMyNet(
  homeCurrency: string,
): AccountRead<import('./api').MyNetResponse>[] {
  return useAggregated<import('./api').MyNetResponse>(
    `mynet:${homeCurrency}`,
    (serverUrl) => apiFor(serverUrl).getMyNet(homeCurrency),
    true,
  );
}
