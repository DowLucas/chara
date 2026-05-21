import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, typography } from '@/lib/theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  amount?: boolean;
}

export function Field({ label, value, onChangeText, amount = false, ...rest }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, amount && styles.amountInput]}
        placeholderTextColor={colors.lead}
        allowFontScaling
        maxFontSizeMultiplier={2}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  label: {
    ...typography.monoCaption,
    color: colors.lead,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  input: {
    ...typography.bodyEmphasis,
    color: colors.graphite,
    padding: 0,
  },
  amountInput: {
    ...typography.amountXL,
    fontSize: 40,
  },
});
