/**
 * Pure decision for the tabs layout's "no groups yet → onboarding" gate.
 *
 * Input is the aggregated per-account groups reads (`useAggregatedGroups`).
 * The critical rule: a failed fetch is *unknown*, not "zero groups" — an
 * offline cold launch must never dump a signed-in user into onboarding.
 */
export interface GroupsGateRead {
  status: 'idle' | 'loading' | 'ok' | 'error';
  data: unknown[] | null;
}

export type GroupsGateDecision = 'pending' | 'tabs' | 'onboarding';

/**
 * Whether a signed-in user must still complete the name step before entering
 * the app. Name is the only required profile field — phone is optional (it
 * only powers Swish/Vipps settle deep-links; Apple 5.1.1(v): don't gate on
 * info the core app doesn't need). Kept consistent with `onboarding/name.tsx`
 * (`canSubmit`) and `onboarding/_layout.tsx` (`missingName`).
 */
export function needsNameStep(user: {
  name?: string | null;
  // Accepted but intentionally ignored — phone never gates entry.
  phone?: string | null;
}): boolean {
  return !user.name?.trim();
}

export function decideGroupsGate(reads: GroupsGateRead[]): GroupsGateDecision {
  // Any account with groups (live or cached/stale) → straight to tabs.
  if (reads.some((r) => (r.data?.length ?? 0) > 0)) return 'tabs';
  // Nothing started yet (first frame, or accounts still hydrating) → hold.
  if (reads.length === 0 || reads.every((r) => r.status === 'idle')) {
    return 'pending';
  }
  // Something still in flight with no data → hold to avoid a redirect flash.
  if (reads.some((r) => r.status === 'loading')) return 'pending';
  // Every account definitively answered with zero groups → onboarding.
  if (reads.every((r) => r.status === 'ok')) return 'onboarding';
  // Some account errored (offline?) or is unqueryable (reauth/incompatible):
  // group coverage is unknown — render tabs; screens handle their own
  // offline/cache states.
  return 'tabs';
}
