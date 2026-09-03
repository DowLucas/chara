/**
 * React binding for `resolveSummaryServer`.
 *
 * The read is LIVE — `/.well-known/chara-instance` on demand, the same thing
 * add-expense.tsx and settle.tsx do for `ocr`, `voice_expense` and
 * `settle_reminders`. It must NOT come from the cached `account.instance`
 * blob: that is only ever written at sign-in, so every user already signed
 * in when the monthly summary shipped would carry a snapshot with no
 * `monthly_summary` key and would never see the entry point. On iOS the
 * accounts blob lives in the Keychain and survives reinstall, so it would
 * stay hidden indefinitely. `api.ts` caches the well-known per session, so
 * this costs one request per launch.
 */

import { useEffect, useState } from 'react';

import { apiFor } from './api';
import { useAccounts } from './accounts';
import { resolveSummaryServer } from './summary-server';

/**
 * The server whose monthly summary the user can open, or null while the
 * probe is in flight or when no server offers one. Null-until-known on
 * purpose: rendering nothing beats flashing a row that then disappears.
 */
export function useSummaryServerUrl(): string | null {
  const { accounts } = useAccounts();
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  // Re-probe when the set of linked servers changes, not on every render
  // that hands back a new accounts array.
  const key = accounts.map((a) => a.serverUrl).join('|');

  useEffect(() => {
    let cancelled = false;
    resolveSummaryServer(accounts, (url) => apiFor(url).instanceInfo())
      .then((found) => {
        if (!cancelled) setServerUrl(found);
      })
      .catch(() => {
        if (!cancelled) setServerUrl(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return serverUrl;
}
