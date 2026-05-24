/**
 * Pure aggregation helper for the home-screen cross-currency net hero.
 *
 * Each linked account's `/api/me/net?in=<home>` returns the server's
 * locked-in historical-FX sum in the requested home currency. The home
 * screen fans these out via `useAggregatedMyNet(homeCurrency)` and then
 * sums them with this helper.
 *
 * Spec: docs/superpowers/specs/2026-05-24-home-currency-aggregation-design.md.
 */

import type { MyNetResponse } from './api';
import { decimalToMinor } from './money-utils';

export interface MyNetRead {
  serverUrl: string;
  data: MyNetResponse | null;
}

export interface AggregatedHomeNet {
  /** Sum of every contributing account's `net_minor`, in minor units. */
  minor: number;
  /** Sum of every contributing account's `estimated_legs`. */
  estimatedLegs: number;
  /** Accounts that returned data. */
  okAccounts: number;
  /** Total accounts the home screen knows about (`accounts.length`). */
  totalAccounts: number;
  /** `totalAccounts - okAccounts` — accounts whose read failed or hasn't
   *  resolved. Drives the "(partial)" caveat in the info sheet. */
  skippedAccounts: number;
}

export function aggregateMyNetReads(
  reads: MyNetRead[],
  totalAccounts: number,
): AggregatedHomeNet | null {
  let minor = 0;
  let estimatedLegs = 0;
  let okAccounts = 0;
  let anyData = false;
  for (const r of reads) {
    if (!r.data) continue;
    anyData = true;
    okAccounts++;
    minor += decimalToMinor(r.data.net_minor);
    estimatedLegs += r.data.estimated_legs;
  }
  if (!anyData) return null;
  return {
    minor,
    estimatedLegs,
    okAccounts,
    totalAccounts,
    skippedAccounts: totalAccounts - okAccounts,
  };
}
