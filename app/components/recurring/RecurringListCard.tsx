/**
 * Bone-card row for a recurring expense in the list view.
 *
 * Spec: docs/superpowers/specs/2026-05-24-recurring-expenses-design.md
 *
 * Layout (paper bg, bone card, no border, radius 10):
 *   Title (display)                      8 500 SEK (mono+tabular)
 *   every month · next Jun 1             (body, graphite)
 *   paid by …  · split equally           (body, lead)
 *   [paused chip — only when status=paused]
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import type { RecurringExpense } from '@/lib/api-types-recurring';
import { formatDate, formatMinorUnits } from '@/lib/i18n';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMonoMedium,
  fontMono,
  fontSize,
  spacing,
} from '@/lib/theme';

interface Props {
  rule: RecurringExpense;
  /** Optional display name of the payer, looked up by caller (members
   *  blob lives on the group, not on the rule). */
  payerName?: string;
  /** Optional display name of the member that left, when
   *  paused_reason === 'member_left'. */
  leftMemberName?: string;
  onPress: () => void;
  onLongPress?: () => void;
}

export function RecurringListCard({
  rule,
  payerName,
  leftMemberName,
  onPress,
  onLongPress,
}: Props) {
  const { t } = useTranslation();

  const scheduleLine = t(`recurring.schedule.every_${rule.freq_unit}`, {
    count: rule.freq_interval,
  });

  // Compact meta line — full "at HH:MM (tz)" preview lives on the form.
  const nextLine =
    rule.status === 'active'
      ? `${scheduleLine} · next ${formatDate(rule.next_fire_at)}`
      : scheduleLine;

  const splitWord =
    rule.split_method === 'equal'
      ? t('addExpense.split.equal', { defaultValue: 'split equally' })
      : rule.split_method === 'exact'
        ? t('addExpense.split.exact', { defaultValue: 'split by amount' })
        : t('addExpense.split.percentage', { defaultValue: 'split by percent' });

  const paidBy = payerName
    ? t('expense.paidByName', { name: payerName, defaultValue: `paid by ${payerName}` })
    : '';
  const metaLine = [paidBy, splitWord].filter(Boolean).join(' · ');

  const pausedLabel =
    rule.status === 'paused' && rule.paused_reason
      ? t(`recurring.paused.${rule.paused_reason}`, {
          name: leftMemberName ?? '',
        })
      : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: colors.ruleSoft }}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${rule.title} ${formatMinorUnits(rule.amount_minor, rule.currency)}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>
          {rule.title}
        </Text>
        <Text style={styles.amount} numberOfLines={1}>
          {formatMinorUnits(rule.amount_minor, rule.currency)}
        </Text>
      </View>

      <Text style={styles.schedule} numberOfLines={1}>
        {nextLine}
      </Text>

      {metaLine.length > 0 && (
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine}
        </Text>
      )}

      {pausedLabel && (
        <View style={styles.pausedChip}>
          <Text style={styles.pausedLabel} numberOfLines={2}>
            {pausedLabel}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bone,
    borderRadius: 10,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  cardPressed: { opacity: 0.85 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  title: {
    flex: 1,
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
  },
  amount: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    fontVariant: ['tabular-nums'],
  },
  schedule: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    marginTop: spacing.s1,
  },
  meta: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    marginTop: 2,
  },
  pausedChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.s2,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    backgroundColor: 'transparent',
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.brick,
  },
  pausedLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.brick,
    letterSpacing: 0.3,
  },
});
