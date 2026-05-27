// Join-confirmation screen.
//
// Default landing point for any invite flow — universal link, QR scan, and
// the post-auth handoff. Fetches a preview from /api/invites/{token}/preview,
// then shows the user the group/inviter and a single primary CTA:
//   - already on this server  → Join group (calls joinGroupByToken)
//   - no account on this server → Sign in to join (push add-server with
//     pendingInvite = this same join URL so we return here after auth)
//
// Routes are composite: `/join/[encodedServerUrl]/[token]`. The screen does
// no parsing — the server URL arrives pre-decoded from useLocalSearchParams.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { apiFor, ApiError, publicApi, type InvitePreview } from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import * as analytics from '@/lib/analytics';
import { showAlert } from '@/lib/app-alert';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; preview: Extract<InvitePreview, { state: 'ok' | 'locked' }> }
  | { kind: 'invalid'; reason: 'expired' | 'not_found' | 'archived' | 'deleted' | 'rate_limited' | 'other' }
  | { kind: 'unreachable' }
  | { kind: 'error' };

function mapNotOk(state: string): Extract<State, { kind: 'invalid' }>['reason'] {
  if (state === 'expired' || state === 'not_found' || state === 'archived' || state === 'deleted' || state === 'rate_limited') {
    return state;
  }
  return 'other';
}

export default function JoinConfirmScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ server: string; token: string }>();
  const serverUrl = useMemo(
    () => (typeof params.server === 'string' ? decodeURIComponent(params.server) : ''),
    [params.server],
  );
  const token = typeof params.token === 'string' ? params.token : '';
  const account = useAccount(serverUrl);

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [joining, setJoining] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!serverUrl || !token) {
      setState({ kind: 'invalid', reason: 'other' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const preview = await publicApi(serverUrl).previewInvite(token);
      if (preview.state === 'ok' || preview.state === 'locked') {
        setState({ kind: 'ok', preview });
      } else {
        setState({ kind: 'invalid', reason: mapNotOk(preview.state) });
      }
    } catch (e) {
      // Network failure on RN shows up as TypeError; protocol-incompat 426
      // and other HTTP errors as ApiError. Treat anything that isn't a
      // proper 200 as "unreachable" — the user can retry.
      if (e instanceof TypeError) {
        setState({ kind: 'unreachable' });
      } else if (e instanceof ApiError) {
        setState({ kind: 'unreachable' });
      } else {
        setState({ kind: 'error' });
      }
    }
  }, [serverUrl, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const onJoin = useCallback(async () => {
    if (joining || !account || state.kind !== 'ok') return;
    setJoining(true);
    try {
      const group = await apiFor(serverUrl).joinGroupByToken(token);
      analytics.track('group_joined');
      router.replace(`/groups/${encodeURIComponent(serverUrl)}/${group.id}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        // Already a member — treat as success.
        analytics.track('group_joined');
        router.replace('/(tabs)');
        return;
      }
      analytics.track('group_join_failed', {
        code: e instanceof ApiError ? `http_${e.status}` : 'unknown',
      });
      void showAlert({
        title: t('scanJoin.couldNotJoin'),
        message: e?.message || String(e),
      });
    } finally {
      setJoining(false);
    }
  }, [account, joining, serverUrl, state, t, token]);

  const onSignInToJoin = useCallback(() => {
    if (state.kind !== 'ok') return;
    const qs = new URLSearchParams();
    qs.set('prefillUrl', serverUrl);
    qs.set('mode', 'invite');
    qs.set('pendingInvite', `${serverUrl}/api/groups/join/${encodeURIComponent(token)}`);
    router.push(`/(auth)/add-server?${qs.toString()}`);
  }, [serverUrl, state, token]);

  const onCancel = useCallback(() => {
    router.replace('/(tabs)');
  }, []);

  // Host for the eyebrow ("on chara-api.lurkhuset.com")
  const host = useMemo(() => {
    try {
      return new URL(serverUrl).host;
    } catch {
      return serverUrl;
    }
  }, [serverUrl]);

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        {state.kind === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.graphite} />
            <Text style={styles.bodyMuted}>{t('joinConfirm.loading')}</Text>
          </View>
        )}

        {state.kind === 'ok' && (
          <>
            <Text style={styles.eyebrow}>
              {state.preview.inviterName
                ? t('joinConfirm.invitedBy', { name: state.preview.inviterName })
                : t('joinConfirm.invitedByUnknown')}
            </Text>
            <Text style={styles.groupName}>{state.preview.groupName}</Text>
            <Text style={styles.meta}>
              {t('joinConfirm.memberCount', { count: state.preview.memberCount })}
              {' · '}
              {t('joinConfirm.onServer', { host })}
            </Text>
            {state.preview.state === 'locked' && (
              <Text style={styles.lockedNote}>{t('joinConfirm.lockedNote')}</Text>
            )}

            <View style={styles.actions}>
              {account ? (
                <TouchableOpacity
                  style={[styles.primary, joining && styles.primaryDisabled]}
                  onPress={onJoin}
                  disabled={joining}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryLabel}>
                    {joining ? t('joinConfirm.joining') : t('joinConfirm.join')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.primary}
                  onPress={onSignInToJoin}
                  accessibilityRole="button"
                >
                  <Text style={styles.primaryLabel}>{t('joinConfirm.signInToJoin')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onCancel} accessibilityRole="button">
                <Text style={styles.cancelLabel}>{t('joinConfirm.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {state.kind === 'invalid' && (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>{t('joinConfirm.errorTitle')}</Text>
            <Text style={styles.bodyMuted}>{t('joinConfirm.errorExpired')}</Text>
            <TouchableOpacity onPress={onCancel} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryLabel}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state.kind === 'unreachable' && (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>{t('joinConfirm.errorTitle')}</Text>
            <Text style={styles.bodyMuted}>{t('joinConfirm.errorUnreachable', { host })}</Text>
            <TouchableOpacity onPress={loadPreview} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryLabel}>{t('joinConfirm.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} accessibilityRole="button">
              <Text style={styles.cancelLabel}>{t('joinConfirm.cancel')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {state.kind === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>{t('joinConfirm.errorTitle')}</Text>
            <Text style={styles.bodyMuted}>{t('joinConfirm.errorGeneric')}</Text>
            <TouchableOpacity onPress={loadPreview} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryLabel}>{t('joinConfirm.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: spacing.s5,
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  card: {
    backgroundColor: colors.bone,
    borderRadius: 14,
    padding: spacing.s6,
  },
  center: {
    alignItems: 'center',
    gap: spacing.s3,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  groupName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    color: colors.graphite,
    marginBottom: spacing.s2,
  },
  meta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginBottom: spacing.s4,
  },
  lockedNote: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.brick,
    marginBottom: spacing.s4,
  },
  actions: {
    gap: spacing.s3,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.graphite,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s6,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.paper,
  },
  cancelLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    paddingVertical: spacing.s2,
  },
  errorTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
  },
  bodyMuted: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    textAlign: 'center',
  },
});
