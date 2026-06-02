import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useTranslation } from 'react-i18next';
import { apiFor, Group } from '@/lib/api';
import { ContentContainer } from '@/components/ContentContainer';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

export default function GroupInviteScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { server, id } = useLocalSearchParams<{ server: string; id: string }>();
  const serverUrl = decodeURIComponent(server ?? '');
  const [group, setGroup] = useState<Group | null>(null);
  const [link, setLink] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !serverUrl) return;
    const api = apiFor(serverUrl);
    api
      .getGroup(id)
      .then(setGroup)
      .catch((e) => setError(e?.message ?? t('invite.errorLoad')));
    api
      .getInviteLink(id)
      .then((r) => setLink(r.invite_url))
      .catch((e) => setError(e?.message ?? t('invite.errorLoad')));
  }, [id, serverUrl, t]);

  async function shareLink() {
    if (!group) return;
    try {
      await Share.share({ message: t('invite.shareMessage', { name: group.name, link }) });
    } catch {}
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.s2 }]}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('common.back')} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.graphite} />
        </TouchableOpacity>
      </View>

      <ContentContainer style={styles.fill}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : !group || !link ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.graphite} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.eyebrow}>{t('invite.eyebrow')}</Text>
              <Text style={styles.headline}>{group.name}</Text>
              <Text style={styles.body}>{t('invite.body')}</Text>
            </View>

            <View style={styles.qrWrap}>
              <View style={styles.qrCard}>
                <QRCode value={link} size={240} backgroundColor={colors.paper} color={colors.graphite} />
              </View>
              <Text style={styles.token} selectable>{group.invite_token}</Text>
            </View>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.s4 }]}>
              <TouchableOpacity style={styles.cta} onPress={shareLink} activeOpacity={0.85}>
                <Feather name="share-2" size={18} color={colors.fgOnAccent} />
                <Text style={styles.ctaLabel}>{t('invite.share')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ContentContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  fill: { flex: 1 },
  topRow: { paddingVertical: spacing.s2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.s2, marginTop: spacing.s2, marginBottom: spacing.s4 },
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
  ctaLabel: { fontFamily: fontBody, fontSize: fontSize.body, color: colors.fgOnAccent },
});
