/**
 * React binding for `resolveFeatureServer`.
 *
 * The read is LIVE — `/.well-known/chara-instance` on demand, the same thing
 * add-expense.tsx and settle.tsx do for `ocr`, `voice_expense` and
 * `settle_reminders`. It must NOT come from the cached `account.instance`
 * blob: that is only ever written at sign-in, so every user already signed
 * in when a feature shipped would carry a snapshot with no flag for it and
 * would never see the entry point. On iOS the accounts blob lives in the
 * Keychain and survives reinstall, so it would stay hidden indefinitely.
 *
 * `apiFor(url).instanceInfo()` is NOT cached — the session cache in `api.ts`
 * belongs to the legacy flat `getInstanceInfo()`. Every mount of a screen
 * using this costs one request per linked account, so a screen that already
 * knows its server (because the row that opened it resolved one) should take
 * it as a route param rather than probe again.
 */

import { useEffect, useState } from 'react';

import { apiFor } from './api';
import { useAccounts } from './accounts';
import { resolveFeatureServer, type GatedFeature } from './feature-server';

/**
 * `probing` until every server has answered; then `ok` with a server, `none`
 * when nobody offers the feature, or `error` when no server could be reached
 * at all. An entry point distinguishes only "show the row or not", but a
 * screen must be able to tell "still asking" from "there is nobody to ask" —
 * folding those together leaves a form that can never submit and never says
 * why.
 */
export type FeatureServerStatus = 'probing' | 'ok' | 'none' | 'error';

export interface FeatureServer {
  serverUrl: string | null;
  status: FeatureServerStatus;
}

export function useFeatureServer(feature: GatedFeature): FeatureServer {
  const { accounts } = useAccounts();
  const [state, setState] = useState<FeatureServer>({ serverUrl: null, status: 'probing' });
  // Re-probe when the set of linked servers changes, not on every render
  // that hands back a new accounts array.
  const key = accounts.map((a) => a.serverUrl).join('|');

  useEffect(() => {
    let cancelled = false;
    setState({ serverUrl: null, status: 'probing' });
    resolveFeatureServer(accounts, (url) => apiFor(url).instanceInfo(), feature)
      .then((found) => {
        if (cancelled) return;
        setState({ serverUrl: found, status: found ? 'ok' : 'none' });
      })
      .catch(() => {
        // resolveFeatureServer swallows per-server failures, so reaching here
        // means the resolution itself broke, not that a server was down.
        if (!cancelled) setState({ serverUrl: null, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, feature]);

  return state;
}

/**
 * The server offering `feature`, or null while the probe is in flight or
 * when no server offers it. Null-until-known on purpose: rendering nothing
 * beats flashing a row that then disappears. Entry points want this; a
 * screen that has to explain itself wants `useFeatureServer`.
 */
export function useFeatureServerUrl(feature: GatedFeature): string | null {
  return useFeatureServer(feature).serverUrl;
}

/** The server whose monthly summary the user can open, or null. */
export function useSummaryServerUrl(): string | null {
  return useFeatureServerUrl('monthly_summary');
}
