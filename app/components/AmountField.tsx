/**
 * AmountField — large tap-to-open amount trigger used above the
 * `AmountKeypad` overlay. Used by the expense wizard (with a tappable
 * currency picker on the right) and the recurring-bill form (with a
 * static currency end-decorator, since recurring rules lock currency to
 * the group's).
 *
 * The host owns keypad visibility state — pressing the amount calls
 * `onPress`; pressing the currency calls `onCurrencyPress` (if provided).
 * When `onCurrencyPress` is undefined the currency renders as a non-tappable
 * label with no chevron.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, fontMono, spacing } from '@/lib/theme';

export interface AmountFieldProps {
  amount: string;
  currency: string;
  onPress: () => void;
  /** Omit to render the currency as a non-tappable end-decorator. */
  onCurrencyPress?: () => void;
  /** Override the "0" placeholder shown when `amount` is empty. */
  placeholder?: string;
  /** Accessibility label for the currency picker button (wizard only). */
  currencyAccessibilityLabel?: string;
}

export function AmountField({
  amount,
  currency,
  onPress,
  onCurrencyPress,
  placeholder = '0',
  currencyAccessibilityLabel,
}: AmountFieldProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.amountTouchable}
      >
        <Text
          style={[styles.amountInput, !amount && { color: colors.lead }]}
        >
          {amount || placeholder}
        </Text>
      </TouchableOpacity>
      {onCurrencyPress ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onCurrencyPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={currencyAccessibilityLabel}
          style={styles.currencyTouchable}
        >
          <Text style={styles.currency}>{currency.toLowerCase()}</Text>
          <Feather name="chevron-down" size={16} color={colors.lead} />
        </TouchableOpacity>
      ) : (
        <View style={styles.currencyStatic}>
          <Text style={styles.currency}>{currency.toLowerCase()}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountTouchable: { flex: 1 },
  amountInput: {
    fontFamily: fontMono,
    fontSize: 56,
    letterSpacing: -1.5,
    color: colors.graphite,
    padding: 0,
    fontVariant: ['tabular-nums'],
  },
  currencyTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  currencyStatic: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  currency: { fontFamily: fontMono, fontSize: 24, color: colors.lead },
});
