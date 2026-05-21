import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  kind?: 'primary' | 'secondary' | 'ghost';
  onPress?: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Button({ kind = 'primary', onPress, children, style, disabled }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.base, styles[kind], disabled && styles.disabled, style]}
      activeOpacity={0.8}
    >
      <Text style={[styles.label, kind === 'primary' ? styles.labelPrimary : styles.labelDefault]}>
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
