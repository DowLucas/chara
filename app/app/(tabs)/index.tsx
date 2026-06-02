import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { GroupAvatar } from '@/components/GroupAvatar';
import { AvatarStack } from '@/components/Avatar';
import { Stamp } from '@/components/Stamp';
import { EmptyState } from '@/components/EmptyState';
import { MoneyText } from '@/components/MoneyText';
import { useTranslation } from 'react-i18next';
import { apiFor, Group, GroupMember, MyBalance } from '@/lib/api';
import { useAccounts } from '@/lib/accounts';
import { readCache, writeCache } from '@/lib/cache';
import { initialsOf } from '@/lib/name';
import {
  useAggregatedGroups,
  useAggregatedBalances,
  useAggregatedMyNet,
  refreshAggregatedReads,
  // useAggregatedActivity, // re-enable with the recent-activity section
} from '@/lib/aggregated-reads';
import { showAlert } from '@/lib/app-alert';
import { useHomeCurrency } from '@/lib/use-home-currency';
import { aggregateMyNetReads } from '@/lib/aggregate-mynet';
import { formatMinorUnits, formatMinorUnitsCompact, decimalToMinor } from '@/lib/i18n';
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
import { displayHostFor } from '@/lib/server-url';

const fmtBalance = (minor: string, currency: string) =>
  formatMinorUnits(minor, currency, { relative: true });
/** Hero-only formatter: hair-spaces in place of locale spaces so a long
 *  number like "−10 019 JPY" doesn't blow past the screen edge. */
const fmtHero = (minor: number | string, currency: string) =>
  formatMinorUnitsCompact(minor, currency, { relative: true });
const fmtAmount = (minor: string, currency: string) => formatMinorUnits(minor, currency);

// Host renders go through `displayHostFor` so the canonical hosted URL
// (api.chara.app) shows as the brand label "Chara Cloud"
// instead of leaking infra details into the UI. Self-hosted URLs still
// render as the bare host.

interface MergedGroup {
  group: Group;
  serverUrl: string;
  /** All per-currency balance rows for this group. Empty when the user has
   *  no balance entries yet (new group / fully settled). Multi-currency
   *  groups carry one row per currency. */
  balances: MyBalance[];
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

  // Pull-to-refresh has its own short-lived spinner state — `status` only
  // becomes 'loading' on the *first* fetch (data == null), so a subsequent
  // refetch would otherwise show no spinner at all. The hook is fire-and-
  // forget; we keep the spinner up for ~600 ms so the gesture has tactile
  // feedback even on a fast network.
  const [refreshing, setRefreshing] = useState(false);

  // Merge: concatenate all groups, attach every per-currency balance row for
  // that group. We keep the full list (not just one row) so the card can
  // detect mixed-sign positions across currencies — e.g. you're owed €100
  // but still owe $30 in the same group. Collapsing to a single row would
  // hide that and the "+€100" hero reads as "I'm owed", which is false.
  const mergedGroups: MergedGroup[] = useMemo(() => {
    const balancesByKey = new Map<string, MyBalance[]>();
    for (const br of balanceReads) {
      for (const b of br.data ?? []) {
        const key = `${br.serverUrl}::${b.group_id}`;
        const list = balancesByKey.get(key);
        if (list) list.push(b);
        else balancesByKey.set(key, [b]);
      }
    }
    const rows: MergedGroup[] = [];
    for (const gr of groupReads) {
      for (const g of gr.data ?? []) {
        rows.push({
          group: g,
          serverUrl: gr.serverUrl,
          balances: balancesByKey.get(`${gr.serverUrl}::${g.id}`) ?? [],
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

  // Cross-currency "≈" aggregate. Each per-account `/api/me/net?in=<home>`
  // returns the server's locked-in historical-FX sum; we add them up here
  // for the cross-server total. Spec:
  // docs/superpowers/specs/2026-05-24-home-currency-aggregation-design.md.
  const { homeCurrency } = useHomeCurrency();
  const myNetReads = useAggregatedMyNet(homeCurrency);

  const aggregatedHomeNet = useMemo(
    () => aggregateMyNetReads(myNetReads, accounts.length),
    [myNetReads, accounts.length],
  );

  // Render the "≈" line only when at least one balance row is in a
  // currency other than the home currency. For monocurrency users the
  // aggregate is identical to the per-currency hero — extra chrome with
  // no information (council §"Gating", Reviewer 5).
  const hasForeignBalance = useMemo(
    () =>
      balanceReads.some((r) =>
        (r.data ?? []).some((b) => b.currency !== homeCurrency),
      ),
    [balanceReads, homeCurrency],
  );
  const showHomeNet = !!aggregatedHomeNet && hasForeignBalance;
  const homeNetEstimated =
    !!aggregatedHomeNet &&
    (aggregatedHomeNet.skippedAccounts > 0 ||
      aggregatedHomeNet.estimatedLegs > 0);

  function explainHomeNet() {
    if (!aggregatedHomeNet) return;
    const lines: string[] = [];
    if (aggregatedHomeNet.skippedAccounts > 0) {
      lines.push(
        t('home.homeNetSheetPartial', {
          ok: aggregatedHomeNet.okAccounts,
          total: aggregatedHomeNet.totalAccounts,
        }),
      );
    }
    if (aggregatedHomeNet.estimatedLegs > 0) {
      lines.push(
        t('home.homeNetSheetEstimated', { count: aggregatedHomeNet.estimatedLegs }),
      );
    }
    if (lines.length === 0) lines.push(t('home.homeNetSheetHealthy'));
    showAlert({
      title: t('home.homeNetSheetTitle'),
      message: [t('home.homeNetSheetIntro'), ...lines].join('\n\n'),
      buttons: [{ key: 'ok', label: t('common.ok') }],
    });
  }

  const onRefresh = () => {
    setRefreshing(true);
    refreshAggregatedReads();
    // Hide the spinner shortly after the fetches have a chance to land.
    // The hook's internal state will have updated by then; if not, the
    // user can pull again.
    setTimeout(() => setRefreshing(false), 600);
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
        <ContentContainer>
        {/* Net balance hero
            When the user has any non-home-currency exposure (showHomeNet),
            the home-currency aggregate IS the hero. The per-currency
            natives demote to chips below — they're still the source of
            truth per-currency, just secondary. For monocurrency users
            the per-currency hero stays as-is. */}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{t('home.netBalance')}</Text>
          {showHomeNet ? (
            <>
              <View style={styles.heroRow}>
                <MoneyText
                  value={fmtHero(aggregatedHomeNet!.minor, homeCurrency)}
                  style={[
                    styles.heroBalance,
                    { color: aggregatedHomeNet!.minor >= 0 ? colors.moss : colors.brick },
                    { flexShrink: 1 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.35}
                />
                <TouchableOpacity
                  onPress={explainHomeNet}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.homeNetInfoLabel')}
                  style={styles.heroInfoBtn}
                >
                  <Feather
                    name="info"
                    size={18}
                    color={homeNetEstimated ? colors.vermillion : colors.lead}
                    strokeWidth={1.5}
                  />
                </TouchableOpacity>
              </View>
              {/* Per-currency native chips intentionally omitted in the
                  home-aggregate view — with N groups in N currencies the
                  chip row explodes. The info sheet covers the disclosure
                  the chips used to carry. */}
            </>
          ) : netByCurrency.length === 0 ? (
            <MoneyText
              value={fmtHero('0', primaryCurrency)}
              style={[styles.heroBalance, { color: colors.lead }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.35}
            />
          ) : (
            <>
              <MoneyText
                value={fmtHero(primaryNet, primaryCurrency)}
                style={[
                  styles.heroBalance,
                  { color: primaryNet >= 0 ? colors.moss : colors.brick },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.35}
              />
              {netByCurrency.length > 1 && (
                <View style={styles.multiCurrencyRow}>
                  {netByCurrency.slice(1).map((c) => (
                    <View key={c.currency} style={styles.currencyChip}>
                      <MoneyText
                        value={fmtBalance(String(c.minor), c.currency)}
                        style={[
                          styles.currencyChipAmt,
                          { color: c.minor >= 0 ? colors.moss : colors.brick },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
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
              {mergedGroups.map(({ group: g, serverUrl, balances }) => {
                const hasActivity = balances.length > 0;
                // Display the dominant currency: largest absolute net wins.
                // Ties break by the row order from the server (deterministic
                // since the backend returns by currency).
                const dominant = hasActivity
                  ? [...balances].sort(
                      (a, b) =>
                        Math.abs(decimalToMinor(b.net_balance)) -
                        Math.abs(decimalToMinor(a.net_balance)),
                    )[0]
                  : null;
                const n = dominant ? decimalToMinor(dominant.net_balance) : 0;
                const displayCurrency = dominant?.currency ?? g.currency;
                const settled =
                  hasActivity && balances.every((b) => decimalToMinor(b.net_balance) === 0);
                // Mixed signs across currencies in the same group: the
                // dominant row hides debt (or credit) in another currency.
                // Headline reads "+€100" while you actually still owe $30.
                const hasPositive = balances.some((b) => decimalToMinor(b.net_balance) > 0);
                const hasNegative = balances.some((b) => decimalToMinor(b.net_balance) < 0);
                const mixedSigns = hasPositive && hasNegative;
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
                      <View style={styles.groupMetaRow}>
                        {/* No icon for the "active" state — that's the
                            default and an icon there would just add noise.
                            Show a marker only when the state is worth
                            calling out: settled (positive) or new (no
                            activity yet). */}
                        {hasActivity && settled ? (
                          <Feather
                            name="check-circle"
                            size={12}
                            color={colors.moss}
                            strokeWidth={1.8}
                            accessibilityLabel={t('home.statusSettled')}
                          />
                        ) : !hasActivity ? (
                          <Feather
                            name="feather"
                            size={12}
                            color={colors.lead}
                            strokeWidth={1.8}
                            accessibilityLabel={t('home.statusNew')}
                          />
                        ) : null}
                        <GroupMemberStrip serverUrl={serverUrl} groupId={g.id} />
                      </View>
                      {showHostChip && (
                        <Text style={styles.hostChip} numberOfLines={1}>
                          {t('home.hostChip', { host: displayHostFor(serverUrl, t('common.mainServerLabel')) })}
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
                          <View style={styles.groupEyebrowRow}>
                            {mixedSigns && (
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation();
                                  showAlert({
                                    title: t('home.mixedSignsTitle'),
                                    message: t('home.mixedSignsBody'),
                                    buttons: [{ key: 'ok', label: t('common.ok') }],
                                  });
                                }}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t('home.mixedSignsLabel')}
                              >
                                <Feather
                                  name="alert-triangle"
                                  size={12}
                                  color={colors.vermillion}
                                  strokeWidth={1.8}
                                />
                              </TouchableOpacity>
                            )}
                            <Text style={styles.groupAmtEyebrow}>
                              {n > 0 ? t('home.youreOwedStamp') : t('home.youOweStamp')}
                            </Text>
                          </View>
                          <MoneyText
                            value={fmtAmount(String(Math.abs(n)), displayCurrency)}
                            style={[
                              styles.groupAmt,
                              { color: n > 0 ? colors.moss : colors.brick },
                            ]}
                            numberOfLines={1}
                          />
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
                label={t('home.errorStrip', { host: displayHostFor(r.serverUrl, t('common.mainServerLabel')) })}
                cta={t('home.retry')}
              />
            ))}
            {failingBalanceAccounts
              .filter((r) => !failingGroupAccounts.some((g) => g.serverUrl === r.serverUrl))
              .map((r) => (
                <ErrorStrip
                  key={`b-${r.serverUrl}`}
                  label={t('home.errorStrip', { host: displayHostFor(r.serverUrl, t('common.mainServerLabel')) })}
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
                  {displayHostFor(a.serverUrl, t('common.mainServerLabel'))} ·{' '}
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
        </ContentContainer>
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

const MEMBER_STRIP_MAX = 10;

/**
 * Per-card member preview. Hydrates from the on-disk cache for an instant
 * render, then refreshes in the background. We avoid wiring this into
 * `useAggregated*` because the fan-out is `accounts × groups`, not
 * `accounts × 1` — a bespoke per-card hook keeps the home-screen
 * aggregated machinery focused on the cold-start endpoints.
 */
function GroupMemberStrip({ serverUrl, groupId }: { serverUrl: string; groupId: string }) {
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const cacheEndpoint = `members:${groupId}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // SWR: paint from cache immediately so the avatar strip doesn't pop
      // in on every home render. Cache is `(serverUrl, userId, endpoint)`-
      // keyed; on the home screen we don't have userId handy, so the bare
      // serverUrl + endpoint scope is enough for a per-device best-effort
      // preview.
      const cached = await readCache<GroupMember[]>({
        serverUrl,
        userId: '',
        endpoint: cacheEndpoint,
      });
      if (!cancelled && cached?.value) setMembers(cached.value);
      try {
        // The backend has no bare `GET /api/groups/{id}/members` —
        // members are bundled into `GET /api/groups/{id}` (GroupDetail).
        // Slightly more payload than we need, but avoids a protocol
        // change just for a home-screen avatar preview.
        const detail = await apiFor(serverUrl).getGroup(groupId);
        if (cancelled) return;
        const fresh = detail.members ?? [];
        setMembers(fresh);
        await writeCache({ serverUrl, userId: '', endpoint: cacheEndpoint }, fresh);
      } catch (e) {
        if (__DEV__) console.warn('[home] getGroup for members failed', serverUrl, groupId, e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverUrl, groupId, cacheEndpoint]);

  if (!members || members.length === 0) return null;
  const people = members.map((m) => ({ initials: initialsOf(m.name) }));
  return <AvatarStack people={people} max={MEMBER_STRIP_MAX} overflow="ellipsis" tone="paper" />;
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
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 66,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingTop: 2,
  },
  homeNetLine: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.lead,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
    marginBottom: 6,
  },
  homeNetSuffix: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
  heroSubLine: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.5,
    textTransform: 'lowercase',
    marginTop: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  heroInfoBtn: {
    paddingTop: 12,
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
  groupMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: 6,
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
  groupEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  groupAmtEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
