/**
 * Side-effecting dispatcher for `InviteIntent` (spec §10, Wave 6).
 *
 * Separate from `invite-handler.ts` so the classifier stays free of RN
 * imports and is testable without a jest transform on `react-native`.
 *
 * Safe to call from any context (hook or not). Translations resolve via
 * the global `i18n` instance — the deep-link handler runs outside React.
 */

import { Alert } from 'react-native';
import { router } from 'expo-router';
import i18n from './i18n';
import { apiFor, ApiError, publicApi } from './api';
import { runDiscoveryHandshake } from './discovery';
import { checkProtocolCompat } from './protocol';
import type { InviteIntent } from './invite-handler';

export type DispatchResult =
  /** Caller should surface a parse-error toast. */
  | { kind: 'invalid'; reason: string }
  /** Handled — navigation / alert already fired. */
  | { kind: 'handled' };

function hostFor(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

async function joinOn(server: string, token: string): Promise<DispatchResult> {
  try {
    const group = await apiFor(server).joinGroupByToken(token);
    router.replace(`/groups/${encodeURIComponent(server)}/${group.id}`);
    return { kind: 'handled' };
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 409) {
      // Already a member — bounce to home.
      router.replace('/(tabs)');
      return { kind: 'handled' };
    }
    Alert.alert(i18n.t('scanJoin.couldNotJoin'), e?.message || String(e));
    return { kind: 'handled' };
  }
}

export async function dispatchInviteIntent(intent: InviteIntent): Promise<DispatchResult> {
  switch (intent.kind) {
    case 'invalid':
      return { kind: 'invalid', reason: intent.reason };

    case 'join-with-account':
      return joinOn(intent.accountServerUrl, intent.token);

    case 'choose-account': {
      // TODO(Wave 6+): replace with the design's chooser sheet when
      // multi-account-per-server lands. For now the Alert is a pragmatic
      // placeholder — the data model can't produce this branch anyway
      // (one account per serverUrl).
      return new Promise<DispatchResult>((resolve) => {
        const defaultHost = hostFor(intent.defaultPick);
        const buttons = intent.candidateServerUrls.map((url) => ({
          text: hostFor(url),
          onPress: () => {
            void joinOn(url, intent.token).then(resolve);
          },
        }));
        // Pre-selected default first per spec §10.
        buttons.sort((a, b) =>
          a.text === defaultHost ? -1 : b.text === defaultHost ? 1 : 0,
        );
        buttons.push({
          text: i18n.t('common.cancel'),
          // RN's Alert button accepts `style` at runtime; the inferred type
          // from `.map()` above doesn't include it, so cast.
          // @ts-expect-error see note
          style: 'cancel',
          onPress: () => resolve({ kind: 'handled' }),
        });
        Alert.alert(i18n.t('scanJoin.chooseAccount'), undefined, buttons);
      });
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
        Alert.alert(i18n.t('scanJoin.unreachable', { host }));
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
