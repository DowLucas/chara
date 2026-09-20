/**
 * Which linked server, if any, offers a given optional feature.
 *
 * Pure: no React, no api client, no accounts store — the hook that binds it
 * to both lives in `use-feature-server.ts`, mirroring the
 * resolve-home-currency / use-home-currency split. Keeping the decision here
 * is what makes it testable, since this project does no render testing.
 *
 * These features are hosted-only, so at most one account normally qualifies.
 * Availability comes from the server's advertised `features` rather than
 * from "is this the hosted URL", so a self-hoster who later enables one is
 * picked up for free and a backend predating the feature reads as
 * unsupported instead of being offered a screen that 404s.
 */

/** The optional features a screen can be gated on. */
export type GatedFeature = 'monthly_summary' | 'feedback';

/** The slice of the instance payload this decision needs. */
export interface InstanceFeatureProbe {
  features?: Partial<Record<GatedFeature, boolean>> | null;
}

export type FetchInstance = (serverUrl: string) => Promise<InstanceFeatureProbe>;

/**
 * Probe every linked server and return the first (in account order) that
 * advertises `feature`, or null.
 *
 * `Promise.allSettled`, never `Promise.all`: one unreachable server must not
 * hide a feature another server does have.
 */
export async function resolveFeatureServer(
  accounts: { serverUrl: string }[],
  fetchInstance: FetchInstance,
  feature: GatedFeature,
): Promise<string | null> {
  if (accounts.length === 0) return null;

  const settled = await Promise.allSettled(
    accounts.map((a) => fetchInstance(a.serverUrl)),
  );

  // Account order, not answer order, so the result is stable rather than
  // whichever server happened to answer first. A flag that is absent (an
  // older backend) reads as unsupported, never as truthy.
  for (let i = 0; i < accounts.length; i++) {
    const r = settled[i];
    if (r.status !== 'fulfilled') continue;
    if (r.value?.features?.[feature] === true) return accounts[i].serverUrl;
  }
  return null;
}
