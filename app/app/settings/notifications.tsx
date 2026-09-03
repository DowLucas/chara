/**
 * Notification preferences, per account.
 *
 * One switch today (the monthly summary), so the screen is scoped to the
 * single account that offers it rather than being a per-account list — a
 * chooser for one row would be ceremony. When a second, non-hosted-only
 * preference arrives this becomes a section per account.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/Text';
import { TopBar } from '@/components/TopBar';
import { ContentContainer } from '@/components/ContentContainer';
import { IconButton } from '@/components/IconButton';
import { EmptyState } from '@/components/EmptyState';
import { showAlert } from '@/lib/app-alert';
import { apiFor } from '@/lib/api';
import { useSummaryServerUrl } from '@/lib/use-summary-server';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Live feature read rather than the cached account.instance blob, which is
  // only written at sign-in — see use-summary-server.ts.
  const serverUrl = useSummaryServerUrl();

  const [optOut, setOptOut] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  // Distinct from `optOut === null`. Folding "failed" back into the loading
  // sentinel left the screen spinning forever on an offline open, with no
  // error, no retry, and no way to reach the toggle.
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(async () => {
    if (!serverUrl) return;
    setStatus('loading');
    try {
      const me = await apiFor(serverUrl).getMe();
      setOptOut(me.monthly_summary_opt_out ?? false);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  }, [serverUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    if (!serverUrl || saving) return;
    // Optimistic: the switch must feel immediate. Reverted on failure, since
    // leaving it showing a preference the server never stored would quietly
    // mislead the user about whether they get the push.
    const before = optOut;
    setOptOut(next);
    setSaving(true);
    try {
      await apiFor(serverUrl).updateMe({ monthly_summary_opt_out: next });
    } catch {
      setOptOut(before);
      void showAlert({
        title: t('notifications.saveFailed.title'),
        message: t('notifications.saveFailed.body'),
        buttons: [{ key: 'ok', label: t('common.ok') }],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar
        title={t('notifications.title')}
        left={
          <IconButton icon="chevron-left" onPress={() => router.back()} label={t('common.back')} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ContentContainer>
          {!serverUrl ? (
            <EmptyState
              title={t('notifications.none.title')}
              body={t('notifications.none.body')}
              icon="bell-off"
            />
          ) : status === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.lead} />
            </View>
          ) : status === 'error' || optOut === null ? (
            <View style={styles.center}>
              <Text style={styles.errorNote}>{t('common.requestFailed')}</Text>
              <TouchableOpacity
                onPress={() => void load()}
                style={styles.retryBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.retryLabel}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.eyebrow}>{t('notifications.eyebrow')}</Text>
              <View style={styles.list}>
                <View style={styles.row}>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowLabel}>{t('notifications.monthlySummary.label')}</Text>
                    <Text style={styles.rowHelp}>{t('notifications.monthlySummary.help')}</Text>
                  </View>
                  {/* The stored flag is an opt-*out*; the switch reads as an
                      opt-in, so it is inverted here rather than in the API. */}
                  <Switch
                    value={!optOut}
                    onValueChange={(on) => void toggle(!on)}
                    disabled={saving}
                    accessibilityLabel={t('notifications.monthlySummary.label')}
                  />
                </View>
              </View>
            </>
          )}
        </ContentContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: spacing.s8 },
  center: { paddingVertical: spacing.s8, alignItems: 'center', gap: spacing.s4 },
  errorNote: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    textAlign: 'center',
    paddingHorizontal: spacing.s5,
  },
  retryBtn: {
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s3,
    borderRadius: 10,
    backgroundColor: colors.bone,
  },
  retryLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    paddingHorizontal: spacing.s5,
    marginTop: spacing.s5,
    marginBottom: spacing.s2,
  },
  list: { borderTopWidth: 1, borderTopColor: colors.ruleSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
  },
  rowMid: { flex: 1 },
  rowLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  rowHelp: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    marginTop: spacing.s1,
  },
});
