import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showAlert } from '@/lib/app-alert';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { createGroup } from '@/lib/api';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { SUGGESTED_CURRENCY_CODES } from '@/lib/currencies';
import {
  colors,
  fontBody,
  fontDisplay,
  fontMono,
  fontSize,
  groupAccentSwatches,
  spacing,
} from '@/lib/theme';
import { setOverride as setGroupColorOverride } from '@/lib/group-color';
import { GroupColorPicker } from '@/components/GroupColorPicker';
import { useDefaultAccount } from '@/lib/accounts';
import * as analytics from '@/lib/analytics';

export default function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const defaultAccount = useDefaultAccount();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('SEK');
  const [color, setColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const customSelected = color !== null
    && !groupAccentSwatches.some((s) => s.toLowerCase() === color.toLowerCase());
  // If the user picks a currency outside the suggested strip, keep it visible
  // as an extra chip so they can re-select without reopening the modal.
  const suggested = SUGGESTED_CURRENCY_CODES.includes(currency as typeof SUGGESTED_CURRENCY_CODES[number])
    ? SUGGESTED_CURRENCY_CODES
    : [...SUGGESTED_CURRENCY_CODES, currency];

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const group = await createGroup(name.trim(), currency);
      if (color && defaultAccount?.serverUrl) {
        try {
          await setGroupColorOverride(defaultAccount.serverUrl, group.id, color);
        } catch {
          // Color override is per-device cosmetic; never block group creation.
        }
      }
      analytics.track('group_created');
      router.replace(`/onboarding/created?groupId=${group.id}`);
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : undefined;
      let code: string = 'unknown';
      if (status) {
        code = `http_${status}`;
      } else if (e?.message && /network|fetch|timeout/i.test(String(e.message))) {
        code = 'network';
      }
      analytics.track('group_create_failed', { code });
      showAlert({ title: t('createGroup.errorTitle'), message: e?.message || String(e) });
    } finally {
      setSubmitting(false);
    }
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
        <Text style={styles.eyebrow}>{t('createGroup.eyebrow')}</Text>
        <Text style={styles.headline}>{t('createGroup.headline')}</Text>
        <Text style={styles.body}>{t('createGroup.body')}</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('createGroup.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('createGroup.namePlaceholder')}
          placeholderTextColor={colors.lead}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('createGroup.currencyLabel')}</Text>
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

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('createGroup.colorLabel')}</Text>
        <View style={styles.swatchRow}>
          {groupAccentSwatches.map((hex) => {
            const active = color?.toLowerCase() === hex.toLowerCase();
            return (
              <TouchableOpacity
                key={hex}
                onPress={() => setColor(active ? null : hex)}
                activeOpacity={0.7}
                accessibilityRole="button"
                style={styles.swatchHit}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: hex },
                    active && styles.swatchActive,
                  ]}
                >
                  {active && <Feather name="check" size={16} color={colors.fgOnAccent} />}
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setColorPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            style={styles.swatchHit}
          >
            <View
              style={[
                styles.swatch,
                styles.customSwatch,
                customSelected && { backgroundColor: color! },
                customSelected && styles.swatchActive,
              ]}
            >
              {customSelected ? (
                <Feather name="check" size={16} color={colors.fgOnAccent} />
              ) : (
                <Feather name="plus" size={18} color={colors.lead} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <GroupColorPicker
        visible={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        value={color}
        onChange={setColor}
        autoSeed={name}
      />

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        onClose={() => setPickerOpen(false)}
        onSelect={setCurrency}
      />

      <View style={{ flex: 1 }} />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <TouchableOpacity
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          disabled={!canSubmit}
          onPress={handleCreate}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>{submitting ? t('createGroup.creating') : t('createGroup.submit')}</Text>
          <Feather name="arrow-right" size={18} color={colors.fgOnAccent} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  back: { paddingVertical: spacing.s2, marginLeft: -spacing.s2, alignSelf: 'flex-start' },
  header: { gap: spacing.s2, marginTop: spacing.s4, marginBottom: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.lead, lineHeight: 22 },
  field: { gap: spacing.s2, marginBottom: spacing.s4 },
  fieldLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
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
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: colors.graphite },
  chipLabel: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.graphite },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3 },
  swatchHit: { padding: 2 },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: { borderWidth: 2, borderColor: colors.graphite },
  customSwatch: {
    borderStyle: 'dashed',
    borderColor: colors.graphite,
    backgroundColor: 'transparent',
  },
  chipLabelActive: { color: colors.paper },
  footer: { paddingTop: spacing.s3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
});
