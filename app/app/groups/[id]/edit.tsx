import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getGroup, updateGroup, Group } from '@/lib/api';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

const SUGGESTED_CURRENCIES = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK'] as const;

export default function EditGroupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getGroup(id).then((g) => {
      setGroup(g);
      setName(g.name);
      setCurrency(g.currency);
    });
  }, [id]);

  const dirty = !!group && (name.trim() !== group.name || currency !== group.currency);
  const canSubmit = !!group && name.trim().length > 0 && dirty && !submitting;

  async function handleSave() {
    if (!canSubmit || !group) return;
    setSubmitting(true);
    try {
      await updateGroup(group.id, {
        name: name.trim() !== group.name ? name.trim() : undefined,
        currency: currency !== group.currency ? currency : undefined,
      });
      router.back();
    } catch (e: any) {
      Alert.alert(t('editGroup.errorTitle'), e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!group) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.graphite} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
        <Feather name="chevron-left" size={22} color={colors.graphite} />
      </TouchableOpacity>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('editGroup.eyebrow')}</Text>
        <Text style={styles.headline}>{group.name}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('editGroup.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('editGroup.namePlaceholder')}
          placeholderTextColor={colors.lead}
          maxLength={80}
          returnKeyType="done"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('editGroup.currencyLabel')}</Text>
        <View style={styles.chipRow}>
          {SUGGESTED_CURRENCIES.map((c) => {
            const active = c === currency;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCurrency(c)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <TouchableOpacity
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          disabled={!canSubmit}
          onPress={handleSave}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>{submitting ? t('editGroup.saving') : t('editGroup.submit')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { paddingVertical: spacing.s2, marginLeft: -spacing.s2, alignSelf: 'flex-start' },
  header: { gap: spacing.s2, marginTop: spacing.s4, marginBottom: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: 28,
    lineHeight: 32,
    color: colors.graphite,
    letterSpacing: -1,
  },
  field: { gap: spacing.s2, marginBottom: spacing.s4 },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  chip: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: colors.graphite,
  },
  chipActive: { backgroundColor: colors.graphite },
  chipLabel: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.graphite },
  chipLabelActive: { color: colors.paper },
  footer: { paddingTop: spacing.s3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
});
