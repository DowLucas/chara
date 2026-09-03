/**
 * Monthly summary — one calendar month of the user's own spend on one
 * server. Hosted-only; reached from the You tab or the monthly push's
 * `chara://summary/<period>` deep link.
 *
 * Layout follows approach 1c ("shape of the month") from the design canvas
 * "Mobile app screen design approaches": a three-month strip instead of
 * prev/next arrows, an active-day grid, and share bars on the categories —
 * so the month has a shape before you read a number.
 *
 * Deliberately thin: every decision (period arithmetic, strip bounds, grid
 * padding, bar widths, the approximate flag, the sign of a net, the change
 * vs last month) lives in `lib/summary-view.ts` and is unit-tested there.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  barWidthPct,
  changeVsPrevious,
  dayGrid,
  hasContent,
  hasExcludedLegs,
  monthStrip,
  netDirection,
} from '@/lib/summary-view';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  groupAccentSwatches,
  spacing,
} from '@/lib/theme';

/** Asagi. --accent-3 in the canvas, which is what 1c is drawn with. */
const ACCENT = groupAccentSwatches[2];

/** 'YYYY-MM' as a month the user reads, in their own locale. */
function monthLabel(period: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m] = period.split('-').map((p) => parseInt(p, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(currentLocale(), {
    ...opts,
    timeZone: 'UTC',
  });
}

/** Money on the wire is a decimal string; the formatter takes minor units. */
function money(amount: string, currency: string): string {
  return formatMinorUnits(decimalToMinor(amount), currency);
}

/** Net is the one figure with a direction, so it is the one that shows a
 *  sign. formatMinorUnits already renders the minus. */
function signedNet(net: string, currency: string): string {
  const formatted = money(net, currency);
  return decimalToMinor(net) > 0 ? `+${formatted}` : formatted;
}

export default function MonthlySummaryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ server: string; period: string }>();
  const serverUrl = decodeURIComponent(params.server ?? '');
  const account = useAccount(serverUrl);
  const { homeCurrency } = useHomeCurrency();

  // The period is screen state, not a route push per step: paging months
  // should not stack a dozen entries on the back stack to unwind one by one.
  const [period, setPeriod] = useState(params.period ?? '');
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  // Latest-wins guard: tapping through the strip fires a request per tap,
  // and without this two quick taps can resolve out of order, leaving the
  // strip showing one month and the numbers another.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (p: string) => {
      if (!serverUrl || !p) return;
      const seq = ++requestSeq.current;
      setStatus('loading');
      try {
        const next = await apiFor(serverUrl).getSummary(p, homeCurrency);
        if (seq !== requestSeq.current) return;
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

  const strip = useMemo(
    () => monthStrip(period, data?.first_period ?? '', new Date()),
    [period, data?.first_period],
  );
  const cells = useMemo(
    () => dayGrid(period, data?.counts.active_dates ?? []),
    [period, data?.counts.active_dates],
  );
  const topPct = useMemo(
    () => (data?.categories ?? []).reduce((max, c) => Math.max(max, c.pct), 0),
    [data?.categories],
  );

  const header = (
    <TopBar
      title={t('monthlySummary.title')}
      left={
        <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
      }
    />
  );

  // The user signed out of this server between the push and the tap.
  if (!account) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <EmptyState
          title={t('monthlySummary.noAccount.title')}
          body={t('monthlySummary.noAccount.body')}
          icon="user-x"
        />
      </View>
    );
  }

  const change = data?.previous
    ? changeVsPrevious(data.converted.share, data.previous.share)
    : null;
  const currency = data?.converted.currency ?? homeCurrency;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <ContentContainer>
          {/* MONTH STRIP — replaces the prev/next arrows. Selected month is
              graphite-on-paper; the others sit quiet in bone. */}
          {strip.length > 1 && (
            <View style={styles.strip}>
              {strip.map((m) => (
                <TouchableOpacity
                  key={m.period}
                  style={[styles.stripBtn, m.selected && styles.stripBtnOn]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: m.selected }}
                  onPress={() => setPeriod(m.period)}
                >
                  <Text style={[styles.stripLabel, m.selected && styles.stripLabelOn]}>
                    {monthLabel(m.period, { month: 'short' }).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.graphite} />
            </View>
          ) : status === 'error' || !data ? (
            <View style={styles.center}>
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
              {/* HERO — share, then net and paid folded in beneath a rule.
                  1c puts the balance in the hero rather than a section of
                  its own, so the card answers "what did the month cost me". */}
              <View style={styles.hero}>
                <View style={styles.heroTop}>
                  <Text style={styles.eyebrow}>{t('monthlySummary.yourShare')}</Text>
                  {change !== null && (
                    <View style={styles.cmpPill}>
                      <Text style={styles.cmpText}>
                        {`${change >= 0 ? '+' : '−'}${Math.abs(change)}%`}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {money(data.converted.share, currency)}
                </Text>

                <View style={styles.heroRule} />
                <View style={styles.heroRow}>
                  <Text style={styles.heroRowLabel}>{t('monthlySummary.net')}</Text>
                  <Text
                    style={[
                      styles.heroNet,
                      {
                        color:
                          netDirection(data.converted.net) === 'owed'
                            ? colors.moss
                            : netDirection(data.converted.net) === 'owe'
                              ? colors.brick
                              : colors.graphite,
                      },
                    ]}
                  >
                    {signedNet(data.converted.net, currency)}
                  </Text>
                </View>
                <View style={styles.heroRowTight}>
                  <Text style={styles.heroRowLabel}>{t('monthlySummary.youPaid')}</Text>
                  <Text style={styles.heroPaid}>{money(data.converted.paid, currency)}</Text>
                </View>

                {hasExcludedLegs(data.converted) && (
                  <View style={styles.exclRow}>
                    <View style={styles.exclDot} />
                    <Text style={styles.exclText}>
                      {t('monthlySummary.excluded', { count: data.converted.estimated_legs })}
                    </Text>
                  </View>
                )}
              </View>

              {/* Per-currency truth as pills — shown only when the month
                  spanned more than one currency. */}
              {data.by_currency.length > 1 && (
                <View style={styles.pills}>
                  {data.by_currency.map((c) => (
                    <View key={c.currency} style={styles.pill}>
                      <Text style={styles.pillCode}>{c.currency}</Text>
                      <Text style={styles.pillAmt}>{money(c.share, c.currency)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* ACTIVE DAYS — the shape of the month at a glance. */}
              <View style={styles.card}>
                <View style={styles.heroTop}>
                  <Text style={styles.eyebrow}>{t('monthlySummary.activeDays')}</Text>
                  <Text style={styles.daysOf}>
                    {`${data.counts.active_days}/${cells.filter((c) => c.day !== null).length}`}
                  </Text>
                </View>
                <View style={styles.grid}>
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <View key={`dow-${i}`} style={styles.cell}>
                      <Text style={styles.dowLabel}>{d}</Text>
                    </View>
                  ))}
                  {cells.map((c, i) => (
                    <View
                      key={`c-${i}`}
                      style={[
                        styles.cell,
                        styles.dayCell,
                        c.day === null
                          ? styles.dayBlank
                          : c.active
                            ? { backgroundColor: ACCENT }
                            : styles.dayOff,
                      ]}
                    >
                      {c.day !== null && (
                        <Text style={[styles.dayText, c.active && styles.dayTextOn]}>
                          {String(c.day)}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: ACCENT }]} />
                    <Text style={styles.legendText}>
                      {`${data.counts.expenses} ${t('monthlySummary.expenses').toLowerCase()}`}
                    </Text>
                  </View>
                  <Text style={styles.legendText}>
                    {`${data.counts.groups} ${t('monthlySummary.groups').toLowerCase()}`}
                  </Text>
                </View>
              </View>

              {/* CATEGORIES — bars scaled against the biggest category. */}
              {data.categories.length > 0 && (
                <>
                  <Text style={styles.sectionEyebrow}>{t('monthlySummary.categories')}</Text>
                  {data.categories.map((c) => (
                    <View key={c.slug} style={styles.catRow}>
                      <View style={styles.catTop}>
                        <Text style={styles.catLabel} numberOfLines={1}>
                          {categoryLabel(c.slug, t)}
                        </Text>
                        <Text style={styles.catPct}>{`${c.pct}%`}</Text>
                        <Text style={styles.catAmt}>{money(c.share, currency)}</Text>
                      </View>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            { width: `${barWidthPct(c.pct, topPct)}%`, backgroundColor: ACCENT },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* HIGHLIGHTS — bone cards rather than list rows in 1c. */}
              {(data.highlights.biggest_expense || data.highlights.top_group) && (
                <>
                  <Text style={styles.sectionEyebrow}>{t('monthlySummary.highlights')}</Text>
                  {data.highlights.biggest_expense && (
                    <TouchableOpacity
                      style={styles.hlCard}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push(
                          `/expenses/${encodeURIComponent(serverUrl)}/${data.highlights.biggest_expense!.expense_id}`,
                        )
                      }
                    >
                      <View style={styles.hlMid}>
                        <Text style={styles.hlEyebrow}>
                          {t('monthlySummary.biggestExpense', {
                            group: data.highlights.biggest_expense.group_name,
                          })}
                        </Text>
                        <Text style={styles.hlName} numberOfLines={1}>
                          {data.highlights.biggest_expense.title}
                        </Text>
                        {/* Native currency: this is what was actually spent. */}
                        <Text style={styles.hlAmt}>
                          {money(
                            data.highlights.biggest_expense.share,
                            data.highlights.biggest_expense.currency,
                          )}
                        </Text>
                      </View>
                      <Text style={styles.hlChev}>›</Text>
                    </TouchableOpacity>
                  )}
                  {data.highlights.top_group && (
                    <TouchableOpacity
                      style={styles.hlCard}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      onPress={() =>
                        router.push(
                          `/groups/${encodeURIComponent(serverUrl)}/${data.highlights.top_group!.group_id}`,
                        )
                      }
                    >
                      <View style={styles.hlMid}>
                        <Text style={styles.hlEyebrow}>{t('monthlySummary.topGroup')}</Text>
                        <Text style={styles.hlName} numberOfLines={1}>
                          {data.highlights.top_group.name}
                        </Text>
                        <Text style={styles.hlAmt}>
                          {money(data.highlights.top_group.share, currency)}
                        </Text>
                      </View>
                      <Text style={styles.hlChev}>›</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: spacing.s7 },
  center: { paddingVertical: spacing.s8, alignItems: 'center', gap: spacing.s4 },
  errorNote: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    paddingHorizontal: spacing.s5,
  },
  retryBtn: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.s5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.graphite,
  },
  retryLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },

  strip: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
  },
  stripBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bone,
  },
  stripBtnOn: { backgroundColor: colors.graphite },
  stripLabel: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    letterSpacing: 0.8,
    color: colors.lead,
  },
  stripLabelOn: { color: colors.paper },

  hero: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    padding: spacing.s5,
  },
  heroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  eyebrow: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.caption,
    letterSpacing: 0.4,
    color: colors.lead,
  },
  cmpPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
  },
  cmpText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  heroAmount: {
    marginTop: spacing.s3,
    fontFamily: fontMono,
    fontSize: fontSize.displayL,
    letterSpacing: -1.6,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  heroRule: {
    marginTop: spacing.s4,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    paddingTop: spacing.s4,
  },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heroRowTight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.s1,
  },
  heroRowLabel: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead },
  heroNet: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.displayS,
    fontVariant: ['tabular-nums'],
  },
  heroPaid: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
  },
  exclRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.s3 },
  exclDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.citrine },
  exclText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead, flexShrink: 1 },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
  },
  pillCode: { fontFamily: fontMonoMedium, fontSize: fontSize.caption, letterSpacing: 0.6 },
  pillAmt: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
  },

  card: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s5,
    padding: spacing.s4,
  },
  daysOf: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    fontVariant: ['tabular-nums'],
    color: colors.graphite,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.s3 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dowLabel: { fontFamily: fontMono, fontSize: 11, color: colors.lead },
  dayCell: { height: 26 },
  dayBlank: { backgroundColor: 'transparent' },
  dayOff: { backgroundColor: 'rgba(45,31,26,0.05)', borderRadius: 4 },
  dayText: { fontFamily: fontMono, fontSize: 11, color: colors.lead, fontVariant: ['tabular-nums'] },
  dayTextOn: { color: colors.fgOnAccent },
  legend: { flexDirection: 'row', gap: spacing.s4, marginTop: spacing.s3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },

  sectionEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    letterSpacing: 0.3,
    color: colors.lead,
    marginHorizontal: spacing.s5,
    marginTop: spacing.s5,
    marginBottom: spacing.s3,
  },
  catRow: { marginHorizontal: spacing.s4, marginBottom: spacing.s3 },
  catTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.s3 },
  catLabel: { flex: 1, fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.graphite },
  catPct: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  catAmt: {
    width: 100,
    textAlign: 'right',
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  track: {
    marginTop: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bone,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },

  hlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    padding: spacing.s4,
  },
  hlMid: { flex: 1, minWidth: 0 },
  hlEyebrow: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
  hlName: {
    marginTop: 4,
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  hlAmt: {
    marginTop: 3,
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  hlChev: { fontFamily: fontMono, fontSize: fontSize.bodyL, color: colors.lead },
});
