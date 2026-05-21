// In-app "join another group" scanner. Same flow as onboarding/scan but goes
// back to the groups tab (instead of forward into onboarding routes) on cancel.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { QRScanner } from '@/components/QRScanner';
import { joinGroupByToken, parseInviteToken, ApiError } from '@/lib/api';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

export default function GroupsScanScreen() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScanned(data: string) {
    if (busy) return;
    const token = parseInviteToken(data);
    if (!token) {
      setError(t('scanJoin.invalidQr'));
      setTimeout(() => setError(null), 1800);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = await joinGroupByToken(token);
      router.replace(`/groups/${group.id}`);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        router.back();
        return;
      }
      Alert.alert(t('scanJoin.couldNotJoin'), e?.message || String(e));
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <QRScanner onScanned={handleScanned} onCancel={() => router.back()} />
      {error && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{error}</Text>
        </View>
      )}
      {busy && (
        <View style={styles.busy}>
          <Text style={styles.busyText}>{t('scanJoin.joining')}</Text>
        </View>
      )}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.bottomLink}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  toast: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(184, 61, 61, 0.95)',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: 6,
  },
  toastText: { fontFamily: fontBody, fontSize: fontSize.bodyS, color: colors.fgOnAccent },
  busy: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: 6,
  },
  busyText: { fontFamily: fontMono, fontSize: fontSize.caption, color: colors.paper },
  bottomBar: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bottomLink: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.paper,
    letterSpacing: 0.3,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
});
