import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
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
  SettlementSuggestion,
} from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { formatMinorUnits, decimalToMinor, formatDate } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { subscribeGroupChanged } from '@/lib/group-refresh';
import { computeStandings, expensesInvolvingMember } from '@/lib/standings';
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
  const [suggestions, setSuggestions] = useState<SettlementSuggestion[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

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
    const [g, e, b, p, s] = await Promise.allSettled([
      api.getGroup(id),
      api.listExpenses(id),
      api.listGroupBalances(id),
      api.listSettlements(id),
      api.listSettlementSuggestions(id),
    ]);
    if (g.status === 'fulfilled') {
      setGroup(g.value);
      setMembers(g.value.members);
    }
    if (e.status === 'fulfilled') setExpenses(e.value);
    if (b.status === 'fulfilled') setBalances(b.value);
    if (p.status === 'fulfilled') setSettlements(p.value);
    if (s.status === 'fulfilled') setSuggestions(s.value);
  }, [id, serverUrl]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch every time the screen regains focus (e.g. returning from the
  // settle flow), so balances + suggestions reflect any settlements the user
  // just recorded.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Also subscribe to explicit group-changed notifications from mutators
  // (add-expense, settle, etc.). useFocusEffect alone misses cases where the
  // screen is already focused or where navigation doesn't re-trigger focus.
  useEffect(() => {
    if (!id || !serverUrl) return;
    const unsub = subscribeGroupChanged(serverUrl, id, () => { load(); });
    return unsub;
  }, [serverUrl, id, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Settings hub replaces the old Edit + Archive menu items. The hub itself
  // gates owner-only lifecycle actions, so the entry is visible to every
  // member — non-owners get the read-only view + leave CTA. Activity stays
  // alongside it. See
  // docs/superpowers/specs/2026-05-23-group-settings-design.md.
  const me = members.find((m) => m.user_id === user?.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuOptions = [
    {
      label: t('groupDetail.activity'),
      onPress: () =>
        router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/activity`),
    },
    {
      label: t('groupSettings.settings'),
      onPress: () =>
        router.push(`/groups/${encodeURIComponent(serverUrl)}/${id}/settings`),
    },
  ];
  function openMenu() {
    // Swallow the press if a popup was just dismissed by tapping near
    // this trigger. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
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
    if (isPopupJustClosed()) return;
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
  const memberInitials = members.map((m) => initialsOf(m.name));


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
            <TouchableOpacity
              onPress={() => setInfoOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('groupDetail.openInfoLabel')}
              hitSlop={8}
              activeOpacity={0.6}
              style={styles.titleChip}
            >
              <Text style={styles.titleChipText} numberOfLines={1} ellipsizeMode="tail">
                {group?.name ?? t('common.dash')}
              </Text>
            </TouchableOpacity>
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
      {/* Hero: pinned below the top bar, doesn't scroll with the list.
          Group name lives in the top bar now; the hero is balance + avatars. */}
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.heroBalanceCol}>
            {myNet === 0 ? (
              // Settled state lives where the big number would. Sized to
              // match the balance line so the eye lands here, not on a
              // small caption.
              <Text style={styles.heroSettled}>{t('groupDetail.settledUp')}</Text>
            ) : (
              <>
                <Text style={styles.heroBalanceLabel}>
                  {myNet > 0 ? t('groupDetail.youreOwed') : t('groupDetail.youOwe')}
                </Text>
                <Text style={[styles.heroBalance, { color: myNet > 0 ? colors.moss : colors.brick }]}>
                  {fmtAmount(String(Math.abs(myNet)), group?.currency ?? 'SEK')}
                </Text>
              </>
            )}
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
      </View>

      {/* Tabs: pinned, also don't scroll. */}
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

      {/* Only the tab body scrolls. Hero + tabs stay pinned above. */}
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {tab === 'payments' ? (
          <>
            {/* To Be Paid: suggested settlements from outstanding balances.
                Tapping a row jumps to the settle flow. */}
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderLabel}>
                {t('groupDetail.paymentsToBePaidHeading', { count: suggestions.length })}
              </Text>
            </View>
            <View style={styles.listRule} />
            {suggestions.length === 0 ? (
              <EmptyState title={t('groupDetail.paymentsAllSettled')} />
            ) : (
              suggestions.map((s, i) => {
                const fromMember = members.find((m) => m.id === s.from_member_id);
                const toMember = members.find((m) => m.id === s.to_member_id);
                const fromIsYou = fromMember?.user_id === user?.id;
                const toIsYou = toMember?.user_id === user?.id;
                const fromName = fromIsYou ? t('expenseDetail.you') : fromMember?.name ?? t('common.dash');
                const toName = toIsYou ? t('expenseDetail.you') : toMember?.name ?? t('common.dash');
                return (
                  <View
                    key={`${s.from_member_id}-${s.to_member_id}-${s.currency}-${i}`}
                    style={styles.row}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {t('groupDetail.paymentRow', { from: fromName, to: toName })}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.brick }]}>
                      {fmtAmount(String(decimalToMinor(s.amount)), s.currency)}
                    </Text>
                  </View>
                );
              })
            )}

            {/* History: actual settlements that were recorded. Reverted
                rows stay visible with a strike-through. */}
            <View style={[styles.listHeader, styles.sectionGap]}>
              <Text style={styles.listHeaderLabel}>
                {t('groupDetail.paymentsHistoryHeading', { count: settlements.length })}
              </Text>
            </View>
            <View style={styles.listRule} />
            {settlements.length === 0 ? (
              <EmptyState title={t('groupDetail.paymentsHistoryEmpty')} />
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
                const onRevert = async () => {
                  const result = await showAlert({
                    title: t('groupDetail.paymentRevertTitle'),
                    message: t('groupDetail.paymentRevertBody', { from: fromName, to: toName, amount: fmtAmount(String(decimalToMinor(s.amount)), s.currency) }),
                    buttons: [
                      { key: 'cancel', label: t('common.cancel'), style: 'cancel' },
                      { key: 'revert', label: t('groupDetail.paymentRevert'), style: 'destructive' },
                    ],
                  });
                  if (result === 'revert') {
                    try {
                      if (!id) return;
                      await api.revertSettlement(id, s.id);
                      await load();
                    } catch (e: any) {
                      showAlert({ title: t('groupDetail.paymentRevertError'), message: e?.message || String(e) });
                    }
                  }
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
            {members.length === 0 ? (
              <EmptyState
                title={t('groupDetail.standingsEmptyTitle')}
                body={t('groupDetail.standingsEmptyBody')}
              />
            ) : (
              (() => {
                const rows = computeStandings(members, balances);
                return members.map((m, i) => {
                  const row = rows[i];
                  // Standings show net balance per currency (positive = owed,
                  // negative = owes). The expanded body lists every expense the
                  // member is involved in — either as payer or as a split
                  // participant — so members who only owe still surface their
                  // history here.
                  const memberExpenses = expensesInvolvingMember(expenses, m.id);
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
                            {t('groupDetail.expensesCount', { count: memberExpenses.length })}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.memberCardHeaderRight}>
                        <View style={styles.totalsCol}>
                          {row.isSettled ? (
                            <Text style={styles.rowMeta}>{t('groupDetail.settledUp')}</Text>
                          ) : (
                            row.entries.map(({ currency, netMinor }) => (
                              <Text
                                key={currency}
                                style={[
                                  styles.memberCardTotal,
                                  { color: netMinor >= 0 ? colors.moss : colors.brick },
                                ]}
                              >
                                {formatMinorUnits(netMinor, currency, { relative: true })}
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
                        {memberExpenses.length === 0 ? (
                          <Text style={[styles.rowMeta, { paddingVertical: spacing.s3 }]}>
                            {t('groupDetail.memberNoExpenses')}
                          </Text>
                        ) : (
                          memberExpenses
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
                });
              })()
            )}
          </>
        ) : (
          <>
        {/* Expenses header */}
        <View style={styles.listHeader}>
          <Text style={styles.listHeaderLabel}>{t('groupDetail.expensesTotal', { count: expenses.length })}</Text>
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
            // No +/− prefix in the expenses list — the amount shown is the
            // total outlay, not a per-viewer balance delta. Direction belongs
            // in the standings tab. Color stays neutral here; the meta line
            // ("you paid", "Alice paid") carries the who-owes-who signal.
            const display = fmtAmount(String(decimalToMinor(e.amount)), e.currency);
            const amountColor = settled
              ? colors.lead
              : youPaid
                ? colors.graphite
                : colors.brick;
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
                <Text style={[styles.rowAmount, { color: amountColor }]}>
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
          disabled={balances.length === 0 || balances.every((b) => decimalToMinor(b.net_balance) === 0)}
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
      <Modal
        visible={infoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoOpen(false)}
      >
        <Pressable style={styles.infoBackdrop} onPress={() => setInfoOpen(false)}>
          <Pressable style={styles.infoCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle} numberOfLines={1}>
                {group?.name ?? t('common.dash')}
              </Text>
              <TouchableOpacity
                onPress={() => setInfoOpen(false)}
                hitSlop={8}
                accessibilityLabel={t('common.close')}
              >
                <Feather name="x" size={20} color={colors.graphite} strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('groupDetail.infoServerLabel')}</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                {(() => {
                  try { return new URL(serverUrl).host; } catch { return serverUrl; }
                })()}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('groupDetail.infoCurrencyLabel')}</Text>
              <Text style={styles.infoValue}>{group?.currency ?? t('common.dash')}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('groupDetail.infoMembersLabel')}</Text>
              <Text style={styles.infoValue}>{members.length}</Text>
            </View>
            {group?.created_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('groupDetail.infoCreatedLabel')}</Text>
                <Text style={styles.infoValue}>{formatDate(new Date(group.created_at))}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  titleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  titleChipText: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: -0.3,
    maxWidth: 160,
    flexShrink: 1,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  heroBalanceCol: {
    flexShrink: 1,
  },
  infoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
  },
  infoCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.paper,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.graphite,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
    marginBottom: spacing.s2,
  },
  infoTitle: {
    flexShrink: 1,
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: colors.graphite,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
    paddingVertical: 4,
  },
  infoLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: fontBodyMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
  },
  hero: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s2,
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
    marginBottom: 1,
  },
  heroTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: colors.graphite,
  },
  heroBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  heroBalanceLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  heroBalance: {
    fontFamily: fontMono,
    fontSize: fontSize.displayM,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  // Settled state takes the slot the big number would occupy. Same size,
  // graphite for contrast (moss-on-paper was unreadable).
  heroSettled: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.6,
    color: colors.graphite,
    includeFontPadding: false,
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
    backgroundColor: colors.paper,
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
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    borderRadius: 10,
    backgroundColor: colors.bone,
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
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  memberExpenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    gap: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  memberExpenseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.paper,
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
  sectionGap: {
    marginTop: spacing.s5,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  listRule: {
    height: 1,
    backgroundColor: colors.ruleSoft,
    marginHorizontal: spacing.s5,
    marginBottom: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
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
    fontFamily: fontBody,
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
