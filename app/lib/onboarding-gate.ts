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
