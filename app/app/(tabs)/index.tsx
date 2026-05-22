import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { AvatarStack } from '@/components/Avatar';
import { Stamp } from '@/components/Stamp';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { Group, MyBalance } from '@/lib/api';
import { useAccounts } from '@/lib/accounts';
import { useAggregatedGroups, useAggregatedBalances } from '@/lib/aggregated-reads';
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
        title={t('app.name')}
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
        contentContainerStyle={{ paddingBottom: spacing.s5 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Net balance hero */}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>{t('home.netBalance')}</Text>
          {netByCurrency.length === 0 ? (
            <Text style={[styles.heroBalance, { color: colors.lead }]}>
              {fmtBalance('0', primaryCurrency)}
            </Text>
          ) : (
            <Text
              style={[
                styles.heroBalance,
                { color: primaryNet >= 0 ? colors.moss : colors.brick },
              ]}
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
                    onPress={() =>
                      router.push(`/groups/${encodeURIComponent(serverUrl)}/${g.id}`)
                    }
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

        {/* Recent activity (placeholder until we wire useAggregatedActivity here) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('home.recentCount', { count: 0 })}</Text>
        </View>
        <View style={styles.sectionRule} />
        <Text style={styles.noActivity}>{t('home.noActivity')}</Text>
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
  multiCurrencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  currencyChip: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
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
    paddingTop: spacing.s3,
    paddingBottom: spacing.s2,
  },
  groupsHeaderLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
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
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
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
  hostChip: {
    fontFamily: fontMono,
    fontSize: 10,
    color: colors.lead,
    marginTop: 2,
    letterSpacing: 0.4,
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
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    backgroundColor: colors.bone,
  },
  errorStripText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
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
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
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
