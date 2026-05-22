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
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/Button';
import { Stamp } from '@/components/Stamp';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import {
  apiFor,
  authToken,
  avatarImageSource,
  Group,
  Expense,
  Balance,
  GroupMember,
  Settlement,
} from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { formatMinorUnits, decimalToMinor, formatDate } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { colors, fontDisplay, fontBody, fontBodyMedium, fontMono, fontMonoMedium, fontSize, spacing } from '@/lib/theme';

const fmtAmount = (minor: string, currency: string, relative?: boolean) =>
  formatMinorUnits(minor, currency, { relative });

// Map expense category → Feather icon name. Keep this in sync with the
// category enum in en.json (categories.*). Unknown categories fall back to
// the generic tag glyph so we never render a missing icon.
const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  food: 'coffee',
  rent: 'home',
  transport: 'navigation',
  groceries: 'shopping-cart',
  drinks: 'droplet',
  other: 'tag',
};
function categoryIcon(category?: string): keyof typeof Feather.glyphMap {
  return CATEGORY_ICONS[category ?? 'other'] ?? 'tag';
}

export default function GroupDetailScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!id || !serverUrl) return;
    const [g, e, b, p] = await Promise.allSettled([
      api.getGroup(id),
      api.listExpenses(id),
      api.listGroupBalances(id),
      api.listSettlements(id),
    ]);
    if (g.status === 'fulfilled') {
      setGroup(g.value);
      setMembers(g.value.members);
    }
    if (e.status === 'fulfilled') setExpenses(e.value);
    if (b.status === 'fulfilled') setBalances(b.value);
    if (p.status === 'fulfilled') setSettlements(p.value);
  }, [id, serverUrl]);

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
              await api.archiveGroup(group.id);
              router.replace('/(tabs)');
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
  const menuOptions = [
    // Visible to every member — the per-group activity feed has no
    // owner gate on the backend.
    {
      label: t('groupDetail.activity'),
      onPress: () =>
        router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/activity`),
    },
    ...(isOwner
      ? [
          {
            label: t('groupDetail.edit'),
            onPress: () => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/edit`),
          },
          { label: t('groupDetail.archive'), destructive: true, onPress: confirmArchive },
        ]
      : []),
  ];
  function openMenu() {
    if (!id || menuOptions.length === 0) return;
    if (openNativeActionSheet(group?.name, menuOptions)) return;
    setMenuOpen(true);
  }

  const [tab, setTab] = useState<'overview' | 'standings' | 'payments'>('overview');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'expense_date' | 'created_at'>('expense_date');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortOptions = [
    {
      label: t('groupDetail.sortByExpenseDate'),
      onPress: () => setSortBy('expense_date'),
    },
    {
      label: t('groupDetail.sortByCreatedAt'),
      onPress: () => setSortBy('created_at'),
    },
  ];
  function openSortMenu() {
    if (openNativeActionSheet(t('groupDetail.sortTitle'), sortOptions)) return;
    setSortMenuOpen(true);
  }
  const sortedExpenses = expenses.slice().sort((a, b) => {
    const ad = sortBy === 'expense_date' ? (a.expense_date ?? a.created_at) : a.created_at;
    const bd = sortBy === 'expense_date' ? (b.expense_date ?? b.created_at) : b.created_at;
    return bd.localeCompare(ad);
  });

  const myBalance = balances.find((b) => b.user_id === user?.id);
  const myNet = myBalance ? decimalToMinor(myBalance.net_balance) : 0;
  const memberInitials = members.slice(0, 4).map((m) => initialsOf(m.name));


  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        left={
          <View style={styles.topLeft}>
            <IconButton
              icon="arrow-left"
              onPress={() => {
                // Coming from onboarding/scan there's no back-stack to pop,
                // so fall back to home (which lists groups).
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)');
              }}
            />
            <Text style={styles.serverChip} numberOfLines={1} ellipsizeMode="tail">
              {serverUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
            </Text>
          </View>
        }
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton
              icon="user-plus"
              onPress={() => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/invite`)}
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
              onPress={() => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/members`)}
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
            onPress={() => setTab('payments')}
            style={[styles.tab, tab === 'payments' && styles.tabActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, tab === 'payments' && styles.tabLabelActive]}>
              {t('groupDetail.tabPayments')}
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

        {tab === 'payments' ? (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderLabel}>
                {t('groupDetail.paymentsHeading', { count: settlements.length })}
              </Text>
            </View>
            <View style={styles.listRule} />
            {settlements.length === 0 ? (
              <EmptyState
                title={t('groupDetail.paymentsEmptyTitle')}
                body={t('groupDetail.paymentsEmptyBody')}
              />
            ) : (
              settlements.map((s) => {
                const fromMember = members.find((m) => m.id === s.from_member_id);
                const toMember = members.find((m) => m.id === s.to_member_id);
                const fromIsYou = fromMember?.user_id === user?.id;
                const toIsYou = toMember?.user_id === user?.id;
                const fromName = fromIsYou ? t('expenseDetail.you') : fromMember?.name ?? t('common.dash');
                const toName = toIsYou ? t('expenseDetail.you') : toMember?.name ?? t('common.dash');
                const reverted = !!s.reverted_at;
                // Revert window: 24h from creation, only the payer or payee
                // may invoke it (server enforces; we just hide the action).
                const createdAt = new Date(s.created_at).getTime();
                const withinRevertWindow = Date.now() - createdAt < 24 * 60 * 60 * 1000;
                const canRevert = !reverted && withinRevertWindow && (fromIsYou || toIsYou);
                const onRevert = () => {
                  Alert.alert(
                    t('groupDetail.paymentRevertTitle'),
                    t('groupDetail.paymentRevertBody', { from: fromName, to: toName, amount: fmtAmount(String(decimalToMinor(s.amount)), s.currency) }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('groupDetail.paymentRevert'),
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            if (!id) return;
                            await api.revertSettlement(id, s.id);
                            await load();
                          } catch (e: any) {
                            Alert.alert(t('groupDetail.paymentRevertError'), e?.message || String(e));
                          }
                        },
                      },
                    ],
                  );
                };
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.row}
                    activeOpacity={canRevert ? 0.7 : 1}
                    onPress={canRevert ? onRevert : undefined}
                  >
                    <View style={styles.rowLeft}>
                      <Text
                        style={[
                          styles.rowTitle,
                          reverted && styles.rowTitleSettled,
                        ]}
                        numberOfLines={1}
                      >
                        {t('groupDetail.paymentRow', { from: fromName, to: toName })}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {formatDate(s.created_at)}
                        {s.method && s.method !== 'manual' ? ` · ${s.method}` : ''}
                        {reverted ? ` · ${t('groupDetail.paymentReverted')}` : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.rowAmount,
                        { color: reverted ? colors.lead : colors.moss },
                        reverted && { textDecorationLine: 'line-through' },
                      ]}
                    >
                      {fmtAmount(String(decimalToMinor(s.amount)), s.currency)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : tab === 'standings' ? (
          <>
            {members.length === 0 || expenses.length === 0 ? (
              <EmptyState
                title={t('groupDetail.standingsEmptyTitle')}
                body={t('groupDetail.standingsEmptyBody')}
              />
            ) : (
              members.map((m) => {
                // Group expenses by payer. Single pass per render is fine —
                // expense lists are small (per group) and we already need to
                // re-derive this when the underlying state updates.
                const myExpenses = expenses.filter((e) => e.paid_by_id === m.id);
                // Total is paid amounts in each currency. We deliberately
                // don't FX-mix across currencies; if the same member has
                // expenses in EUR and HUF, both show as separate totals.
                const totalsByCcy = new Map<string, number>();
                for (const e of myExpenses) {
                  const minor = decimalToMinor(e.amount);
                  totalsByCcy.set(e.currency, (totalsByCcy.get(e.currency) ?? 0) + minor);
                }
                const isYou = m.user_id === user?.id;
                const expanded = expandedMemberId === m.id;
                const initials = initialsOf(m.name);
                return (
                  <View key={m.id} style={styles.memberCard}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setExpandedMemberId(expanded ? null : m.id)}
                      style={styles.memberCardHeader}
                    >
                      <View style={styles.standingLeft}>
                        <Avatar initials={initials} source={avatarImageSource(m, token)} />
                        <View style={styles.standingTextWrap}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {isYou ? t('expenseDetail.you') : m.name}
                          </Text>
                          <Text style={styles.rowMeta}>
                            {t('groupDetail.expensesCount', { count: myExpenses.length })}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.memberCardHeaderRight}>
                        <View style={styles.totalsCol}>
                          {totalsByCcy.size === 0 ? (
                            <Text style={styles.rowMeta}>{t('common.dash')}</Text>
                          ) : (
                            [...totalsByCcy.entries()].map(([ccy, total]) => (
                              <Text key={ccy} style={styles.memberCardTotal}>
                                {fmtAmount(String(total), ccy)}
                              </Text>
                            ))
                          )}
                        </View>
                        <Feather
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.lead}
                        />
                      </View>
                    </TouchableOpacity>
                    {expanded && (
                      <View style={styles.memberCardBody}>
                        {myExpenses.length === 0 ? (
                          <Text style={[styles.rowMeta, { paddingVertical: spacing.s3 }]}>
                            {t('groupDetail.memberNoExpenses')}
                          </Text>
                        ) : (
                          myExpenses
                            .slice()
                            .sort((a, b) => {
                              // Newest first by expense_date, fall back to created_at.
                              const ad = a.expense_date ?? a.created_at;
                              const bd = b.expense_date ?? b.created_at;
                              return bd.localeCompare(ad);
                            })
                            .map((e) => (
                              <TouchableOpacity
                                key={e.id}
                                style={styles.memberExpenseRow}
                                activeOpacity={0.7}
                                onPress={() =>
                                  router.push({
                                    pathname: '/expenses/[server]/[id]',
                                    params: { server: encodeURIComponent(serverUrl), id: e.id, groupId: id },
                                  })
                                }
                              >
                                <View style={styles.memberExpenseIcon}>
                                  <Feather
                                    name={categoryIcon(e.category)}
                                    size={16}
                                    color={colors.graphite}
                                  />
                                </View>
                                <View style={styles.memberExpenseText}>
                                  <Text style={styles.rowTitle} numberOfLines={1}>
                                    {e.title}
                                  </Text>
                                  <Text style={styles.rowMeta}>
                                    {e.expense_date ? formatDate(e.expense_date) : formatDate(e.created_at)}
                                  </Text>
                                </View>
                                <Text style={styles.memberExpenseAmount}>
                                  {fmtAmount(String(decimalToMinor(e.amount)), e.currency)}
                                </Text>
                              </TouchableOpacity>
                            ))
                        )}
                      </View>
                    )}
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
          <TouchableOpacity
            onPress={openSortMenu}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('groupDetail.sortTitle')}
            hitSlop={8}
            style={styles.sortBtn}
          >
            <Text style={styles.listHeaderRight}>
              {sortBy === 'expense_date'
                ? t('groupDetail.sortByExpenseDate')
                : t('groupDetail.sortByCreatedAt')}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.lead} />
          </TouchableOpacity>
        </View>
        <View style={styles.listRule} />

        {expenses.length === 0 ? (
          <EmptyState title={t('groupDetail.emptyTitle')} body={t('groupDetail.emptyBody')} />
        ) : (
          sortedExpenses.map((e) => {
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
                onPress={() =>
                  router.push({
                    pathname: '/expenses/[server]/[id]',
                    params: { server: encodeURIComponent(serverUrl), id: e.id, groupId: id },
                  })
                }
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
        <Button
          kind="secondary"
          onPress={() => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/add-expense`)}
          style={styles.ctaBtn}
        >
          {t('groupDetail.addExpense')}
        </Button>
        <Button
          kind="primary"
          onPress={() => router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/settle`)}
          style={styles.ctaBtn}
        >
          {t('groupDetail.settle')}
        </Button>
      </View>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={group?.name}
        options={menuOptions}
      />
      <ActionSheet
        visible={sortMenuOpen}
        onClose={() => setSortMenuOpen(false)}
        title={t('groupDetail.sortTitle')}
        options={sortOptions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  serverChip: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.2,
    // Cap so a long hostname can't push the wordmark off-centre.
    maxWidth: 120,
    flexShrink: 1,
  },
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
  memberCard: {
    marginHorizontal: spacing.s5,
    marginTop: spacing.s3,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 8,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  memberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    gap: spacing.s3,
  },
  memberCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  totalsCol: { alignItems: 'flex-end' },
  memberCardTotal: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  memberCardBody: {
    borderTopWidth: 0.5,
    borderTopColor: colors.ruleSoft,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  memberExpenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    gap: spacing.s3,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  memberExpenseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberExpenseText: { flex: 1, minWidth: 0 },
  memberExpenseAmount: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
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
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
