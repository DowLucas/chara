/**
 * Side-effecting dispatcher for `InviteIntent` (spec §10, Wave 6).
 *
 * Separate from `invite-handler.ts` so the classifier stays free of RN
 * imports and is testable without a jest transform on `react-native`.
 *
 * Safe to call from any context (hook or not). Translations resolve via
 * the global `i18n` instance — the deep-link handler runs outside React.
 */

import { router } from 'expo-router';
import i18n from './i18n';
import { showAlert } from './app-alert';
import * as analytics from './analytics';
import { apiFor, ApiError, publicApi } from './api';
import { runDiscoveryHandshake } from './discovery';
import { checkProtocolCompat } from './protocol';
import type { InviteIntent } from './invite-handler';

export type DispatchResult =
  /** Caller should surface a parse-error toast. */
  | { kind: 'invalid'; reason: string }
  /** Handled — navigation / alert already fired. */
  | { kind: 'handled' };

/**
 * Where the dispatch was triggered from. Used to gate `onboarding_finished`
 * — only joins that originate inside the onboarding scanner conclude the
 * onboarding funnel. Deep links and the tab-bar scanner do not.
 */
export type DispatchSource = 'onboarding' | 'deep_link' | 'scanner';

function hostFor(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

/** Short, stable error code for `group_join_failed` analytics. */
function joinFailureCode(e: unknown): string {
  if (e instanceof ApiError) return `http_${e.status}`;
  // Fetch network failures show up as TypeError on RN.
  if (e instanceof TypeError) return 'network';
  return 'unknown';
}

async function joinOn(
  server: string,
  token: string,
  source: DispatchSource | undefined,
): Promise<DispatchResult> {
  try {
    const group = await apiFor(server).joinGroupByToken(token);
    analytics.track('group_joined');
    if (source === 'onboarding') {
      analytics.track('onboarding_finished', { path: 'scan' });
    }
    router.replace(`/groups/${encodeURIComponent(server)}/${group.id}`);
    return { kind: 'handled' };
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 409) {
      // Already a member — treat as a successful join for funnel purposes
      // and bounce to home.
      analytics.track('group_joined');
      if (source === 'onboarding') {
        analytics.track('onboarding_finished', { path: 'scan' });
      }
      router.replace('/(tabs)');
      return { kind: 'handled' };
    }
    analytics.track('group_join_failed', { code: joinFailureCode(e) });
    showAlert({ title: i18n.t('scanJoin.couldNotJoin'), message: e?.message || String(e) });
    return { kind: 'handled' };
  }
}

export async function dispatchInviteIntent(
  intent: InviteIntent,
  source?: DispatchSource,
): Promise<DispatchResult> {
  switch (intent.kind) {
    case 'invalid':
      return { kind: 'invalid', reason: intent.reason };

    case 'join-with-account':
      return joinOn(intent.accountServerUrl, intent.token, source);

    case 'choose-account': {
      // TODO(Wave 6+): replace with the design's chooser sheet when
      // multi-account-per-server lands. For now the alert is a pragmatic
      // placeholder — the data model can't produce this branch anyway
      // (one account per serverUrl).
      const defaultHost = hostFor(intent.defaultPick);
      const candidateButtons = intent.candidateServerUrls.map((url) => ({
        key: url,
        label: hostFor(url),
      }));
      // Pre-selected default first per spec §10.
      candidateButtons.sort((a, b) =>
        a.label === defaultHost ? -1 : b.label === defaultHost ? 1 : 0,
      );
      const result = await showAlert({
        title: i18n.t('scanJoin.chooseAccount'),
        buttons: [
          ...candidateButtons,
          { key: 'cancel', label: i18n.t('common.cancel'), style: 'cancel' },
        ],
      });
      if (result && result !== 'cancel') {
        return joinOn(result, intent.token, source);
      }
      return { kind: 'handled' };
    }

    case 'add-account-then-join': {
      const host = hostFor(intent.serverUrl);
      // Run the §8 discovery handshake first — if the server can't be
      // reached, there's no point bouncing the user into add-server.
      const result = await runDiscoveryHandshake({
        fetchInstanceInfo: () => publicApi(intent.serverUrl).instanceInfo(),
        checkCompat: (args) => checkProtocolCompat(args),
      });
      if (!result.ok) {
        showAlert({ title: i18n.t('scanJoin.unreachable', { host }) });
        return { kind: 'handled' };
      }
      const qs = new URLSearchParams();
      qs.set('prefillUrl', intent.serverUrl);
      qs.set('mode', 'invite');
      // Round-trip the canonical HTTPS form so the add-server / sign-in
      // screen can re-parse it once auth completes.
      qs.set(
        'pendingInvite',
        `${intent.serverUrl}/api/groups/join/${encodeURIComponent(intent.token)}`,
      );
      router.push(`/(auth)/add-server?${qs.toString()}`);
      return { kind: 'handled' };
    }
  }
}
