/**
 * Import — app picker. Vertical list of supported source apps; tapping a row
 * routes to the per-app capture screen. No AI here.
 *
 * Composite (server,id) identity: `server` is encoded in the URL and decoded
 * on read; routes preserve it when pushing on.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { IMPORT_APPS } from '@/lib/import-apps';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

export default function ImportPickerScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar left={<IconButton icon="arrow-left" onPress={() => router.back()} />} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('import.picker.eyebrow')}</Text>
          <Text style={styles.headline}>{t('import.picker.heading')}</Text>
          <Text style={styles.intro}>{t('import.picker.intro')}</Text>
        </View>
        <View style={styles.list}>
          {IMPORT_APPS.map((app) => (
            <ListRow
              key={app.source}
              title={t(app.labelKey)}
              onPress={() =>
                router.push(
                  `/groups/${encodeURIComponent(serverUrl)}/${id}/import/${app.source}`,
                )
              }
              right={<Feather name="chevron-right" size={20} color={colors.lead} />}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s5,
  },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    letterSpacing: -1,
    color: colors.graphite,
    lineHeight: 48,
    marginBottom: spacing.s2,
  },
  intro: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    lineHeight: 24,
  },
  list: {
    borderTopWidth: 0.5,
    borderTopColor: colors.ruleSoft,
  },
});
