/**
 * Per-group statistics screen. Reached via the bar-chart icon in the group
 * top bar. Single-server (no fan-out) — uses `apiFor(serverUrl)` directly.
 *
 * Shows the at-a-glance numbers that used to live in group settings (total
 * spent, expense count, top spender, created) plus a per-category spend
 * breakdown aggregated client-side from the expense list.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { Text } from '@/components/Text';
import { apiFor, Expense, GroupStats } from '@/lib/api';
import { formatDate, formatMinorUnits } from '@/lib/i18n';
import { aggregateByCategory } from '@/lib/category-stats';
import { categoryIcon, categoryLabelKey } from '@/lib/categories';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

export default function GroupStatsScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const groupId = id ?? '';
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [stats, setStats] = useState<GroupStats | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    const [s, e] = await Promise.allSettled([
      api.getGroupStats(groupId),
      api.listExpenses(groupId),
    ]);
    if (s.status === 'fulfilled') setStats(s.value);
    if (e.status === 'fulfilled') setExpenses(e.value);
  }, [groupId, serverUrl]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const totalsByCurrency = stats?.totals_by_currency ?? [];
  const formattedTotal =
    totalsByCurrency.length === 0
      ? t('groupSettings.stats.noActivityYet')
      : totalsByCurrency
          .map((row) => formatMinorUnits(row.minor_units, row.currency))
          .join(' · ');
  const topSpenderName = stats?.top_spender?.display_name ?? '';
  const topSpenderAmount = stats?.top_spender
    ? formatMinorUnits(stats.top_spender.minor_units_paid, stats.top_spender.currency)
    : '';

  const byCategory = aggregateByCategory(expenses);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('groupStats.title')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.graphite} />
        }
      >
        <ContentContainer>
          {/* AT A GLANCE */}
          <View style={styles.section}>
            <Text style={styles.eyebrow}>{t('groupSettings.stats.title')}</Text>
            <View style={styles.list}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('groupSettings.stats.totalExpenses')}</Text>
                <Text style={styles.rowValueMono}>{stats ? String(stats.expense_count) : '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>{t('groupSettings.stats.totalSpent')}</Text>
                <MoneyText style={styles.rowValueMono} numberOfLines={1} value={formattedTotal} />
              </View>
              {stats?.top_spender && stats.expense_count >= 3 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('groupSettings.stats.topSpender')}</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {topSpenderName}
                    <Text style={styles.rowValueMuted}>{`  ${topSpenderAmount}`}</Text>
                  </Text>
                </View>
              )}
              {stats?.created_at && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('groupSettings.stats.created')}</Text>
                  <Text style={styles.rowValueMono}>{formatDate(stats.created_at)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* BY CATEGORY */}
          <View style={styles.section}>
            <Text style={styles.eyebrow}>{t('groupStats.byCategory')}</Text>
            {byCategory.length === 0 ? (
              <EmptyState
                icon="bar-chart-2"
                title={t('groupStats.emptyTitle')}
                body={t('groupStats.emptyBody')}
              />
            ) : (
              <View style={styles.list}>
                {byCategory.map((row) => (
                  <View key={row.category} style={styles.row}>
                    <View style={styles.catLeft}>
                      <Feather name={categoryIcon(row.category)} size={16} color={colors.lead} />
                      <Text style={styles.rowLabel}>{t(categoryLabelKey(row.category))}</Text>
                    </View>
                    <Text style={styles.rowValueMono} numberOfLines={1}>
                      {row.totals
                        .map((tot) => formatMinorUnits(tot.minor, tot.currency))
                        .join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  section: { marginTop: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
    marginHorizontal: spacing.s5,
  },
  list: { borderTopWidth: 1, borderTopColor: colors.ruleSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    gap: spacing.s3,
  },
  catLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, flexShrink: 1 },
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite, flexShrink: 1 },
  rowValue: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  rowValueMuted: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead },
  rowValueMono: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
});
