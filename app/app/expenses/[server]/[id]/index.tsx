import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, Linking } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { ActionSheet, ActionSheetOption, openNativeActionSheet } from '@/components/ActionSheet';
import { SettlementImpactSheet } from '@/components/SettlementImpactSheet';
import { useTranslation } from 'react-i18next';
import {
  apiFor,
  authToken,
  avatarImageSource,
  Expense,
  ExpenseAttachment,
  GroupDetail,
  GroupMember,
  Settlement,
} from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { currentLocale, formatDate, formatMinorUnits } from '@/lib/i18n';
import { computeBalanceImpact } from '@/lib/balance-impact';
import { isPopupJustClosed } from '@/lib/popup-guard';
import { initialsOf, makeNameShortener } from '@/lib/name';
import { colors, fontDisplay, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function ExpenseDetailScreen() {
  const { server, id, groupId } = useLocalSearchParams<{
    server: string;
    id: string;
    groupId?: string;
  }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const account = useAccount(serverUrl);
  const user = account?.user ?? null;
  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachment[]>([]);
  const [viewer, setViewer] = useState<{ uri: string; headers: Record<string, string> } | null>(
    null,
  );
  const [token, setToken] = useState<string | null>(null);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const isAuthor = !!user && !!expense && user.id === expense.created_by_id;

  useEffect(() => {
    let cancelled = false;
    authToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load on focus so returning from the edit screen reflects fresh data.
  // The project has no SWR/React Query layer — this is the cheapest
  // mechanism that keeps the detail screen in sync after a save.
  useFocusEffect(
    useCallback(() => {
      if (!id || !groupId || !serverUrl) return;
      let cancelled = false;
      Promise.allSettled([
        api.getExpense(groupId, id),
        api.getGroup(groupId),
        api.listExpenseAttachments(groupId, id),
        api.listSettlements(groupId),
      ]).then(([eRes, gRes, aRes, sRes]) => {
        if (cancelled) return;
        if (eRes.status === 'fulfilled') setExpense(eRes.value);
        if (gRes.status === 'fulfilled') {
          setGroup(gRes.value);
          setMembers(gRes.value.members);
        }
        if (aRes.status === 'fulfilled') setAttachments(aRes.value);
        if (sRes.status === 'fulfilled') setSettlements(sRes.value);
      });
      return () => {
        cancelled = true;
      };
    }, [id, groupId, serverUrl]),
  );

  function openMenu() {
    // Don't reopen the action sheet if a popup was just dismissed by
    // tapping near this trigger. See app/lib/popup-guard.ts.
    if (isPopupJustClosed()) return;
    if (!isAuthor) return;
    const options: ActionSheetOption[] = [
      {
        label: t('expenseDetail.actions.edit'),
        onPress: () => {
          if (!id || !groupId) return;
          router.push({
            pathname: '/expenses/[server]/[id]/edit',
            params: { server: encodeURIComponent(serverUrl), id, groupId },
          });
        },
      },
      {
        label: t('expenseDetail.actions.delete'),
        destructive: true,
        onPress: () => setDeleteSheetVisible(true),
      },
    ];
    if (openNativeActionSheet(undefined, options)) return;
    setActionSheetVisible(true);
  }

  // Context-aware shortener over this group's members so each rendered name
  // is the shortest unambiguous label ("Lucas" / "Lucas H." / "Lucas Heinonen").
  // Declared above any early return so it never violates the Rules of Hooks.
  const shortenMember = useMemo(
    () => makeNameShortener(members.map((m) => m.name)),
    [members],
  );

  // Compute the delete impact lazily — we need it when the user opens the
  // delete confirm sheet. Returns empty arrays during loading.
  function computeDeleteImpact() {
    if (!expense) {
      return { deltas: [], affectedSettlements: [], newCurrency: '' };
    }
    const splits = expense.splits ?? [];
    return computeBalanceImpact({
      expense,
      currentSplits: splits,
      // Delete = "set all new shares to zero." Pass zero payer + empty
      // participants; the impl interprets the absence as full reversal.
      newAmountMinor: 0n,
      newPayerId: expense.paid_by_id,
      newSplitMethod: 'equal',
      newParticipants: [],
      newSplits: [],
      members,
      settlements,
    });
  }

  async function handleConfirmDelete() {
    if (!id || !groupId || !expense) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await api.deleteExpense(groupId, id);
      setDeleteSheetVisible(false);
      router.back();
    } catch (e: any) {
      setDeleteError(e?.message || t('impactSheet.deleteErrorGeneric'));
    } finally {
      setDeleteSubmitting(false);
    }
  }

  if (!expense) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar left={<IconButton icon="arrow-left" onPress={() => router.back()} />} />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </View>
    );
  }

  const amountMinor = Math.round(parseFloat(expense.amount) * 100);
  const amountDisplay = (Math.abs(amountMinor) / 100).toLocaleString(currentLocale(), {
    minimumFractionDigits: 0,
  });
  const payer = members.find((m) => m.id === expense.paid_by_id);
  const splits = expense.splits ?? [];
  const splitCount = splits.length || members.length;
  const eachOwes = splitCount > 0 ? Math.round(amountMinor / splitCount) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
        right={
          isAuthor ? (
            <IconButton
              icon="more-vertical"
              label={t('expenseDetail.actions.menu')}
              onPress={openMenu}
            />
          ) : undefined
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Title + amount hero */}
        <View style={styles.header}>
          <Text style={styles.context}>
            {t('expenseDetail.context', { groupName: group?.name?.toLowerCase() ?? '—' })}
          </Text>
          <Text style={styles.title}>{expense.title}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>{amountDisplay}</Text>
            <Text style={styles.currency}>{expense.currency}</Text>
          </View>
          {/* FX snapshot: original-currency amount, converted canonical
              amount, and the rate's source/as_of. Only rendered when the
              backend tagged this expense with a foreign-currency snapshot. */}
          {expense.original_currency &&
          expense.original_amount &&
          expense.original_currency !== expense.currency ? (
            <Text style={styles.fxLine} numberOfLines={1}>
              {t('expenseDetail.fx.originalLine', {
                amount: formatMinorUnits(
                  Math.round(parseFloat(expense.original_amount) * 100),
                  expense.original_currency,
                ),
                converted: formatMinorUnits(amountMinor, expense.currency),
                source: t('expenseDetail.fx.sourceECB'),
                asOf: expense.fx_as_of ? formatDate(expense.fx_as_of) : '',
              })}
            </Text>
          ) : null}
          <View style={styles.rule} />

          {/* Meta strip */}
          <View style={styles.metaStrip}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{t('expenseDetail.paidBy')}</Text>
              <View style={styles.metaPaidBy}>
                <Avatar
                  initials={payer ? initialsOf(payer.name) : '??'}
                  size="sm"
                  source={avatarImageSource(payer, token)}
                />
                <Text style={styles.metaName} numberOfLines={1}>
                  {payer ? shortenMember(payer.name) : t('common.dash')}
                </Text>
              </View>
            </View>
            <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.metaLabel}>{t('expenseDetail.date')}</Text>
              <Text style={styles.metaDate}>{expense.expense_date ?? t('common.dash')}</Text>
            </View>
            <View style={[styles.metaCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.metaLabel}>{t('expenseDetail.category')}</Text>
              <View style={styles.categoryTag}>
                <Text style={styles.categoryText}>
                  {t(`categories.${expense.category}`, expense.category)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Split breakdown header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {t('expenseDetail.splitMeta', { method: expense.split_method || 'equally', count: splitCount })}
          </Text>
          <Text style={styles.sectionLabel}>
            {t('expenseDetail.eachOwes', { amount: formatMinorUnits(Math.abs(eachOwes), expense.currency) })}
          </Text>
        </View>
        <View style={styles.sectionRule} />

        {/* Splits list */}
        {splits.length === 0
          ? members.map((m) => {
              const isYou = m.user_id === user?.id;
              return (
                <SplitRow
                  key={m.id}
                  name={isYou ? t('expenseDetail.you') : shortenMember(m.name)}
                  initials={initialsOf(m.name)}
                  share={String(eachOwes)}
                  currency={expense.currency}
                  avatarSource={avatarImageSource(m, token)}
                />
              );
            })
          : splits.map((s) => {
              const member = members.find((m) => m.id === s.member_id);
              const isYou = member?.user_id === user?.id;
              const shareMinor = Math.round(parseFloat(s.share) * 100);
              return (
                <SplitRow
                  key={s.id}
                  name={
                    isYou
                      ? t('expenseDetail.you')
                      : member
                        ? shortenMember(member.name)
                        : t('common.dash')
                  }
                  initials={member ? initialsOf(member.name) : '??'}
                  share={String(shareMinor)}
                  currency={expense.currency}
                  avatarSource={avatarImageSource(member, token)}
                />
              );
            })}

        {/* Receipt */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('expenseDetail.receipt')}</Text>
        </View>
        <View style={styles.sectionRule} />
        <View style={styles.receiptWrap}>
          {attachments.length === 0 ? (
            <View style={[styles.receiptCard, styles.receiptCardEmpty]}>
              <Text style={[styles.receiptText, { color: colors.lead }]}>
                {t('expenseDetail.noReceipt')}
              </Text>
            </View>
          ) : (
            attachments.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.receiptCard}
                activeOpacity={0.7}
                onPress={async () => {
                  if (!a.url) return;
                  const token = await authToken();
                  const uri = a.url.startsWith('http') ? a.url : `${serverUrl}${a.url}`;
                  const headers: Record<string, string> = token
                    ? { Authorization: `Bearer ${token}` }
                    : {};
                  if (a.mime_type.startsWith('image/')) {
                    setViewer({ uri, headers });
                  } else {
                    // Non-images can't pass headers via Linking, so fall back
                    // to opening the absolute API URL — caller is responsible
                    // for browser auth (rarely the case in v1).
                    Linking.openURL(uri);
                  }
                }}
              >
                <Feather name="image" size={16} color={colors.graphite} />
                <Text style={styles.receiptText}>{t('expenseDetail.viewReceipt')}</Text>
                <Feather name="chevron-right" size={16} color={colors.lead} />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* In-app image viewer for receipts. Linking out to the browser
            works too but a modal keeps users in the flow. */}
        <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
          <View style={styles.viewerBackdrop}>
            <TouchableOpacity
              style={styles.viewerClose}
              onPress={() => setViewer(null)}
              accessibilityLabel={t('common.close')}
            >
              <Feather name="x" size={24} color={colors.paper} />
            </TouchableOpacity>
            {viewer ? (
              <Image
                source={{ uri: viewer.uri, headers: viewer.headers }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </Modal>

        {/* Activity */}
        <View style={styles.activityWrap}>
          <Text style={styles.activityHeader}>
            {t('expenseDetail.activityHeader', {
              created: expense.created_at ? new Date(expense.created_at).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) : '',
              time: expense.created_at ? new Date(expense.created_at).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) : '',
            })}
          </Text>
          <View style={styles.activityRule} />
        </View>
      </ScrollView>

      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        options={[
          {
            label: t('expenseDetail.actions.edit'),
            onPress: () => {
              if (!id || !groupId) return;
              router.push({
                pathname: '/expenses/[server]/[id]/edit',
                params: { server: encodeURIComponent(serverUrl), id, groupId },
              });
            },
          },
          {
            label: t('expenseDetail.actions.delete'),
            destructive: true,
            onPress: () => setDeleteSheetVisible(true),
          },
        ]}
      />

      {/* Delete confirm — always uses SettlementImpactSheet (mode=delete).
          When no settlements are affected the sheet still renders, but with
          the plain lead and zero settlement rows. */}
      {expense && (
        <SettlementImpactSheet
          visible={deleteSheetVisible}
          mode="delete"
          deltas={computeDeleteImpact().deltas}
          affectedSettlements={computeDeleteImpact().affectedSettlements}
          members={members}
          currency={expense.currency}
          submitting={deleteSubmitting}
          error={deleteError}
          onCancel={() => {
            setDeleteSheetVisible(false);
            setDeleteError(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      )}
    </View>
  );
}

interface SplitRowProps {
  name: string;
  initials: string;
  share: string;
  currency: string;
  avatarSource?: { uri: string; headers?: Record<string, string> } | null;
}

function SplitRow({ name, initials, share, currency, avatarSource }: SplitRowProps) {
  const minor = parseInt(share, 10);
  const display = `−${formatMinorUnits(Math.abs(minor), currency)}`;
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitLeft}>
        <Avatar initials={initials} source={avatarSource} />
        <Text style={styles.splitName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.splitAmount}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  header: { paddingHorizontal: spacing.s5, paddingTop: spacing.s5 },
  context: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    letterSpacing: -0.8,
    color: colors.graphite,
    lineHeight: 46,
    marginBottom: spacing.s4,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amount: {
    fontFamily: fontMono,
    fontSize: fontSize.displayXl,
    letterSpacing: -1.2,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
    lineHeight: 66,
  },
  currency: { fontFamily: fontMono, fontSize: fontSize.displayS, color: colors.lead },
  fxLine: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  rule: { height: 1, backgroundColor: colors.ruleSoft, marginTop: spacing.s4 },
  metaStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s4, gap: 8 },
  metaCol: { flex: 1 },
  metaLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginBottom: 6,
  },
  metaPaidBy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaName: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite, flexShrink: 1 },
  metaDate: { fontFamily: fontMono, fontSize: fontSize.body, color: colors.graphite },
  categoryTag: {
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-end',
  },
  categoryText: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
    marginBottom: 8,
  },
  sectionLabel: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead },
  sectionRule: {
    height: 1,
    backgroundColor: colors.ruleSoft,
    marginHorizontal: spacing.s5,
    marginBottom: spacing.s1,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
  },
  splitLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  splitName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.3,
    color: colors.graphite,
    flexShrink: 1,
  },
  splitAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  receiptWrap: { paddingHorizontal: spacing.s4, paddingTop: spacing.s2, gap: spacing.s2 },
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 10,
  },
  receiptCardEmpty: {
    justifyContent: 'center',
  },
  receiptText: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    flex: 1,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 1,
  },
  viewerImage: { width: '100%', height: '100%' },
  activityWrap: { paddingHorizontal: spacing.s5, paddingTop: spacing.s6 },
  activityHeader: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginBottom: 8,
  },
  activityRule: { height: 0.5, backgroundColor: colors.ruleSoft },
});
