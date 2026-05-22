import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import {
  apiFor,
  GroupDetail,
  GroupMember,
  Balance,
  SettlementSuggestion,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { computeSuggestions } from '@/lib/settle';
import { decimalToMinor, formatMinorUnits } from '@/lib/i18n';
import { initialsOf } from '@/lib/name';
import {
  colors,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';

export default function SettleScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [suggestions, setSuggestions] = useState<SettlementSuggestion[]>([]);
  const [othersOpen, setOthersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Members live inside the GroupDetail response — there is no separate
  // /members endpoint registered on the backend, so reading from getGroup
  // is the source of truth.
  const members: GroupMember[] = group?.members ?? [];

  const load = useCallback(async () => {
    if (!id || !serverUrl) return;
    const [g, b, s] = await Promise.allSettled([
      api.getGroup(id),
      api.listGroupBalances(id),
      api.listSettlementSuggestions(id),
    ]);
    if (g.status === 'fulfilled') setGroup(g.value);
    if (b.status === 'fulfilled') setBalances(b.value);
    if (s.status === 'fulfilled') {
      setSuggestions(s.value);
    } else if (b.status === 'fulfilled') {
      setSuggestions(computeSuggestions(b.value));
    }
  }, [id, serverUrl]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const myMember = useMemo(
    () => members.find((m) => m.user_id === user?.id),
    [members, user?.id],
  );

  // A user can have balances in multiple currencies within one group. The
  // hero shows the first non-zero one; per-row currency still drives the
  // suggestion list so mixed-currency groups render correctly.
  const myBalances = useMemo(
    () => balances.filter((b) => b.user_id === user?.id),
    [balances, user?.id],
  );
  const myHero = useMemo(() => {
    const nonZero = myBalances.find((b) => decimalToMinor(b.net_balance) !== 0);
    return nonZero ?? myBalances[0];
  }, [myBalances]);
  const myNet = myHero ? decimalToMinor(myHero.net_balance) : 0;
  // Currency comes from the balance row, not group.currency — actual
  // expenses may be in any currency regardless of the group default.
  const heroCurrency = myHero?.currency ?? group?.currency ?? 'SEK';

  // Only outgoing transfers are actionable here — you can record paying
  // someone you owe, but you can't settle on someone else's behalf when
  // they owe you. Incoming and unrelated suggestions both land under
  // "between others" as read-only context.
  const { yours, others } = useMemo(() => {
    const yours: SettlementSuggestion[] = [];
    const others: SettlementSuggestion[] = [];
    for (const s of suggestions) {
      if (s.from_member_id === myMember?.id) {
        yours.push(s);
      } else {
        others.push(s);
      }
    }
    return { yours, others };
  }, [suggestions, myMember?.id]);

  // Naive transfer count: every debtor pays every creditor, per currency.
  const naive = useMemo(() => {
    const byCcy = new Map<string, { d: number; c: number }>();
    for (const b of balances) {
      const minor = decimalToMinor(b.net_balance);
      if (minor === 0) continue;
      const cur = byCcy.get(b.currency) ?? { d: 0, c: 0 };
      if (minor > 0) cur.c++; else cur.d++;
      byCcy.set(b.currency, cur);
    }
    let total = 0;
    byCcy.forEach((v) => { total += v.d * v.c; });
    return total;
  }, [balances]);

  const openMethodPicker = (s: SettlementSuggestion) => {
    if (!id || !serverUrl) return;
    router.push({
      pathname: '/groups/[server]/[id]/settle-method',
      params: {
        server: encodeURIComponent(serverUrl),
        id,
        from: s.from_member_id,
        to: s.to_member_id,
        amount: s.amount,
        currency: s.currency,
      },
    });
  };

  const hasAnything = yours.length > 0 || others.length > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('settle.title')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            {t('settle.yourNet', { group: group?.name ?? '' })}
          </Text>
          <Text style={[styles.heroBalance, { color: myNet >= 0 ? colors.moss : colors.brick }]}>
            {formatMinorUnits(myNet, heroCurrency, { relative: true })}
          </Text>
          <View style={styles.rule} />
          {hasAnything && naive > suggestions.length && (
            <Text style={styles.caption}>
              {t('settle.transfersCaption', { count: suggestions.length, naive })}
            </Text>
          )}
        </View>

        {!hasAnything && (
          <EmptyState title={t('settle.allQuitsTitle')} body={t('settle.allQuitsBody')} />
        )}

        {yours.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>
                {t('settle.yourTransfers', { count: yours.length })}
              </Text>
              <View style={styles.sectionRule} />
            </View>
            {yours.map((s) => {
              const isOutgoing = s.from_member_id === myMember?.id;
              const counterId = isOutgoing ? s.to_member_id : s.from_member_id;
              const counter = members.find((m) => m.id === counterId);
              return (
                <TouchableOpacity
                  key={`${s.from_member_id}-${s.to_member_id}-${s.currency}`}
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => openMethodPicker(s)}
                >
                  <View style={styles.rowLeft}>
                    <Avatar initials={initialsOf(counter?.name)} />
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {counter?.name ?? t('settle.unknownUser')}
                      </Text>
                      <Text
                        style={[
                          styles.rowMeta,
                          { color: isOutgoing ? colors.brick : colors.moss },
                        ]}
                      >
                        {isOutgoing ? t('settle.youOwe') : t('settle.owesYou')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>
                      {formatMinorUnits(decimalToMinor(s.amount), s.currency)}
                    </Text>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {others.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.collapseHeader}
              onPress={() => setOthersOpen((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionLabel}>
                {t('settle.betweenOthers', { count: others.length })}
              </Text>
              <Text style={[styles.caret, { transform: [{ rotate: othersOpen ? '0deg' : '-90deg' }] }]}>
                ▾
              </Text>
            </TouchableOpacity>
            <View style={[styles.softRule, { marginHorizontal: spacing.s5 }]} />
            {othersOpen && others.map((s) => {
              const from = members.find((m) => m.id === s.from_member_id);
              const to = members.find((m) => m.id === s.to_member_id);
              return (
                <View
                  key={`${s.from_member_id}-${s.to_member_id}-${s.currency}`}
                  style={styles.otherRow}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.pairAvatars}>
                      <Avatar initials={initialsOf(from?.name)} size="sm" />
                      <Avatar initials={initialsOf(to?.name)} size="sm" stack />
                    </View>
                    <Text style={styles.pairLabel} numberOfLines={1}>
                      {from?.name?.split(' ')[0] ?? '?'}
                      <Text style={styles.pairArrow}>  →  </Text>
                      {to?.name?.split(' ')[0] ?? '?'}
                    </Text>
                  </View>
                  <Text style={styles.otherAmount}>
                    {formatMinorUnits(decimalToMinor(s.amount), s.currency)}
                  </Text>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  hero: {
    padding: spacing.s5,
    paddingBottom: spacing.s3,
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
    lineHeight: 64,
    includeFontPadding: false,
  },
  rule: {
    height: 1.5,
    backgroundColor: colors.graphite,
    marginTop: 12,
  },
  caption: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginTop: 12,
  },
  sectionHeader: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  sectionRule: {
    height: 1.5,
    backgroundColor: colors.graphite,
  },
  softRule: {
    height: 0.5,
    backgroundColor: colors.ruleSoft,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s5,
    paddingBottom: 6,
  },
  caret: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
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
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  rowTextWrap: { flex: 1, minWidth: 0 },
  rowName: {
    fontFamily: fontDisplay,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  rowMeta: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowAmount: {
    fontFamily: fontMonoMedium,
    fontSize: 17,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    fontFamily: fontMono,
    fontSize: 18,
    color: colors.lead,
  },
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  pairAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairLabel: {
    fontFamily: fontMono,
    fontSize: 13,
    color: colors.graphite,
    letterSpacing: 0.2,
    flex: 1,
  },
  pairArrow: {
    color: colors.lead,
  },
  otherAmount: {
    fontFamily: fontMonoMedium,
    fontSize: 15,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
  },
});
