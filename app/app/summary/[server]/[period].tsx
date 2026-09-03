/**
 * Monthly summary — one calendar month of the user's own spend on one
 * server. Hosted-only; reached from the You tab or the monthly push's
 * `chara://summary/<period>` deep link.
 *
 * Deliberately thin: every decision (period arithmetic, the prev/next
 * bounds, the approximate flag, the sign of a net, the change vs last
 * month) lives in `lib/summary-view.ts` and is unit-tested there.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { apiFor, type SummaryResponse } from '@/lib/api';
import { useAccount } from '@/lib/accounts';
import { useHomeCurrency } from '@/lib/use-home-currency';
import { categoryLabel } from '@/lib/categories';
import { formatMinorUnits, currentLocale } from '@/lib/i18n';
import { decimalToMinor } from '@/lib/money-utils';
import {
  canGoNext,
  canGoPrevious,
  changeVsPrevious,
  hasContent,
  hasExcludedLegs,
  netDirection,
  shiftPeriod,
} from '@/lib/summary-view';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

/** 'YYYY-MM' as a month the user reads, in their own locale. Formatting
 *  lives here rather than in summary-view because it needs the locale. */
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map((p) => parseInt(p, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(currentLocale(), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Money on the wire is a decimal string; the formatter takes minor units. */
function money(amount: string, currency: string): string {
  return formatMinorUnits(decimalToMinor(amount), currency);
}

export default function MonthlySummaryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ server: string; period: string }>();
  const serverUrl = decodeURIComponent(params.server ?? '');
  const account = useAccount(serverUrl);
  const { homeCurrency } = useHomeCurrency();

  // The period is screen state, not a route push per step: paging months
  // should not stack a dozen entries on the back stack for the user to
  // unwind one at a time.
  const [period, setPeriod] = useState(params.period ?? '');
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  // Latest-wins guard. Paging months fires a request per tap, and without
  // this two quick taps can resolve out of order, leaving the header showing
  // one month and the numbers another. Same pattern as use-summary-server.ts.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (p: string) => {
      if (!serverUrl || !p) return;
      const seq = ++requestSeq.current;
      setStatus('loading');
      try {
        const next = await apiFor(serverUrl).getSummary(p, homeCurrency);
        if (seq !== requestSeq.current) return; // a newer month is in flight
        setData(next);
        setStatus('ok');
      } catch {
        if (seq !== requestSeq.current) return;
        setData(null);
        setStatus('error');
      }
    },
    [serverUrl, homeCurrency],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const showPrev = useMemo(
    () => (data ? canGoPrevious(period, data.first_period) : false),
    [data, period],
  );
  const showNext = useMemo(() => canGoNext(period), [period]);

  // The user signed out of this server between the push and the tap.
  if (!account) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopBar
          title={t('monthlySummary.title')}
          left={
            <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
          }
        />
        <EmptyState
          title={t('monthlySummary.noAccount.title')}
          body={t('monthlySummary.noAccount.body')}
          icon="user-x"
        />
      </View>
    );
  }

  const change = data?.previous ? changeVsPrevious(data.converted.share, data.previous.share) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('monthlySummary.title')}
        left={
          <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ContentContainer>
          <View style={styles.monthNav}>
            {/* Hidden rather than disabled: IconButton has no disabled
                state, and a tappable-looking arrow that does nothing is
                worse than no arrow. The spacer keeps the month centred. */}
            {showPrev ? (
              <IconButton
                icon="chevron-left"
                onPress={() => setPeriod(shiftPeriod(period, -1))}
                label={t('monthlySummary.previousMonth')}
              />
            ) : (
              <View style={styles.navSpacer} />
            )}
            <Text style={styles.month}>{monthLabel(period)}</Text>
            {showNext ? (
              <IconButton
                icon="chevron-right"
                onPress={() => setPeriod(shiftPeriod(period, 1))}
                label={t('monthlySummary.nextMonth')}
              />
            ) : (
              <View style={styles.navSpacer} />
            )}
          </View>

          {status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.lead} />
            </View>
          ) : status === 'error' || !data ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorNote}>{t('monthlySummary.loadError')}</Text>
              <TouchableOpacity
                onPress={() => void load(period)}
                style={styles.retryBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.retryLabel}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : !hasContent(data) ? (
            <EmptyState
              title={t('monthlySummary.empty.title')}
              body={t('monthlySummary.empty.body')}
              icon="calendar"
            />
          ) : (
            <>
              {/* Hero: what the month cost this user. */}
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>{t('monthlySummary.yourShare')}</Text>
                <Text style={styles.heroAmount}>
                  {money(data.converted.share, data.converted.currency)}
                </Text>
                {change !== null && (
                  <Text style={styles.heroMeta}>
                    {t('monthlySummary.changeVsPrevious', {
                      pct: Math.abs(change),
                      context: change >= 0 ? 'up' : 'down',
                    })}
                  </Text>
                )}
                {hasExcludedLegs(data.converted) && (
                  <Text style={styles.approxNote}>
                    {t('monthlySummary.excluded', { count: data.converted.estimated_legs })}
                  </Text>
                )}
              </View>

              {/* Counts. Neutral facts, so graphite throughout. */}
              <View style={styles.statRow}>
                <Stat value={String(data.counts.expenses)} label={t('monthlySummary.expenses')} />
                <Stat value={String(data.counts.groups)} label={t('monthlySummary.groups')} />
                <Stat value={String(data.counts.active_days)} label={t('monthlySummary.activeDays')} />
              </View>

              {/* Paid vs net. Net is the only value with a direction, so it
                  is the only one that gets a signal colour. */}
              <Text style={styles.eyebrow}>{t('monthlySummary.balanceSection')}</Text>
              <View style={styles.list}>
                <InfoRow
                  label={t('monthlySummary.youPaid')}
                  value={money(data.converted.paid, data.converted.currency)}
                />
                <InfoRow
                  label={t('monthlySummary.net')}
                  value={money(data.converted.net, data.converted.currency)}
                  color={
                    netDirection(data.converted.net) === 'owed'
                      ? colors.moss
                      : netDirection(data.converted.net) === 'owe'
                        ? colors.brick
                        : colors.graphite
                  }
                />
              </View>

              {/* Per-currency truth, shown whenever the month was not a
                  single-currency one — `converted` is a derived number and
                  this is the unconverted source. */}
              {data.by_currency.length > 1 && (
                <>
                  <Text style={styles.eyebrow}>{t('monthlySummary.byCurrency')}</Text>
                  <View style={styles.list}>
                    {data.by_currency.map((c) => (
                      <InfoRow
                        key={c.currency}
                        label={c.currency}
                        value={money(c.share, c.currency)}
                      />
                    ))}
                  </View>
                </>
              )}

              {data.categories.length > 0 && (
                <>
                  <Text style={styles.eyebrow}>{t('monthlySummary.categories')}</Text>
                  <View style={styles.list}>
                    {data.categories.map((c) => (
                      <View key={c.slug} style={styles.categoryRow}>
                        <Text style={styles.rowLabel} numberOfLines={1}>
                          {categoryLabel(c.slug, t)}
                        </Text>
                        <Text style={styles.categoryPct}>{`${c.pct}%`}</Text>
                        <Text style={styles.rowValue}>
                          {money(c.share, data.converted.currency)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {(data.highlights.biggest_expense || data.highlights.top_group) && (
                <>
                  <Text style={styles.eyebrow}>{t('monthlySummary.highlights')}</Text>
                  <View style={styles.list}>
                    {data.highlights.biggest_expense && (
                      <TouchableOpacity
                        style={styles.navRow}
                        activeOpacity={0.7}
                        onPress={() =>
                          router.push(
                            `/expenses/${encodeURIComponent(serverUrl)}/${data.highlights.biggest_expense!.expense_id}`,
                          )
                        }
                      >
                        <View style={styles.navRowMid}>
                          <Text style={styles.rowLabel} numberOfLines={1}>
                            {data.highlights.biggest_expense.title}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {t('monthlySummary.biggestExpense', {
                              group: data.highlights.biggest_expense.group_name,
                            })}
                          </Text>
                        </View>
                        {/* Native currency, not the home one: the amount is
                            what the user actually spent. */}
                        <Text style={styles.rowValue}>
                          {money(
                            data.highlights.biggest_expense.share,
                            data.highlights.biggest_expense.currency,
                          )}
                        </Text>
                        <Feather name="chevron-right" size={18} color={colors.lead} />
                      </TouchableOpacity>
                    )}
                    {data.highlights.top_group && (
                      <TouchableOpacity
                        style={styles.navRow}
                        activeOpacity={0.7}
                        onPress={() =>
                          router.push(
                            `/groups/${encodeURIComponent(serverUrl)}/${data.highlights.top_group!.group_id}`,
                          )
                        }
                      >
                        <View style={styles.navRowMid}>
                          <Text style={styles.rowLabel} numberOfLines={1}>
                            {data.highlights.top_group.name}
                          </Text>
                          <Text style={styles.rowMeta}>{t('monthlySummary.topGroup')}</Text>
                        </View>
                        <Text style={styles.rowValue}>
                          {money(data.highlights.top_group.share, data.converted.currency)}
                        </Text>
                        <Feather name="chevron-right" size={18} color={colors.lead} />
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </>
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: spacing.s8 },
  center: { paddingVertical: spacing.s8, alignItems: 'center' },

  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  month: { fontFamily: fontDisplay, fontSize: fontSize.displayS, color: colors.graphite },
  navSpacer: { width: 40 },

  hero: { alignItems: 'center', paddingVertical: spacing.s6 },
  heroLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  heroAmount: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayM,
    color: colors.graphite,
    marginTop: spacing.s2,
    fontVariant: ['tabular-nums'],
  },
  heroMeta: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead, marginTop: spacing.s2 },
  approxNote: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: spacing.s1,
  },

  statRow: { flexDirection: 'row', paddingHorizontal: spacing.s4, gap: spacing.s2 },
  stat: {
    flex: 1,
    backgroundColor: colors.bone,
    borderRadius: 10,
    paddingVertical: spacing.s4,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fontMono,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontFamily: fontBody, fontSize: fontSize.caption, color: colors.lead },

  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    paddingHorizontal: spacing.s5,
    marginTop: spacing.s6,
    marginBottom: spacing.s2,
  },
  list: { borderTopWidth: 1, borderTopColor: colors.ruleSoft },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  categoryPct: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  navRowMid: { flex: 1 },
  rowLabel: { flex: 1, fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  rowMeta: { fontFamily: fontBody, fontSize: fontSize.caption, color: colors.lead },
  rowValue: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },

  errorWrap: { alignItems: 'center', paddingVertical: spacing.s8, gap: spacing.s3 },
  errorNote: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.brick },
  retryBtn: { paddingHorizontal: spacing.s5, paddingVertical: spacing.s2 },
  retryLabel: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.graphite },
});
