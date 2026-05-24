/**
 * React hook wrapper around `resolveHomeCurrency()`. Reads from the
 * accounts blob, expo-localization, and the aggregated-groups cache;
 * delegates the precedence rules to the pure resolver in
 * `resolve-home-currency.ts`.
 *
 * The caller persists explicit choices via `setHomeCurrency()` from
 * `useAccounts()`.
 */

import { useMemo } from 'react';
import { getLocales } from 'expo-localization';
import { useAccounts } from './accounts';
import { useAggregatedGroups } from './aggregated-reads';
import {
  resolveHomeCurrency,
  type ResolvedHomeCurrency,
} from './resolve-home-currency';

function localeCurrency(): string | null {
  try {
    const locales = getLocales();
    return locales[0]?.currencyCode ?? null;
  } catch {
    return null;
  }
}

export function useHomeCurrency(): ResolvedHomeCurrency {
  const { homeCurrency, defaultAccount } = useAccounts();
  const groupReads = useAggregatedGroups();

  const defaultAccountFirstGroupCurrency = useMemo(() => {
    if (!defaultAccount) return null;
    for (const r of groupReads) {
      if (r.serverUrl !== defaultAccount.serverUrl) continue;
      const first = r.data?.[0];
      return first?.currency ?? null;
    }
    return null;
  }, [defaultAccount, groupReads]);

  return useMemo(
    () =>
      resolveHomeCurrency({
        explicit: homeCurrency ?? null,
        localeCurrency: localeCurrency(),
        defaultAccountFirstGroupCurrency,
      }),
    [homeCurrency, defaultAccountFirstGroupCurrency],
  );
}
