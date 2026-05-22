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
import { apiFor, Group } from '@/lib/api';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { SUGGESTED_CURRENCY_CODES } from '@/lib/currencies';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

export default function EditGroupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const api = apiFor(serverUrl);
  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [language, setLanguage] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const suggested = SUGGESTED_CURRENCY_CODES.includes(currency as typeof SUGGESTED_CURRENCY_CODES[number])
    ? SUGGESTED_CURRENCY_CODES
    : currency
      ? [...SUGGESTED_CURRENCY_CODES, currency]
      : SUGGESTED_CURRENCY_CODES;

  useEffect(() => {
    if (!id || !serverUrl) return;
    api.getGroup(id).then((g) => {
      setGroup(g);
      setName(g.name);
      setCurrency(g.currency);
      setLanguage(g.language || 'en');
    });
  }, [id, serverUrl]);

  const dirty =
    !!group &&
    (name.trim() !== group.name ||
      currency !== group.currency ||
      language !== (group.language || 'en'));
  const canSubmit = !!group && name.trim().length > 0 && dirty && !submitting;

  async function handleSave() {
    if (!canSubmit || !group) return;
    setSubmitting(true);
    try {
      await api.updateGroup(group.id, {
        name: name.trim() !== group.name ? name.trim() : undefined,
        currency: currency !== group.currency ? currency : undefined,
        language: language !== (group.language || 'en') ? language : undefined,
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
          {suggested.map((c) => {
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
          <TouchableOpacity
            style={styles.chip}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.chipLabel}>{t('currencyPicker.more')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        onClose={() => setPickerOpen(false)}
        onSelect={setCurrency}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('editGroup.languageLabel')}</Text>
        <Text style={styles.fieldHint}>{t('editGroup.languageHint')}</Text>
        <View style={styles.chipRow}>
          {GROUP_LANGUAGES.map((lang) => {
            const active = lang.code === language;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setLanguage(lang.code)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {lang.label}
                </Text>
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

// Mirrors backend/internal/language/language.go — keep them in sync. Labels
// are the user-facing names; the wire value (lang.code) is the ISO 639-1
// code persisted on the group row.
const GROUP_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'sv', label: 'Svenska' },
  { code: 'da', label: 'Dansk' },
  { code: 'no', label: 'Norsk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
];

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
  fieldHint: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 18,
    marginTop: -4,
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
