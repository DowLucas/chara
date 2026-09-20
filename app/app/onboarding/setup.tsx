// Step 6 of first-run onboarding: replays the pre-signup draft (name, first
// group or invite) against the server the user just signed up on, then lands
// them in their group. Logic lives in lib/onboarding-setup.ts.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '@/components/Text';
import { ContentContainer } from '@/components/ContentContainer';
import { useEnglishT } from '@/lib/i18n';
import { useAccounts } from '@/lib/accounts';
import { ApiError, apiFor } from '@/lib/api';
import { setOverride as setGroupColorOverride } from '@/lib/group-color';
import { OnboardingDraft, clearDraft, loadDraft, saveDraft } from '@/lib/onboarding-draft';
import {
  SetupDeps,
  SetupStep,
  postSetupNavigation,
  runSetup,
  setupSteps,
} from '@/lib/onboarding-setup';
import { userErrorMessage } from '@/lib/user-error';
import { hapticSuccess } from '@/lib/haptics';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

type StepState = 'pending' | 'running' | 'done' | 'failed';

export default function OnboardingSetupScreen() {
  const insets = useSafeAreaInsets();
  const t = useEnglishT();
  const { server } = useLocalSearchParams<{ server?: string }>();
  const serverUrl = server ? decodeURIComponent(server) : '';
  const { updateAccount } = useAccounts();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [states, setStates] = useState<Partial<Record<SetupStep, StepState>>>({});
  const [error, setError] = useState<string | null>(null);

  const deps = useMemo<SetupDeps>(() => {
    const api = apiFor(serverUrl);
    return {
      getMyName: () => api.getMe().then((u) => u.name ?? ''),
      updateName: async (name) => {
        const user = await api.updateMe({ name });
        await updateAccount(serverUrl, { user });
      },
      createGroup: (name, currency) => api.createGroup(name, currency),
      setGroupColor: (groupId, color) => setGroupColorOverride(serverUrl, groupId, color),
      joinGroup: (token) =>
        api.joinGroupByToken(token).catch((e) => {
          // Already a member counts as joined.
          if (e instanceof ApiError && e.status === 409) return null;
          throw e;
        }),
      save: saveDraft,
    };
  }, [serverUrl, updateAccount]);

  const run = useCallback(
    async (d: OnboardingDraft) => {
      setError(null);
      const result = await runSetup(d, deps, (step, state) =>
        setStates((s) => ({ ...s, [step]: state })),
      );
      if (result.kind === 'failed') {
        setDraft(result.draft);
        setStates((s) => ({ ...s, [result.step]: 'failed' }));
        setError(userErrorMessage(result.error, t('common.requestFailed')));
        const code = analytics.errorCode(result.error);
        analytics.track('onboarding_setup_failed', { step: result.step, code });
        if (result.step === 'group') {
          analytics.track(
            result.draft.intent === 'join' ? 'group_join_failed' : 'group_create_failed',
            { code },
          );
        }
        return;
      }
      await clearDraft();
      hapticSuccess();
      // First-run conversion. `resumed` means a previous attempt already
      // created the group and already counted it, so a retry must not fire
      // again; `already_member` (409) counts as a join, matching the
      // deep-link join route.
      if (result.outcome === 'created') analytics.track('group_created');
      if (result.outcome === 'joined' || result.outcome === 'already_member') {
        analytics.track('group_joined');
      }
      // Fires for both paths at the same point, so create and join stay
      // comparable — and so abandoning the invite screen still counts as a
      // finished onboarding.
      analytics.track('onboarding_finished', { path: result.intent });
      const [reset, ...rest] = postSetupNavigation(result, serverUrl);
      router.replace(reset as never);
      rest.forEach((href) => router.push(href as never));
    },
    [deps, serverUrl, t],
  );

  useEffect(() => {
    void loadDraft().then((d) => {
      if (!d || !serverUrl) {
        router.replace('/(tabs)');
        return;
      }
      setDraft(d);
      void run(d);
    });
    // Runs once on mount; retries go through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function continueWithout() {
    await clearDraft();
    router.replace('/(tabs)');
  }

  const groupName = draft?.invite?.groupName ?? draft?.group?.name ?? '';
  const labels: Record<SetupStep, string> = {
    name: t('setup.stepName'),
    group: t(draft?.intent === 'join' ? 'setup.stepJoin' : 'setup.stepCreate', { group: groupName }),
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.s6 }]}>
      <ContentContainer style={{ flex: 1 }}>
        <Text style={styles.headline}>
          {error ? t('setup.failedHeadline') : t('setup.headline')}
        </Text>
        <View style={styles.steps}>
          <StepRow label={t('setup.accountCreated')} state="done" />
          {draft &&
            setupSteps(draft).map((step) => (
              <StepRow
                key={step}
                label={labels[step]}
                state={states[step] ?? 'pending'}
                detail={states[step] === 'failed' ? error : null}
              />
            ))}
        </View>

        {error && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => draft && run(draft)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>{t('common.retry')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondary}
              onPress={continueWithout}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryLabel}>{t('setup.continueWithout')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ContentContainer>
    </View>
  );
}

function StepRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: StepState;
  detail?: string | null;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        {state === 'running' ? (
          <ActivityIndicator size="small" color={colors.graphite} />
        ) : state === 'done' ? (
          <Feather name="check" size={18} color={colors.moss} />
        ) : state === 'failed' ? (
          <Feather name="x" size={18} color={colors.brick} />
        ) : (
          <Feather name="circle" size={14} color={colors.ruleSoft} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, state === 'pending' && styles.rowLabelPending]}>
          {label}
        </Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  steps: { marginTop: spacing.s6, gap: spacing.s4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.s3 },
  rowIcon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite, lineHeight: 22 },
  rowLabelPending: { color: colors.lead },
  rowDetail: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    lineHeight: 20,
    marginTop: 2,
  },
  footer: { marginTop: 'auto', gap: spacing.s2 },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
  secondary: { alignSelf: 'center', paddingVertical: spacing.s3 },
  secondaryLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
    textDecorationColor: colors.ruleSoft,
  },
});
