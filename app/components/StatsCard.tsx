/**
 * Read-only statistics block for the group-settings hub. Renders
 * member count, expense count, per-currency totals, top spender, and
 * created date.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md
 *       §"Components" — `StatsCard.tsx`.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './Text';
import { formatMinorUnits, formatDate } from '../lib/i18n';
import type { GroupStats } from '../lib/api';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '../lib/theme';

interface Props {
  stats: GroupStats | null;
  /** Loading shimmer support — caller passes `true` while the GET is in
   *  flight. Stays minimal: shows empty rows. */
  loading?: boolean;
}

export function StatsCard({ stats, loading }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('groupSettings.stats.title')}</Text>
      <View style={styles.rule} />

      {stats == null || loading ? (
        <Text style={styles.placeholder}>{t('common.loading')}</Text>
      ) : (
        <>
          <Row label={t('groupSettings.stats.memberCount')} value={String(stats.member_count)} />
          <Row
            label={t('groupSettings.stats.totalExpenses')}
            value={String(stats.expense_count)}
          />
          <View style={styles.totalsBlock}>
            <Text style={styles.label}>{t('groupSettings.stats.totalSpent')}</Text>
            {stats.totals_by_currency.length === 0 ? (
              <Text style={styles.placeholder}>
                {t('groupSettings.stats.noActivityYet')}
              </Text>
            ) : (
              <View style={styles.totalsCol}>
                {stats.totals_by_currency.map((row) => (
                  <Text key={row.currency} style={styles.totalLine}>
                    {formatMinorUnits(row.minor_units, row.currency)}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {stats.top_spender && (
            <View style={styles.topSpenderRow}>
              <Text style={styles.label}>{t('groupSettings.stats.topSpender')}</Text>
              <View style={styles.topSpenderRight}>
                <Text style={styles.topSpenderName} numberOfLines={1}>
                  {stats.top_spender.display_name}
                </Text>
                <Text style={styles.topSpenderAmount}>
                  {formatMinorUnits(
                    stats.top_spender.minor_units_paid,
                    stats.top_spender.currency,
                  )}
                </Text>
              </View>
            </View>
          )}

          <Row
            label={t('groupSettings.stats.created')}
            value={formatDate(stats.created_at)}
          />
        </>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.s5,
    marginTop: spacing.s4,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 8,
    backgroundColor: colors.paper,
  },
  title: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: spacing.s2,
  },
  rule: {
    height: 0.5,
    backgroundColor: colors.ruleSoft,
    marginBottom: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s2,
  },
  label: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
  },
  value: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  totalsBlock: {
    paddingVertical: spacing.s2,
  },
  totalsCol: {
    alignItems: 'flex-end',
    marginTop: spacing.s1,
  },
  totalLine: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  topSpenderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s2,
    gap: spacing.s3,
  },
  topSpenderRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  topSpenderName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
  },
  topSpenderAmount: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  placeholder: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    paddingVertical: spacing.s2,
  },
});
