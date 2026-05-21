import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { AvatarStack } from '@/components/Avatar';
import { Stamp } from '@/components/Stamp';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { listGroups, listMyBalances, Group, MyBalance } from '@/lib/api';
import { formatMinorUnits, decimalToMinor } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

const fmtBalance = (minor: string, currency: string) =>
  formatMinorUnits(minor, currency, { relative: true });
const fmtAmount = (minor: string, currency: string) => formatMinorUnits(minor, currency);

/** Build a small set of avatar initials for a group. Until we fetch members on
 *  the home screen, derive a single chip from the group name so the row isn't
 *  empty. Real member avatars land here once /api/groups returns member peeks. */
function groupInitials(g: Group): string[] {
  const i = initialsOf(g.name);
  return [i || '·'];
}

export default function HomeScreen() {
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

  const totalOwed = balances
    .filter((b) => decimalToMinor(b.net_balance) > 0)
    .reduce((s, b) => s + decimalToMinor(b.net_balance), 0);
  const totalOwe = balances
    .filter((b) => decimalToMinor(b.net_balance) < 0)
    .reduce((s, b) => s + decimalToMinor(b.net_balance), 0);
  const net = totalOwed + totalOwe;
  const currency = balances[0]?.currency ?? 'SEK';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('app.name')}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="camera"
              onPress={() => router.push('/groups/scan')}
              label={t('groupsTab.scanQrLabel')}
            />
            <IconButton icon="search" />
            <IconButton icon="bell" />
          </View>
        }
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: spacing.s5 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Net balance hero */}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{t('home.netBalance')}</Text>
          <Text style={[styles.heroBalance, { color: net >= 0 ? colors.moss : colors.brick }]}>
            {fmtBalance(String(net), currency)}
          </Text>
          <View style={styles.rule} />
          <View style={styles.heroRow}>
            <Text style={styles.heroLabel}>{t('home.youAreOwed')}</Text>
            <Text style={[styles.heroValue, { color: colors.moss }]}>
              {fmtBalance(String(totalOwed), currency)}
            </Text>
          </View>
          <View style={styles.heroRow}>
            <Text style={styles.heroLabel}>{t('home.youOwe')}</Text>
            <Text style={[styles.heroValue, { color: colors.brick }]}>
              {fmtBalance(String(totalOwe), currency)}
            </Text>
          </View>
        </View>

        {/* Your groups card */}
        {groups.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.s5 }}>
            <EmptyState title={t('home.noGroupsTitle')} body={t('home.noGroupsBody')} />
          </View>
        ) : (
          <View style={styles.cardWrap}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardEyebrow}>
                  {t('home.groupsCount', { count: groups.length })}
                </Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/groups')}>
                  <Text style={styles.cardLink}>{t('home.seeAll')}</Text>
                </TouchableOpacity>
              </View>
              {groups.slice(0, 5).map((g, i) => {
                const bal = balanceMap[g.id];
                // Three states:
                //   - no balance row → group has no expenses yet (brand new)
                //   - balance row with net === 0 → had activity, now settled up
                //   - balance row with net !== 0 → you owe or are owed
                const hasActivity = bal !== undefined;
                const n = bal ? decimalToMinor(bal.net_balance) : 0;
                const settled = hasActivity && n === 0;
                const isLast = i === Math.min(groups.length, 5) - 1;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupRow, !isLast && styles.groupRowDivider]}
                    onPress={() => router.push(`/groups/${g.id}`)}
                    activeOpacity={0.7}
                  >
                    <AvatarStack people={groupInitials(g)} />
                    <View style={styles.groupMid}>
                      <Text style={styles.groupTitle} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.groupMeta} numberOfLines={1}>
                        {g.currency} ·{' '}
                        {hasActivity
                          ? settled
                            ? t('home.statusSettled')
                            : t('home.statusActive')
                          : t('home.statusNew')}
                      </Text>
                    </View>
                    <View style={styles.groupRight}>
                      {!hasActivity ? (
                        <Text style={styles.groupAmtMuted}>—</Text>
                      ) : settled ? (
                        <Stamp />
                      ) : (
                        <>
                          <Text style={styles.groupAmtEyebrow}>
                            {n > 0 ? t('home.youreOwedStamp') : t('home.youOweStamp')}
                          </Text>
                          <Text
                            style={[
                              styles.groupAmt,
                              { color: n > 0 ? colors.moss : colors.brick },
                            ]}
                            numberOfLines={1}
                          >
                            {fmtAmount(String(Math.abs(n)), g.currency)}
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Recent activity (placeholder until we expose an activity feed) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('home.recentCount', { count: 0 })}</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/activity')}>
            <Text style={styles.sectionLink}>{t('home.activityLink')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sectionRule} />
        <Text style={styles.noActivity}>{t('home.noActivity')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  hero: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  heroBalance: {
    fontFamily: fontMono,
    fontSize: fontSize.displayXl,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 68,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingTop: 4,
  },
  rule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    marginVertical: spacing.s3,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
  },
  heroValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    fontVariant: ['tabular-nums'],
  },

  // Groups card
  cardWrap: {
    paddingHorizontal: spacing.s5,
    marginTop: spacing.s2,
  },
  card: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.s3,
  },
  cardEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  cardLink: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  groupRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  groupMid: {
    flex: 1,
    minWidth: 0,
  },
  groupTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    color: colors.graphite,
    lineHeight: 22,
  },
  groupAmtMuted: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyL,
    color: colors.lead,
  },
  groupMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  groupRight: {
    alignItems: 'flex-end',
    minWidth: 92,
  },
  groupAmtEyebrow: {
    fontFamily: fontMono,
    fontSize: 10,
    color: colors.lead,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  groupAmt: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },

  // Recent section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  sectionLink: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
  },
  sectionRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    marginHorizontal: spacing.s5,
  },
  noActivity: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
  },
});
