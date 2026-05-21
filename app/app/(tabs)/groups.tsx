import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Stamp } from '@/components/Stamp';
import { AvatarStack } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { listGroups, listMyBalances, Group, MyBalance } from '@/lib/api';
import { formatMinorUnits, decimalToMinor } from '@/lib/i18n';
import { colors, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

const fmtBalance = (minor: string, currency: string) =>
  formatMinorUnits(minor, currency, { relative: true });

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [balances, setBalances] = useState<MyBalance[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([listGroups(), listMyBalances()]);
      setGroups(g);
      setBalances(b);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const balanceMap = Object.fromEntries(balances.map((b) => [b.group_id, b]));

  const net = balances.reduce((s, b) => s + decimalToMinor(b.net_balance), 0);
  const currency = balances[0]?.currency ?? 'SEK';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('groupsTab.title')}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="camera"
              onPress={() => router.push('/groups/scan')}
              label={t('groupsTab.scanQrLabel')}
            />
            <IconButton
              icon="plus"
              onPress={() => router.push('/onboarding/create')}
              label={t('groupsTab.newGroupLabel')}
            />
          </View>
        }
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Balance summary */}
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{t('groupsTab.netBalance')}</Text>
          <Text style={[styles.sectionTitle, { color: net >= 0 ? colors.moss : colors.brick }]}>
            {fmtBalance(String(net), currency)}
          </Text>
        </View>

        {/* Groups list header */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLabel}>{t('groupsTab.groupsCount', { count: groups.length })}</Text>
          <Text style={styles.listHeaderRight}>{t('groupsTab.sortRecent')}</Text>
        </View>
        <View style={styles.listRule} />

        {groups.length === 0 ? (
          <EmptyState title={t('groupsTab.emptyTitle')} body={t('groupsTab.emptyBody')} />
        ) : (
          groups.map((g) => {
            const bal = balanceMap[g.id];
            const n = bal ? decimalToMinor(bal.net_balance) : 0;
            const settled = n === 0;
            const balColor = n > 0 ? colors.moss : n < 0 ? colors.brick : colors.lead;

            return (
              <TouchableOpacity
                key={g.id}
                style={[styles.row, settled && styles.rowSettled]}
                onPress={() => router.push(`/groups/${g.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowTitle, settled && { color: colors.lead }]}>{g.name}</Text>
                  <Text style={styles.rowMeta}>{g.currency}</Text>
                </View>
                {settled ? (
                  <Stamp />
                ) : (
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmount, { color: balColor }]}>
                      {fmtBalance(String(bal ? decimalToMinor(bal.net_balance) : 0), g.currency)}
                    </Text>
                    <AvatarStack people={['AL', 'MO', 'EJ']} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  section: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s4,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.8,
    color: colors.graphite,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: 6,
  },
  listHeaderLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  listHeaderRight: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  listRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    marginHorizontal: spacing.s5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowSettled: { opacity: 0.6 },
  rowLeft: { flex: 1, marginRight: 12 },
  rowTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  rowMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 3,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
