/**
 * Recurring bills list for a group.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md §4.4
 *
 * - Bone cards via <RecurringListCard/>.
 * - "Resume all after unlock" banner when ≥1 rules are paused because the
 *   group was locked. The banner is the only way to bulk-resume; per-rule
 *   resume lives on the form screen.
 * - Empty-state copy + primary "+ New recurring bill" CTA.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { RecurringListCard } from '@/components/recurring/RecurringListCard';
import { showAlert } from '@/lib/app-alert';
import { apiFor, GroupDetail } from '@/lib/api';
import type { RecurringExpense } from '@/lib/api-types-recurring';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontSize,
  spacing,
} from '@/lib/theme';

export default function RecurringListScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const groupId = id ?? '';
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [rules, setRules] = useState<RecurringExpense[]>([]);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    if (!serverUrl || !groupId) return;
    const [rulesResult, groupResult] = await Promise.allSettled([
      api.recurring.list(groupId),
      api.getGroup(groupId),
    ]);
    if (rulesResult.status === 'fulfilled') setRules(rulesResult.value);
    if (groupResult.status === 'fulfilled') setGroup(groupResult.value);
    // An empty list and a failed fetch look identical otherwise.
    setLoadError(rulesResult.status === 'rejected');
    setLoaded(true);
  }, [api, groupId, serverUrl]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const lockedPausedCount = rules.filter(
    (r) => r.status === 'paused' && r.paused_reason === 'group_locked',
  ).length;
  // Nothing to show *and* the fetch failed: that's an error, not an empty list.
  const failedEmpty = loadError && rules.length === 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Banner action: bulk-resume rules paused only by `group_locked`. The
  // server rejects with 409 if the group is still locked, so we surface
  // the result and refresh either way.
  const resumeAll = useCallback(async () => {
    if (resumeBusy) return;
    setResumeBusy(true);
    try {
      await api.recurring.resumeAllAfterUnlock(groupId);
    } catch (e: any) {
      await showAlert({
        title: t('recurring.resumeAllErrorTitle'),
        message: e?.message || t('recurring.resumeAllErrorBody'),
      });
    } finally {
      await refresh();
      setResumeBusy(false);
    }
  }, [api, groupId, refresh, resumeBusy, t]);

  const payerNameFor = (memberId: string): string | undefined =>
    group?.members.find((m) => m.id === memberId)?.name;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('recurring.listHeader')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} label={t('common.back')} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.graphite}
          />
        }
      >
        <ContentContainer>
        {!loaded ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.graphite} />
          </View>
        ) : (
          <>
            {lockedPausedCount > 0 && (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  {t('recurring.resumeAllBanner', { count: lockedPausedCount })}
                </Text>
                <Pressable
                  onPress={resumeAll}
                  disabled={resumeBusy}
                  style={[styles.bannerCta, resumeBusy && styles.bannerCtaBusy]}
                  accessibilityRole="button"
                >
                  <Text style={styles.bannerCtaLabel}>
                    {resumeBusy
                      ? t('recurring.resumeAllBusy')
                      : t('recurring.resumeAllAfterUnlock')}
                  </Text>
                </Pressable>
              </View>
            )}

            {failedEmpty ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t('recurring.loadErrorTitle')}</Text>
                <Text style={styles.emptyBody}>{t('recurring.loadErrorBody')}</Text>
              </View>
            ) : rules.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t('recurring.emptyTitle')}</Text>
                <Text style={styles.emptyBody}>{t('recurring.emptyBody')}</Text>
              </View>
            ) : (
              rules.map((r) => (
                <RecurringListCard
                  key={r.id}
                  rule={r}
                  payerName={payerNameFor(r.paid_by_id)}
                  onPress={() =>
                    router.push(
                      `/groups/${encodeURIComponent(serverUrl)}/${groupId}/recurring/${r.id}`,
                    )
                  }
                />
              ))
            )}

            {failedEmpty ? (
              <Pressable
                onPress={() => void refresh()}
                style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.newButtonLabel}>{t('common.retry')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() =>
                  router.push(
                    `/groups/${encodeURIComponent(serverUrl)}/${groupId}/recurring/new`,
                  )
                }
                style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.newButtonLabel}>{t('recurring.newButton')}</Text>
              </Pressable>
            )}
          </>
        )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  banner: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s4,
    padding: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
    gap: spacing.s2,
  },
  bannerText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
  },
  bannerCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: 6,
    backgroundColor: colors.graphite,
  },
  bannerCtaBusy: { opacity: 0.5 },
  bannerCtaLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.fgOnAccent,
    letterSpacing: 0.3,
  },
  loading: {
    paddingVertical: spacing.s7,
    alignItems: 'center',
  },
  empty: {
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s7,
    alignItems: 'center',
    gap: spacing.s2,
  },
  emptyTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    textAlign: 'center',
  },
  newButton: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s4,
    paddingVertical: spacing.s4,
    borderRadius: 10,
    backgroundColor: colors.graphite,
    alignItems: 'center',
  },
  newButtonPressed: { opacity: 0.85 },
  newButtonLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
    letterSpacing: 0.3,
  },
});
