/**
 * Import — app picker. Static grid of supported source apps; tapping a card
 * routes to the per-app capture screen. No AI here.
 *
 * Composite (server,id) identity: `server` is encoded in the URL and decoded
 * on read; routes preserve it when pushing on.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { IMPORT_APPS } from '@/lib/import-apps';
import { colors, fontDisplay, fontBody, fontMono, fontSize, radii, spacing } from '@/lib/theme';

export default function ImportPickerScreen() {
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <TopBar
        title={t('import.picker.title')}
        left={<IconButton icon="arrow-left" onPress={() => router.back()} />}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.s7 }}
      >
        <Text style={styles.intro}>{t('import.picker.intro')}</Text>
        <View style={styles.grid}>
          {IMPORT_APPS.map((app) => (
            <TouchableOpacity
              key={app.source}
              style={styles.card}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t(app.labelKey)}
              onPress={() =>
                router.push(
                  `/groups/${encodeURIComponent(serverUrl)}/${id}/import/${app.source}`,
                )
              }
            >
              <Text style={styles.cardLabel}>{t(app.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  intro: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.lead,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.s4 - spacing.s1,
  },
  card: {
    width: '50%',
    padding: spacing.s1,
  },
  cardLabel: {
    fontFamily: fontDisplay,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    backgroundColor: colors.bone,
    borderRadius: radii.md,
    paddingVertical: spacing.s5,
    paddingHorizontal: spacing.s4,
    textAlign: 'center',
    overflow: 'hidden',
  },
});
