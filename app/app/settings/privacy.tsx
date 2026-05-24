import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { IconButton } from '@/components/IconButton';
import * as analytics from '@/lib/analytics';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [optedIn, setOptedIn] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await analytics.isOptedOut();
        if (!cancelled) {
          setOptedIn(!out);
          setLoaded(true);
        }
      } catch {
        // Fail open: assume default (opted-in) if storage read fails.
        if (!cancelled) {
          setOptedIn(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(next: boolean) {
    // Optimistic update — analytics writes are best-effort.
    setOptedIn(next);
    try {
      await analytics.setOptedOut(!next);
    } catch {
      // Revert on failure so the UI doesn't lie about persisted state.
      setOptedIn(!next);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('privacy.title')}
        left={<IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.list}>
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{t('privacy.analyticsLabel')}</Text>
            </View>
            <Switch
              value={optedIn}
              onValueChange={handleToggle}
              disabled={!loaded}
              trackColor={{ false: colors.bone, true: colors.vermillion }}
              thumbColor={colors.paper}
              accessibilityLabel={t('privacy.analyticsLabel')}
            />
          </View>
        </View>
        <Text style={styles.description}>{t('privacy.analyticsDescription')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.s5, paddingBottom: spacing.s7 },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    gap: spacing.s3,
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  description: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 20,
    marginTop: spacing.s3,
  },
});
