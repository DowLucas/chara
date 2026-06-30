import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fontDisplay, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  submitLabel: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

/** Minimal single-field text prompt (we never use Alert.prompt). Resolves the
 *  trimmed value via onSubmit; empty input is blocked. */
export function TextPromptModal({
  visible,
  title,
  placeholder,
  submitLabel,
  maxLength = 40,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  const trimmed = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.lead}
            style={styles.input}
            autoFocus
            maxLength={maxLength}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (trimmed) onSubmit(trimmed);
            }}
          />
          <View style={styles.row}>
            <TouchableOpacity onPress={onClose} style={styles.btn} activeOpacity={0.7}>
              <Text style={styles.btnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => trimmed && onSubmit(trimmed)}
              disabled={!trimmed}
              style={[styles.btn, styles.btnPrimary, !trimmed && { opacity: 0.4 }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnText, styles.btnTextPrimary]}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s5,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: 12,
    padding: spacing.s5,
    gap: spacing.s4,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    borderBottomWidth: 1,
    borderBottomColor: colors.graphite,
    paddingVertical: spacing.s2,
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s3 },
  btn: { paddingHorizontal: spacing.s4, paddingVertical: spacing.s2, borderRadius: 6 },
  btnPrimary: { backgroundColor: colors.graphite },
  btnText: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead },
  btnTextPrimary: { color: colors.paper },
});
