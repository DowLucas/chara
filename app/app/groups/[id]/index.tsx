import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { ActionSheet, openNativeActionSheet } from '@/components/ActionSheet';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Stamp } from '@/components/Stamp';
import { AvatarStack } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  getGroup,
  listExpenses,
  listGroupBalances,
  listSettlementSuggestions,
  Group,
  Expense,
  Balance,
  GroupMember,
  SettlementSuggestion,
  archiveGroup,
} from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { formatMinorUnits, decimalToMinor, formatDate } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { computeSuggestions } from '@/lib/settle';
import { colors, fontDisplay, fontBody, fontBodyMedium, fontMono, fontMonoMedium, fontSize, spacing } from '@/lib/theme';

const fmtAmount = (minor: string, currency: string, relative?: boolean) =>
  formatMinorUnits(minor, currency, { relative });

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [suggestions, setSuggestions] = useState<SettlementSuggestion[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [g, e, b, s] = await Promise.allSettled([
      getGroup(id),
      listExpenses(id),
      listGroupBalances(id),
      listSettlementSuggestions(id),
    ]);
    if (g.status === 'fulfilled') {
      setGroup(g.value);
      setMembers(g.value.members);
    }
    if (e.status === 'fulfilled') setExpenses(e.value);
    if (b.status === 'fulfilled') setBalances(b.value);
    if (s.status === 'fulfilled') {
      setSuggestions(s.value);
    } else if (b.status === 'fulfilled') {
      // Fallback when /settle-suggestions isn't reachable (e.g. older
      // backend): derive locally from the balances we already have.
      console.warn('settle-suggestions API unavailable, computing locally', s.reason);
      setSuggestions(computeSuggestions(b.value));
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch every time the screen regains focus (e.g. returning from the
  // settle flow), so balances + suggestions reflect any settlements the user
  // just recorded.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function confirmArchive() {
    if (!group) return;
    Alert.alert(
      t('groupDetail.archivePromptTitle', { name: group.name }),
      t('groupDetail.archivePromptBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('groupDetail.archive'),
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveGroup(group.id);
              router.replace('/(tabs)/groups');
            } catch (e: any) {
              Alert.alert(t('groupDetail.archiveError'), e?.message || String(e));
            }
          },
        },
      ],
    );
  }

  // Edit and archive are owner-only on the backend (handler.Update /
  // handler.Archive both require role=="owner"). Mirror that gate in the
  // UI so members don't see actions that would 403 — and so the menu
  // collapses to nothing rather than an empty sheet when only one entry
  // would be hidden.
  const me = members.find((m) => m.user_id === user?.id);
  const isOwner = me?.role === 'owner';

  const [menuOpen, setMenuOpen] = useState(false);
  const menuOptions = isOwner
    ? [
        { label: t('groupDetail.edit'), onPress: () => router.push(`/groups/${id}/edit`) },
        { label: t('groupDetail.archive'), destructive: true, onPress: confirmArchive },
      ]
    : [];
  function openMenu() {
    if (!id || menuOptions.length === 0) return;
    if (openNativeActionSheet(group?.name, menuOptions)) return;
    setMenuOpen(true);
  }

  const [tab, setTab] = useState<'overview' | 'balances' | 'standings'>('overview');

  const myBalance = balances.find((b) => b.user_id === user?.id);
  const myNet = myBalance ? decimalToMinor(myBalance.net_balance) : 0;
  const memberInitials = members.slice(0, 4).map((m) => initialsOf(m.name));

  // Sort standings: largest creditor (most negative net = owes you most) first, then debtors last.
  const standings = [...balances].sort((a, b) => decimalToMinor(a.net_balance) - decimalToMinor(b.net_balance));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        left={
          <IconButton
            icon="arrow-left"
            onPress={() => {
              // Coming from onboarding/scan there's no back-stack to pop,
              // so fall back to the groups tab.
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/groups');
            }}
          />
        }
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="user-plus"
              onPress={() => router.push(`/groups/${id}/invite`)}
              label={t('groupDetail.inviteLabel')}
            />
            {menuOptions.length > 0 && (
              <IconButton icon="more-horizontal" onPress={openMenu} label={t('groupDetail.menuLabel')} />
            )}
          </View>
        }
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroEyebrow}>{t('groupDetail.eyebrow')}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {group?.name ?? t('common.dash')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/groups/${id}/members`)}
              accessibilityRole="button"
              accessibilityLabel={t('groupDetail.membersLabel', { count: members.length })}
              hitSlop={8}
            >
              <AvatarStack people={memberInitials} />
            </TouchableOpacity>
          </View>
          <Text style={styles.eyebrow}>
            {myNet === 0
              ? t('groupDetail.settledUp')
              : myNet > 0
                ? t('groupDetail.youreOwed')
                : t('groupDetail.youOwe')}
          </Text>
          <Text style={[styles.heroBalance, { color: myNet >= 0 ? colors.moss : colors.brick }]}>
            {fmtAmount(String(Math.abs(myNet)), group?.currency ?? 'SEK')}
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            onPress={() => setTab('overview')}
            style={[styles.tab, tab === 'overview' && styles.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === 'overview' && styles.tabLabelActive]}>
              {t('groupDetail.tabOverview')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('balances')}
            style={[styles.tab, tab === 'balances' && styles.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === 'balances' && styles.tabLabelActive]}>
              {t('groupDetail.tabBalances')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('standings')}
            style={[styles.tab, tab === 'standings' && styles.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === 'standings' && styles.tabLabelActive]}>
              {t('groupDetail.tabStandings')}
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'balances' ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderLabel}>
                {t('groupDetail.balancesHeading')}
              </Text>
            </View>
            <View style={styles.listRule} />
            {standings.length === 0 ? (
              <EmptyState
                title={t('groupDetail.balancesEmptyTitle')}
                body={t('groupDetail.balancesEmptyBody')}
              />
            ) : (
              standings.map((b) => {
                const member = members.find((m) => m.id === b.member_id);
                const net = decimalToMinor(b.net_balance);
                const sign = net > 0 ? '+' : net < 0 ? '−' : '';
                const tone = net > 0 ? colors.moss : net < 0 ? colors.brick : colors.lead;
                return (
                  <View key={b.member_id} style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {member?.name ?? b.member_id}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: tone }]}>
                      {sign}{fmtAmount(String(Math.abs(net)), group?.currency ?? 'SEK')}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        ) : tab === 'standings' ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderLabel}>
                {t('groupDetail.suggestionsHeading')}
              </Text>
            </View>
            <View style={styles.listRule} />
            {suggestions.length === 0 ? (
              <EmptyState
                title={
                  standings.length === 0
                    ? t('groupDetail.standingsEmptyTitle')
                    : t('groupDetail.suggestionsEmpty')
                }
                body={
                  standings.length === 0
                    ? t('groupDetail.standingsEmptyBody')
                    : t('groupDetail.suggestionsEmptyBody')
                }
              />
            ) : (
              suggestions.map((s, i) => {
                const fromMember = members.find((m) => m.id === s.from_member_id);
                const toMember = members.find((m) => m.id === s.to_member_id);
                const fromIsYou = fromMember?.user_id === user?.id;
                const toIsYou = toMember?.user_id === user?.id;
                const fromName = fromIsYou ? t('expenseDetail.you') : fromMember?.name ?? t('common.dash');
                const toName = toIsYou ? t('expenseDetail.you') : toMember?.name ?? t('common.dash');
                const fromInitials = initialsOf(fromMember?.name);
                return (
                  <View
                    key={`${s.from_member_id}-${s.to_member_id}-${s.currency}-${i}`}
                    style={styles.standingRow}
                  >
                    <View style={styles.standingLeft}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{fromInitials}</Text>
                      </View>
                      <View style={styles.standingTextWrap}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {t('groupDetail.suggestionRow', { from: fromName, to: toName })}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {fromIsYou
                            ? t('groupDetail.youOwe')
                            : toIsYou
                            ? t('groupDetail.youreOwed')
                            : t('groupDetail.transferBetween')}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.vermillion }]}>
                      {fmtAmount(String(decimalToMinor(s.amount)), s.currency)}
                    </Text>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
        {/* Expenses header */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLabel}>{t('groupDetail.expensesCount', { count: expenses.length })}</Text>
          <Text style={styles.listHeaderRight}>{t('groupDetail.thisMonth')}</Text>
        </View>
        <View style={styles.listRule} />

        {expenses.length === 0 ? (
          <EmptyState title={t('groupDetail.emptyTitle')} body={t('groupDetail.emptyBody')} />
        ) : (
          expenses.map((e) => {
            const payerMember = members.find((m) => m.id === e.paid_by_id);
            const youPaid = payerMember?.user_id === user?.id;
            const payerLabel = youPaid
              ? t('groupDetail.youPaid')
              : t('groupDetail.namePaid', { name: payerMember?.name.split(' ')[0] ?? t('common.dash') });
            const splitsCount = e.splits?.length ?? members.length;
            const settled = false;
            const tone = youPaid ? colors.moss : colors.brick;
            const sign = youPaid ? '+' : '−';
            const display = `${sign}${fmtAmount(String(decimalToMinor(e.amount)), e.currency)}`;
            return (
              <TouchableOpacity
                key={e.id}
                style={styles.row}
                onPress={() => router.push({ pathname: '/expenses/[id]', params: { id: e.id, groupId: id } })}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowTitle, settled && styles.rowTitleSettled]}>{e.title}</Text>
                  <Text style={styles.rowMeta}>
                    {payerLabel} · {t('groupDetail.splitWays', { count: splitsCount })}
                    {e.expense_date ? ` · ${formatDate(e.expense_date)}` : ''}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, { color: settled ? colors.lead : tone }]}>
                  {display}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
          </>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 8 }]}>
        <Button kind="secondary" onPress={() => router.push(`/groups/${id}/add-expense`)} style={styles.ctaBtn}>
          {t('groupDetail.addExpense')}
        </Button>
        <Button kind="primary" onPress={() => router.push(`/groups/${id}/settle`)} style={styles.ctaBtn}>
          {t('groupDetail.settle')}
        </Button>
      </View>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={group?.name}
        options={menuOptions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  hero: {
    padding: spacing.s5,
    paddingBottom: spacing.s4,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s3,
    marginBottom: spacing.s4,
  },
  heroTitleWrap: {
    flex: 1,
    flexShrink: 1,
  },
  heroEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: colors.graphite,
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
    gap: 6,
    backgroundColor: colors.paper,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.graphite,
    borderColor: colors.graphite,
  },
  tabLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    color: colors.paper,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  standingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  standingTextWrap: { flex: 1, flexShrink: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bone,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fontMonoMedium,
    fontSize: 11,
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
  rowLeft: { flex: 1, marginRight: 12 },
  rowTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  rowTitleSettled: {
    textDecorationLine: 'line-through',
    color: colors.lead,
  },
  rowMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 3,
  },
  rowAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  ctaBar: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    backgroundColor: colors.paper,
  },
  ctaBtn: { flex: 1 },
});
