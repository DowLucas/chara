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
  Pressable,
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

  const refresh = useCallback(async () => {
    if (!serverUrl || !groupId) return;
    const [rulesResult, groupResult] = await Promise.allSettled([
      api.recurring.list(groupId),
      api.getGroup(groupId),
    ]);
    if (rulesResult.status === 'fulfilled') setRules(rulesResult.value);
    if (groupResult.status === 'fulfilled') setGroup(groupResult.value);
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

  // Banner action: bulk-resume rules paused only by `group_locked`. The
  // server rejects with 409 if the group is still locked, so we surface
  // the result and refresh either way.
  const resumeAll = useCallback(async () => {
    try {
      await api.recurring.resumeAllAfterUnlock(groupId);
    } finally {
      await refresh();
    }
  }, [api, groupId, refresh]);

  const payerNameFor = (memberId: string): string | undefined =>
    group?.members.find((m) => m.id === memberId)?.name;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('recurring.listHeader')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
      >
        <ContentContainer>
        {lockedPausedCount > 0 && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {t('recurring.resumeAllBanner', { count: lockedPausedCount })}
            </Text>
            <Pressable onPress={resumeAll} style={styles.bannerCta}>
              <Text style={styles.bannerCtaLabel}>
                {t('recurring.resumeAllAfterUnlock')}
              </Text>
            </Pressable>
          </View>
        )}

        {loaded && rules.length === 0 ? (
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
  bannerCtaLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.fgOnAccent,
    letterSpacing: 0.3,
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
