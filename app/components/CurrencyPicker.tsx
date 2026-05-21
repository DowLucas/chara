import React, { useMemo, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  CURRENCIES,
  SUGGESTED_CURRENCY_CODES,
  Currency,
} from '@/lib/currencies';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

interface Props {
  visible: boolean;
  selected: string;
  onClose: () => void;
  onSelect: (code: string) => void;
}

const SUGGESTED_SET = new Set<string>(SUGGESTED_CURRENCY_CODES);

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'item'; key: string; currency: Currency };

export function CurrencyPicker({ visible, selected, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // Rebuild the section list every keystroke. ~150 entries; cheap enough.
  const rows: Row[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (c: Currency) =>
      !needle ||
      c.code.toLowerCase().includes(needle) ||
      c.name.toLowerCase().includes(needle);

    const out: Row[] = [];
    if (!needle) {
      const suggested = SUGGESTED_CURRENCY_CODES
        .map((code) => CURRENCIES.find((c) => c.code === code))
        .filter((c): c is Currency => !!c);
      if (suggested.length > 0) {
        out.push({ kind: 'header', key: 'h-suggested', label: t('currencyPicker.suggested') });
        suggested.forEach((c) => out.push({ kind: 'item', key: `s-${c.code}`, currency: c }));
      }
      out.push({ kind: 'header', key: 'h-all', label: t('currencyPicker.all') });
      CURRENCIES.filter((c) => !SUGGESTED_SET.has(c.code)).forEach((c) =>
        out.push({ kind: 'item', key: c.code, currency: c }),
      );
    } else {
      CURRENCIES.filter(matches).forEach((c) =>
        out.push({ kind: 'item', key: c.code, currency: c }),
      );
    }
    return out;
  }, [query, t]);

  const handlePick = useCallback(
    (code: string) => {
      onSelect(code);
      setQuery('');
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setQuery('');
              onClose();
            }}
            hitSlop={10}
            accessibilityLabel={t('common.close')}
          >
            <Feather name="x" size={22} color={colors.graphite} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('currencyPicker.title')}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.lead} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('currencyPicker.searchPlaceholder')}
            placeholderTextColor={colors.lead}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>{item.label}</Text>
                </View>
              );
            }
            const c = item.currency;
            const active = c.code === selected;
            return (
              <Pressable
                onPress={() => handlePick(c.code)}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.code, active && styles.codeActive]}>{c.code}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  {c.symbol ? <Text style={styles.symbol}>{c.symbol}</Text> : null}
                  {active ? <Feather name="check" size={18} color={colors.vermillion} /> : null}
                </View>
              </Pressable>
            );
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('currencyPicker.empty')}</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s5 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s3,
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: -0.3,
  },
  searchWrap: {
    marginHorizontal: spacing.s5,
    marginBottom: spacing.s3,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
    paddingHorizontal: spacing.s3,
  },
  searchIcon: { marginRight: spacing.s2 },
  searchInput: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    paddingVertical: spacing.s3,
  },
  sectionHeader: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
  },
  sectionLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowActive: { backgroundColor: colors.bone },
  rowPressed: { opacity: 0.7 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3, flex: 1, minWidth: 0 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  code: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    width: 48,
    letterSpacing: 0.4,
  },
  codeActive: { color: colors.vermillion },
  name: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    flex: 1,
    minWidth: 0,
  },
  symbol: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
  },
  empty: { paddingHorizontal: spacing.s5, paddingVertical: spacing.s5, alignItems: 'center' },
  emptyText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
});
