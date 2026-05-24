import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

const SOURCE_URL = 'https://github.com/lucasdow/chara';
const WEBSITE_URL = 'https://chara.app';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // In Expo Go, Application.* returns the Expo Go app's version, not ours.
  // The app's own version lives in app.json and is exposed via expo-constants.
  const isStandalone = Constants.executionEnvironment === ExecutionEnvironment.Standalone;
  const version = Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '—';
  const build = isStandalone ? (Application.nativeBuildVersion ?? '—') : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('about.title')}
        left={<IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{t('about.eyebrow')}</Text>
        <Text style={styles.appName}>{t('app.name')}</Text>
        <Text style={styles.tagline}>{t('about.tagline')}</Text>

        <View style={styles.metaBlock}>
          <Row label={t('about.version')} value={version} />
          {build && <Row label={t('about.build')} value={build} />}
        </View>

        <Text style={styles.body}>{t('about.body')}</Text>

        <View style={styles.links}>
          <LinkRow label={t('about.website')} onPress={() => Linking.openURL(WEBSITE_URL)} />
          <LinkRow label={t('about.source')} onPress={() => Linking.openURL(SOURCE_URL)} />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.linkRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.linkLabel}>{label}</Text>
      <Text style={styles.linkArrow}>→</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.s5, paddingBottom: spacing.s7 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  appName: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
    marginTop: spacing.s2,
  },
  tagline: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyL,
    color: colors.lead,
    marginTop: spacing.s2,
  },
  metaBlock: {
    marginTop: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
    gap: spacing.s2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.s2,
  },
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  rowValue: { fontFamily: fontMono, fontSize: fontSize.bodyS, color: colors.lead, letterSpacing: 0.3 },
  body: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.graphite,
    lineHeight: 22,
    marginTop: spacing.s5,
  },
  links: {
    marginTop: spacing.s5,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  linkLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  linkArrow: { fontFamily: fontMono, fontSize: fontSize.body, color: colors.graphite },
});
