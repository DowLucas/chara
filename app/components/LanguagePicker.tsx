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
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/lib/i18n';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

interface Props {
  visible: boolean;
  /** Stored explicit pick, or null when on Automatic (device-locale). */
  selected: SupportedLanguage | null;
  onClose: () => void;
  onSelectAutomatic: () => void;
  onSelect: (code: SupportedLanguage) => void;
}

/** English names so a user can find their language by typing "swedish" or
 *  "japanese" — useful when the picker is open in a language they don't
 *  read. Native name is the primary label; English is a search-only hint. */
const LANGUAGE_ENGLISH_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  sv: 'Swedish',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  nl: 'Dutch',
  da: 'Danish',
  fi: 'Finnish',
  ar: 'Arabic',
  ja: 'Japanese',
  'zh-Hans': 'Chinese (Simplified)',
};

type Row =
  | { kind: 'automatic'; key: 'automatic' }
  | { kind: 'item'; key: string; code: SupportedLanguage };

export function LanguagePicker({
  visible,
  selected,
  onClose,
  onSelectAutomatic,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const rows: Row[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: Row[] = [];
    // "Automatic" only shows when not searching (search implies the user
    // wants a specific language). Putting it at the very top is the
    // conventional iOS / Android pattern.
    if (!needle) {
      out.push({ kind: 'automatic', key: 'automatic' });
    }
    SUPPORTED_LANGUAGES.forEach((code) => {
      if (!needle) {
        out.push({ kind: 'item', key: code, code });
        return;
      }
      const native = LANGUAGE_NATIVE_NAMES[code].toLowerCase();
      const english = LANGUAGE_ENGLISH_NAMES[code].toLowerCase();
      if (
        native.includes(needle) ||
        english.includes(needle) ||
        code.toLowerCase().includes(needle)
      ) {
        out.push({ kind: 'item', key: code, code });
      }
    });
    return out;
  }, [query]);

  const handleClose = useCallback(() => {
    setQuery('');
    onClose();
  }, [onClose]);

  const handlePickAutomatic = useCallback(() => {
    onSelectAutomatic();
    setQuery('');
    onClose();
  }, [onSelectAutomatic, onClose]);

  const handlePick = useCallback(
    (code: SupportedLanguage) => {
      onSelect(code);
      setQuery('');
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={10} accessibilityLabel={t('common.close')}>
            <Feather name="x" size={22} color={colors.graphite} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('you.language')}</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={16} color={colors.lead} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('languagePicker.searchPlaceholder')}
            placeholderTextColor={colors.lead}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
          />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => {
            if (item.kind === 'automatic') {
              const active = selected === null;
              return (
                <Pressable
                  onPress={handlePickAutomatic}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                      {t('you.languageAuto')}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    {active ? <Feather name="check" size={18} color={colors.vermillion} /> : null}
                  </View>
                </Pressable>
              );
            }
            const active = selected === item.code;
            return (
              <Pressable
                onPress={() => handlePick(item.code)}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                    {LANGUAGE_NATIVE_NAMES[item.code]}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.code}>{item.code}</Text>
                  {active ? <Feather name="check" size={18} color={colors.vermillion} /> : null}
                </View>
              </Pressable>
            );
          }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('languagePicker.empty')}</Text>
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
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
    paddingVertical: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  rowActive: { backgroundColor: colors.bone },
  rowPressed: { opacity: 0.7 },
  rowLeft: { flex: 1, minWidth: 0 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  name: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  nameActive: { color: colors.vermillion },
  code: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  empty: { paddingHorizontal: spacing.s5, paddingVertical: spacing.s5, alignItems: 'center' },
  emptyText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.lead },
});
