/**
 * Which linked server, if any, has a monthly summary to show.
 *
 * Pure: no React, no api client, no accounts store — the hook that binds it
 * to both lives in `use-summary-server.ts`, mirroring the
 * resolve-home-currency / use-home-currency split. Keeping the decision here
 * is what makes it testable, since this project does no render testing.
 *
 * The feature is hosted-only, so at most one account normally qualifies.
 * Availability comes from the server's advertised `features` rather than
 * from "is this the hosted URL", so a self-hoster who later enables it is
 * picked up for free and a backend predating the feature reads as
 * unsupported instead of being offered a screen that 404s.
 */

import { summaryServerUrl } from './summary-view';

/** The slice of the instance payload this decision needs. */
export interface InstanceFeatureProbe {
  features?: { monthly_summary?: boolean } | null;
}

export type FetchInstance = (serverUrl: string) => Promise<InstanceFeatureProbe>;

/**
 * Probe every linked server and return the first (in account order) that
 * advertises the monthly summary, or null.
 *
 * `Promise.allSettled`, never `Promise.all`: one unreachable server must not
 * hide a summary another server does have.
 */
export async function resolveSummaryServer(
  accounts: { serverUrl: string }[],
  fetchInstance: FetchInstance,
): Promise<string | null> {
  if (accounts.length === 0) return null;

  const settled = await Promise.allSettled(
    accounts.map((a) => fetchInstance(a.serverUrl)),
  );

  // Rebuild the shape summaryServerUrl already understands, preserving
  // account order so the answer is stable rather than whichever server
  // happened to answer first.
  const probed = accounts.map((a, i) => {
    const r = settled[i];
    const features = r.status === 'fulfilled' ? (r.value?.features ?? null) : null;
    return { serverUrl: a.serverUrl, instance: features ? { features } : null };
  });
  return summaryServerUrl(probed);
}
