import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  title: React.ReactNode;
  meta?: string;
  amount?: string;
  amountTone?: 'pos' | 'neg' | string;
  settled?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
}

export function ListRow({ title, meta, amount, amountTone, settled, onPress, right }: Props) {
  const amtColor =
    amountTone === 'pos' ? colors.moss : amountTone === 'neg' ? colors.brick : colors.lead;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, settled && styles.settled]}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        {typeof title === 'string' ? (
          <Text style={[styles.title, settled && styles.titleSettled]}>{title}</Text>
        ) : (
          title
        )}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {right ?? (
        amount ? (
          <Text style={[styles.amount, { color: amtColor }]}>{amount}</Text>
        ) : null
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
    backgroundColor: colors.paper,
  },
  settled: { opacity: 0.6 },
  left: { flex: 1, marginRight: 12 },
  title: {
    ...typography.title,
    letterSpacing: -0.3,
    color: colors.graphite,
  },
  titleSettled: {
    textDecorationLine: 'line-through',
    color: colors.lead,
  },
  meta: {
    ...typography.monoCaption,
    color: colors.lead,
    marginTop: 3,
  },
  amount: {
    ...typography.monoBodyL,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
