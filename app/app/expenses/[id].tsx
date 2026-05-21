import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { useTranslation } from 'react-i18next';
import { getExpense, getGroup, Expense, GroupDetail, GroupMember } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentLocale, formatMinorUnits } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import { colors, fontDisplay, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function ExpenseDetailScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);

  useEffect(() => {
    if (!id || !groupId) return;
    const [e, g] = [getExpense(groupId, id), getGroup(groupId)] as const;
    Promise.allSettled([e, g]).then(([eRes, gRes]) => {
      if (eRes.status === 'fulfilled') setExpense(eRes.value);
      if (gRes.status === 'fulfilled') {
        setGroup(gRes.value);
        setMembers(gRes.value.members);
      }
    });
  }, [id, groupId]);

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
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon="message-square" label={t('expenseDetail.commentsLabel')} />
            <IconButton icon="more-horizontal" label={t('expenseDetail.menuLabel')} />
          </View>
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
          <View style={styles.rule} />

          {/* Meta strip */}
          <View style={styles.metaStrip}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{t('expenseDetail.paidBy')}</Text>
              <View style={styles.metaPaidBy}>
                <Avatar initials={payer ? initialsOf(payer.name) : '??'} size="sm" />
                <Text style={styles.metaName} numberOfLines={1}>
                  {payer?.name ?? t('common.dash')}
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
                  name={isYou ? t('expenseDetail.you') : m.name}
                  initials={initialsOf(m.name)}
                  share={String(eachOwes)}
                  currency={expense.currency}
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
                  name={isYou ? t('expenseDetail.you') : member?.name ?? t('common.dash')}
                  initials={member ? initialsOf(member.name) : '??'}
                  share={String(shareMinor)}
                  currency={expense.currency}
                />
              );
            })}

        {/* Receipt */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('expenseDetail.receipt')}</Text>
        </View>
        <View style={styles.sectionRule} />
        <View style={styles.receiptWrap}>
          <TouchableOpacity style={styles.receiptCard} activeOpacity={0.7}>
            <Text style={styles.receiptText}>{t('expenseDetail.tapToView')}</Text>
          </TouchableOpacity>
        </View>

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
    </View>
  );
}

interface SplitRowProps {
  name: string;
  initials: string;
  share: string;
  currency: string;
}

function SplitRow({ name, initials, share, currency }: SplitRowProps) {
  const minor = parseInt(share, 10);
  const display = `−${formatMinorUnits(Math.abs(minor), currency)}`;
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitLeft}>
        <Avatar initials={initials} />
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
  header: { paddingHorizontal: spacing.s5, paddingTop: spacing.s2 },
  context: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    letterSpacing: -0.8,
    color: colors.graphite,
    lineHeight: 32,
    marginBottom: 14,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amount: {
    fontFamily: fontMono,
    fontSize: 48,
    letterSpacing: -1.2,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
    lineHeight: 52,
  },
  currency: { fontFamily: fontMono, fontSize: 22, color: colors.lead },
  rule: { height: 1.5, backgroundColor: colors.graphite, marginTop: 14 },
  metaStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 8 },
  metaCol: { flex: 1 },
  metaLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginBottom: 6,
  },
  metaPaidBy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaName: { fontFamily: fontBody, fontSize: 14, color: colors.graphite, flexShrink: 1 },
  metaDate: { fontFamily: fontMono, fontSize: 14, color: colors.graphite },
  categoryTag: {
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-end',
  },
  categoryText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    marginBottom: 6,
  },
  sectionLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  sectionRule: { height: 1.5, backgroundColor: colors.graphite, marginHorizontal: spacing.s5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  splitLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  splitName: {
    fontFamily: fontDisplay,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.graphite,
    flexShrink: 1,
  },
  splitAmount: {
    fontFamily: fontMono,
    fontSize: 16,
    color: colors.brick,
    fontVariant: ['tabular-nums'],
  },
  receiptWrap: { paddingHorizontal: spacing.s5, paddingTop: 12 },
  receiptCard: {
    width: 96,
    height: 132,
    backgroundColor: colors.bone,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  activityWrap: { paddingHorizontal: spacing.s5, paddingTop: spacing.s5 },
  activityHeader: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginBottom: 6,
  },
  activityRule: { height: 0.5, backgroundColor: colors.ruleSoft },
});
