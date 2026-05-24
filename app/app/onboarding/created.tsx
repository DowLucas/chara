import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { getGroup, inviteDeepLink, Group } from '@/lib/api';
import { useDefaultAccount } from '@/lib/accounts';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import * as analytics from '@/lib/analytics';

export default function GroupCreatedScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  // Wave 4: the home tab will know the per-row serverUrl. For now,
  // creation happens against the default account.
  const defaultServerUrl = useDefaultAccount()?.serverUrl ?? '';
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId).then(setGroup).catch((e) => setError(e?.message ?? t('groupCreated.errorLoad')));
  }, [groupId, t]);

  if (error) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>{t('groupCreated.errorTitle')}</Text>
        <Text style={styles.body}>{error}</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.secondary}>
          <Text style={styles.secondaryLabel}>{t('groupCreated.goToGroups')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.graphite} />
      </View>
    );
  }

  const link = inviteDeepLink(group.invite_token);

  async function shareLink() {
    try {
      await Share.share({ message: t('groupCreated.shareMessage', { name: group!.name, link }) });
    } catch {
      // user cancelled or share failed — no-op
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.s4 }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{t('groupCreated.eyebrow')}</Text>
        <Text style={styles.headline}>{group.name}</Text>
        <Text style={styles.body}>{t('groupCreated.body')}</Text>
      </View>

      <View style={styles.qrWrap}>
        <View style={styles.qrCard}>
          <QRCode value={link} size={220} backgroundColor={colors.paper} color={colors.graphite} />
        </View>
        <Text style={styles.token} selectable>
          {group.invite_token}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
        <TouchableOpacity style={styles.cta} onPress={shareLink} activeOpacity={0.85}>
          <Feather name="share-2" size={18} color={colors.fgOnAccent} />
          <Text style={styles.ctaLabel}>{t('groupCreated.share')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            analytics.track('onboarding_finished', { path: 'create' });
            if (!defaultServerUrl) {
              router.replace('/(tabs)');
              return;
            }
            router.replace(`/groups/${encodeURIComponent(defaultServerUrl)}/${group.id}`);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryLabel}>{t('groupCreated.open')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.s3 },
  header: { gap: spacing.s2, marginBottom: spacing.s5 },
  eyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
  },
  headline: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    lineHeight: 44,
    color: colors.graphite,
    letterSpacing: -1,
  },
  body: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.lead, lineHeight: 20 },
  qrWrap: { alignItems: 'center', gap: spacing.s3, flex: 1, justifyContent: 'center' },
  qrCard: {
    padding: spacing.s4,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 8,
    backgroundColor: colors.paper,
  },
  token: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.5,
  },
  footer: { gap: spacing.s2, paddingTop: spacing.s3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    height: 52,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
  },
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.graphite,
  },
  secondaryLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.graphite },
  errorTitle: { fontFamily: fontDisplay, fontSize: fontSize.displayS, color: colors.graphite },
});
