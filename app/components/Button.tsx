import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  kind?: 'primary' | 'secondary' | 'ghost' | 'positive';
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Button({ kind = 'primary', onPress, children, style, disabled }: Props) {
  const labelOnAccent = kind === 'primary' || kind === 'positive';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, styles[kind], disabled && styles.disabled, style]}
      activeOpacity={0.8}
    >
      <Text style={[styles.label, labelOnAccent ? styles.labelPrimary : styles.labelDefault]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 0.5,
  },
  primary: {
    backgroundColor: colors.vermillion,
    borderColor: colors.vermillion,
  },
  // "Positive" CTA — closes a positive loop (settle, mark paid). Reuses the
  // active-tab vocabulary (dark-on-cream) so the action feels resolved and
  // doesn't share visual weight with the destructive brick family.
  positive: {
    backgroundColor: colors.graphite,
    borderColor: colors.graphite,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: colors.graphite,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  disabled: { opacity: 0.4 },
  label: {
    ...typography.bodyEmphasis,
    letterSpacing: -0.1,
  },
  labelPrimary: { color: colors.fgOnAccent },
  labelDefault: { color: colors.graphite },
});
