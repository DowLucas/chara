/**
 * Side-effecting dispatcher for `InviteIntent` (spec §10, Wave 6).
 *
 * Separate from `invite-handler.ts` so the classifier stays free of RN
 * imports and is testable without a jest transform on `react-native`.
 *
 * Every non-invalid intent routes to the join-confirmation screen
 * (`app/join/[server]/[token].tsx`) — that's the one place where preview,
 * sign-in handoff, and actual join all live.
 */

import { router } from 'expo-router';
import type { InviteIntent } from './invite-handler';

export type DispatchResult =
  /** Caller should surface a parse-error toast. */
  | { kind: 'invalid'; reason: string }
  /** Handled — navigation fired. */
  | { kind: 'handled' };

/**
 * Where the dispatch was triggered from. Retained for callers (onboarding
 * scanner passes `'onboarding'`); analytics on the join itself now fire
 * from the confirmation screen.
 */
export type DispatchSource = 'onboarding' | 'deep_link' | 'scanner';

// `replace` (not `push`) so we don't leave a QR-scanner modal or universal
// link trampoline in the back stack — the join-confirmation screen becomes
// the active route, and once the user joins (or cancels) they drop back to
// whatever was under the scanner/trampoline.
function pushConfirm(serverUrl: string, token: string): DispatchResult {
  router.replace(`/join/${encodeURIComponent(serverUrl)}/${encodeURIComponent(token)}`);
  return { kind: 'handled' };
}

export async function dispatchInviteIntent(
  intent: InviteIntent,
  _source?: DispatchSource,
): Promise<DispatchResult> {
  switch (intent.kind) {
    case 'invalid':
      return { kind: 'invalid', reason: intent.reason };
    case 'join-with-account':
    case 'choose-account':
    case 'add-account-then-join':
      return pushConfirm(intent.serverUrl, intent.token);
  }
}
