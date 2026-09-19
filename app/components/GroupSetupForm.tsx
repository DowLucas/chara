import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { Text } from '@/components/Text';
import { useEnglishT } from '@/lib/i18n';
import { CurrencyPicker } from '@/components/CurrencyPicker';
import { GroupColorPicker } from '@/components/GroupColorPicker';
import { SUGGESTED_CURRENCY_CODES } from '@/lib/currencies';
import { colors, fontBody, fontMono, fontSize, groupAccentSwatches, spacing } from '@/lib/theme';

export type GroupSetupValue = { name: string; currency: string; color: string | null };

/** Device-locale currency, falling back to SEK. */
export function defaultGroupCurrency(): string {
  try {
    return getLocales()[0]?.currencyCode ?? 'SEK';
  } catch {
    return 'SEK';
  }
}

/** Name, currency and color fields shared by the create-group screens. */
export function GroupSetupForm({
  value,
  onChange,
}: {
  value: GroupSetupValue;
  onChange: (v: GroupSetupValue) => void;
}) {
  const t = useEnglishT();
  const { name, currency, color } = value;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const set = (patch: Partial<GroupSetupValue>) => onChange({ ...value, ...patch });
  const customSelected = color !== null
    && !groupAccentSwatches.some((s) => s.toLowerCase() === color.toLowerCase());
  // If the user picks a currency outside the suggested strip, keep it visible
  // as an extra chip so they can re-select without reopening the modal.
  const suggested = SUGGESTED_CURRENCY_CODES.includes(currency as typeof SUGGESTED_CURRENCY_CODES[number])
    ? SUGGESTED_CURRENCY_CODES
    : [...SUGGESTED_CURRENCY_CODES, currency];

  return (
    <>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('createGroup.nameLabel')}</Text>
        <TextInput
          value={name}
          onChangeText={(v) => set({ name: v })}
          placeholder={t('createGroup.namePlaceholder')}
          placeholderTextColor={colors.lead}
          autoFocus
          maxLength={80}
          returnKeyType="done"
          blurOnSubmit
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
                onPress={() => set({ currency: c })}
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
                onPress={() => set({ color: active ? null : hex })}
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
        onChange={(c) => set({ color: c })}
        autoSeed={name}
      />

      <CurrencyPicker
        visible={pickerOpen}
        selected={currency}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => set({ currency: c })}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  chipLabelActive: { color: colors.paper },
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
});
