import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { Stamp } from '@/components/Stamp';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { Group, MyBalance } from '@/lib/api';
import { useAccounts } from '@/lib/accounts';
import {
  useAggregatedGroups,
  useAggregatedBalances,
  // useAggregatedActivity, // re-enable with the recent-activity section
} from '@/lib/aggregated-reads';
import { formatMinorUnits, decimalToMinor } from '@/lib/i18n';
import { isPopupJustClosed } from '@/lib/popup-guard';
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

/** Extract hostname from a server URL for the host chip. */
function hostOf(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

interface MergedGroup {
  group: Group;
  serverUrl: string;
  balance: MyBalance | null;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { accounts } = useAccounts();

  const groupReads = useAggregatedGroups();
  const balanceReads = useAggregatedBalances();
  // Recent activity preview disabled — see commented JSX block below.
  // const activityReads = useAggregatedActivity(50);
  // const recentActivity = useMemo(() => {
  //   const all: { event: import('@/lib/api').ActivityEvent; serverUrl: string }[] = [];
  //   for (const r of activityReads) {
  //     for (const e of r.data ?? []) all.push({ event: e, serverUrl: r.serverUrl });
  //   }
  //   all.sort(
  //     (a, b) =>
  //       new Date(b.event.created_at).getTime() -
  //       new Date(a.event.created_at).getTime(),
  //   );
  //   return all.slice(0, 5);
  // }, [activityReads]);

  // Host chip rule (spec §14): only when ≥ 2 accounts.
  const showHostChip = accounts.length >= 2;

  // Refresh state — composite across both reads.
  const refreshing = groupReads.some((r) => r.status === 'loading') ||
    balanceReads.some((r) => r.status === 'loading');

  // Merge: concatenate all groups, attach matching per-account balance.
  const mergedGroups: MergedGroup[] = useMemo(() => {
    const balanceByKey = new Map<string, MyBalance>();
    for (const br of balanceReads) {
      for (const b of br.data ?? []) {
        balanceByKey.set(`${br.serverUrl}::${b.group_id}`, b);
      }
    }
    const rows: MergedGroup[] = [];
    for (const gr of groupReads) {
      for (const g of gr.data ?? []) {
        rows.push({
          group: g,
          serverUrl: gr.serverUrl,
          balance: balanceByKey.get(`${gr.serverUrl}::${g.id}`) ?? null,
        });
      }
    }
    // Sort by created_at desc (Group type lacks last_activity_at today).
    rows.sort((a, b) => (b.group.created_at ?? '').localeCompare(a.group.created_at ?? ''));
    return rows;
  }, [groupReads, balanceReads]);

  // Per-currency net totals across all accounts.
  const netByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const br of balanceReads) {
      for (const b of br.data ?? []) {
        totals.set(b.currency, (totals.get(b.currency) ?? 0) + decimalToMinor(b.net_balance));
      }
    }
    return [...totals.entries()]
      .map(([currency, minor]) => ({ currency, minor }))
      .sort((a, b) => Math.abs(b.minor) - Math.abs(a.minor));
  }, [balanceReads]);

  const primaryCurrency = netByCurrency[0]?.currency ?? 'SEK';
  const primaryNet = netByCurrency[0]?.minor ?? 0;

  const onRefresh = () => {
    // Refresh is automatic via the hook's foreground trigger. The pull-to-refresh
    // gesture is mostly for affordance; the hook will re-fire on the next data
    // change. A future iteration could expose an imperative refresh from the
    // hook — out of scope for this wave.
  };

  // Failing-account strips, one per failing account per section.
  const failingGroupAccounts = groupReads.filter((r) => r.status === 'error');
  const failingBalanceAccounts = balanceReads.filter((r) => r.status === 'error');

  // Status-strip rows: accounts not queried because reauth_required or incompatible.
  const statusRows = accounts.filter(
    (a) => a.status === 'reauth_required' || a.status === 'incompatible',
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('tabs.home')}
        left={
          <TouchableOpacity
            style={styles.topAction}
            onPress={() => router.push('/groups/scan')}
            accessibilityLabel={t('groupsTab.scanQrLabel')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="camera" size={18} color={colors.graphite} strokeWidth={1.5} />
            <Text style={styles.topActionLabel}>{t('groupsTab.joinGroup')}</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            style={styles.topAction}
            onPress={() => router.push('/onboarding/create')}
            accessibilityLabel={t('groupsTab.newGroupLabel')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.topActionLabel}>{t('groupsTab.newGroup')}</Text>
            <Feather name="plus" size={18} color={colors.graphite} strokeWidth={1.5} />
          </TouchableOpacity>
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
          {netByCurrency.length === 0 ? (
            <Text
              style={[styles.heroBalance, { color: colors.lead }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {fmtBalance('0', primaryCurrency)}
            </Text>
          ) : (
            <Text
              style={[
                styles.heroBalance,
                { color: primaryNet >= 0 ? colors.moss : colors.brick },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {fmtBalance(String(primaryNet), primaryCurrency)}
            </Text>
          )}
          {/* Multi-currency totals: stacked Stamps, sorted by absolute amount desc. */}
          {netByCurrency.length > 1 && (
            <View style={styles.multiCurrencyRow}>
              {netByCurrency.slice(1).map((c) => (
                <View key={c.currency} style={styles.currencyChip}>
                  <Text
                    style={[
                      styles.currencyChipAmt,
                      { color: c.minor >= 0 ? colors.moss : colors.brick },
                    ]}
                  >
                    {fmtBalance(String(c.minor), c.currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Your groups card */}
        {mergedGroups.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.s5 }}>
            <EmptyState title={t('home.noGroupsTitle')} body={t('home.noGroupsBody')} />
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={() => router.push('/onboarding/create')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.emptyCtaLabel}>{t('home.noGroupsCta')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.groupsHeader}>
              <Text style={styles.groupsHeaderLabel}>
                {t('home.groupsCount', { count: mergedGroups.length })}
              </Text>
            </View>
            <View style={styles.cardWrap}>
              {mergedGroups.map(({ group: g, serverUrl, balance: bal }) => {
                const hasActivity = bal !== null;
                const n = bal ? decimalToMinor(bal.net_balance) : 0;
                const settled = hasActivity && n === 0;
                return (
                  <TouchableOpacity
                    key={`${serverUrl}::${g.id}`}
                    style={styles.groupCard}
                    onPress={() => {
                      // Swallow taps that close the FAB group-picker / any
                      // other sheet whose backdrop covered this row.
                      if (isPopupJustClosed()) return;
                      router.push(`/groups/${encodeURIComponent(serverUrl)}/${g.id}`);
                    }}
                    activeOpacity={0.7}
                  >
                    <GroupAvatar serverUrl={serverUrl} groupId={g.id} />
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
                      {showHostChip && (
                        <Text style={styles.hostChip} numberOfLines={1}>
                          {t('home.hostChip', { host: hostOf(serverUrl) })}
                        </Text>
                      )}
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
          </>
        )}

        {/* Per-account error strips */}
        {(failingGroupAccounts.length > 0 ||
          failingBalanceAccounts.length > 0 ||
          statusRows.length > 0) && (
          <View style={styles.stripWrap}>
            {failingGroupAccounts.map((r) => (
              <ErrorStrip
                key={`g-${r.serverUrl}`}
                label={t('home.errorStrip', { host: hostOf(r.serverUrl) })}
                cta={t('home.retry')}
              />
            ))}
            {failingBalanceAccounts
              .filter((r) => !failingGroupAccounts.some((g) => g.serverUrl === r.serverUrl))
              .map((r) => (
                <ErrorStrip
                  key={`b-${r.serverUrl}`}
                  label={t('home.errorStrip', { host: hostOf(r.serverUrl) })}
                  cta={t('home.retry')}
                />
              ))}
            {statusRows.map((a) => (
              <TouchableOpacity
                key={`s-${a.serverUrl}`}
                style={styles.errorStrip}
                onPress={() => {
                  if (a.status === 'reauth_required') {
                    router.push(
                      `/(auth)/sign-in?server=${encodeURIComponent(a.serverUrl)}&mode=reauth`,
                    );
                  } else {
                    router.push('/settings/accounts');
                  }
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.errorStripText} numberOfLines={1}>
                  {hostOf(a.serverUrl)} ·{' '}
                  {a.status === 'reauth_required'
                    ? t('home.statusReauthShort')
                    : t('home.statusIncompatibleShort')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent activity preview — temporarily hidden. Re-enable by
            uncommenting this block and the activityReads/recentActivity
            hooks at the top of HomeScreen. */}
        {/*
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {t('home.recentCount', { count: recentActivity.length })}
          </Text>
          {recentActivity.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/activity')}
              hitSlop={8}
              activeOpacity={0.7}
              style={styles.seeAllBtn}
            >
              <Text style={styles.seeAllLink}>{t('home.seeAll')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.sectionRule} />
        {recentActivity.length === 0 ? (
          <Text style={styles.noActivity}>{t('home.noActivity')}</Text>
        ) : (
          recentActivity.map((r) => (
            <View key={r.event.id} style={styles.activityRow}>
              <Text style={styles.activityText} numberOfLines={2}>
                {summariseActivity(r.event, t)}
              </Text>
              <Text style={styles.activityMeta}>{r.event.group_name ?? ''}</Text>
            </View>
          ))
        )}
        */}
      </ScrollView>
    </View>
  );
}

/**
 * Per-account error strip (spec §12).
 *
 * Retry is currently a visual affordance only — the aggregated-reads
 * hook auto-retries on every foreground transition (60s floor). A
 * follow-up wave is expected to expose an imperative per-server
 * `refresh()` from the hook so this CTA can wire to it directly.
 */
/**
 * Compact one-liner for the home-screen recent-activity preview. The
 * full templates with deep-link affordances live on the Activity tab —
 * this view's role is "what just happened across all my groups" so we
 * favour brevity over precision.
 */
function firstNameOf(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function summariseActivity(
  e: import('@/lib/api').ActivityEvent,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const actor = firstNameOf(e.actor_name) ?? t('common.dash');
  const group = e.group_name ?? '';
  const s = (e.payload?.snapshot ?? {}) as {
    title?: string;
    amount?: number;
    currency?: string;
    from_member_name?: string;
    to_member_name?: string;
  };
  const fromShort = firstNameOf(s.from_member_name) ?? actor;
  const toShort = firstNameOf(s.to_member_name) ?? t('common.dash');
  switch (e.event_type) {
    case 'expense_added': {
      const hasFull = !!s.title && s.amount != null && !!s.currency;
      if (!hasFull) return t('activity.event_expense_added_simple', { actor, group });
      return t('activity.event_expense_added', {
        actor,
        group,
        title: s.title,
        amount: formatMinorUnits(s.amount!, s.currency!),
      });
    }
    case 'expense_edited':
    case 'expense_updated':
      if (!s.title) return t('activity.event_expense_edited_simple', { actor, group });
      return t('activity.event_expense_edited', { actor, group, title: s.title });
    case 'expense_deleted':
      if (!s.title) return t('activity.event_expense_deleted_simple', { actor, group });
      return t('activity.event_expense_deleted', { actor, group, title: s.title });
    case 'settlement_added':
      return t('activity.event_settlement_added', {
        actor,
        group,
        from: fromShort,
        to: toShort,
        amount: s.amount != null && s.currency ? formatMinorUnits(s.amount, s.currency) : '',
      });
    case 'settlement_reverted':
      return t('activity.event_settlement_reverted', { actor, group });
    case 'member_joined':
      return t('activity.event_member_joined', { actor, group });
    case 'group_created':
      return t('activity.event_group_created', { actor, group });
    case 'group_archived':
      return t('activity.event_group_archived', { actor, group });
    default:
      return t('activity.event_generic', {
        actor,
        group,
        event: e.event_type,
      });
  }
}

function ErrorStrip({ label, cta }: { label: string; cta: string }) {
  return (
    <View style={styles.errorStrip}>
      <Text style={styles.errorStripText} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.errorStripCta}>{cta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  topAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  topActionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.2,
  },
  hero: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s5,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  heroBalance: {
    fontFamily: fontMono,
    fontSize: fontSize.displayXl,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    lineHeight: 66,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingTop: 2,
  },
  multiCurrencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s1,
    marginTop: spacing.s1,
  },
  currencyChip: {
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    borderRadius: 6,
    backgroundColor: colors.bone,
  },
  currencyChipAmt: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  // Groups section
  groupsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
  },
  groupsHeaderLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  cardWrap: {
    paddingHorizontal: spacing.s5,
    gap: spacing.s2,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 10,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
  },
  groupMid: {
    flex: 1,
    minWidth: 0,
  },
  groupTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    letterSpacing: -0.3,
    color: colors.graphite,
    lineHeight: 26,
  },
  groupAmtMuted: {
    fontFamily: fontMono,
    fontSize: fontSize.displayS,
    color: colors.lead,
  },
  groupMeta: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 3,
  },
  hostChip: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 3,
    letterSpacing: 0.4,
  },
  groupRight: {
    alignItems: 'flex-end',
    minWidth: 104,
  },
  groupAmtEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  groupAmt: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.displayS,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },

  // Error strips
  stripWrap: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    gap: spacing.s2,
  },
  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: 10,
    backgroundColor: colors.bone,
  },
  errorStripText: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    flex: 1,
    minWidth: 0,
    marginRight: spacing.s3,
  },
  errorStripCta: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
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
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionRule: {
    height: 1,
    backgroundColor: colors.ruleSoft,
    marginHorizontal: spacing.s5,
    marginBottom: spacing.s1,
  },
  noActivity: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
  },
  seeAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.bone,
  },
  seeAllLink: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  activityRow: {
    paddingVertical: 10,
    paddingHorizontal: spacing.s5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  activityText: {
    fontFamily: fontDisplay,
    fontSize: 14,
    color: colors.graphite,
    lineHeight: 19,
  },
  activityMeta: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: 2,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
    marginTop: spacing.s4,
  },
  emptyCtaLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
  },
});
