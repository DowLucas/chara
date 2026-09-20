// Onboarding scanner. Shares all join logic with `app/groups/scan.tsx`
// via `useInviteJoin()` — cross-server branches, multi-account chooser,
// and the §8 discovery handshake all live in the hook.
//
// This screen inlines classify + dispatch (rather than calling the hook)
// so it can pass `source: 'onboarding'` through to the dispatcher; that
// gates the `onboarding_finished` analytics event to the onboarding path.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useEnglishT } from '@/lib/i18n';
import { QRScanner } from '@/components/QRScanner';
import { useAccounts } from '@/lib/accounts';
import * as analytics from '@/lib/analytics';
import { classifyInvite } from '@/lib/invite-handler';
import { dispatchInviteIntent } from '@/lib/invite-dispatcher';
import { colors, fontBody, fontMono, fontSize, spacing } from '@/lib/theme';

/**
 * Map a classifier `invalid.reason` (free-text) to the small enum we send
 * in the `invite_invalid` analytics event. The classifier today only
 * surfaces parse failures (see `parseInviteUrl`), so most reasons fall
 * under `malformed`; a server-URL rejection is grouped as `unknown_server`.
 */
function mapInvalidReason(
  reason: string,
): 'expired' | 'unknown_server' | 'malformed' | 'incompatible' {
  const r = reason.toLowerCase();
  if (r.includes('server url')) return 'unknown_server';
  return 'malformed';
}

export default function ScanToJoinScreen() {
  const t = useEnglishT();
  const { accounts } = useAccounts();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScanned = useCallback(
    async (data: string) => {
      if (busy) return;
      setBusy(true);
      try {
        // The user did the work of producing a scan; record it before
        // classification so we can see drop-off between scan and join.
        analytics.track('qr_scanned');

        const intent = classifyInvite(data, { accounts });
        const result = await dispatchInviteIntent(intent, 'onboarding');

        if (result.kind === 'invalid') {
          analytics.track('invite_invalid', {
            reason: mapInvalidReason(result.reason),
          });
          setError(t('scanJoin.invalidQr'));
          // re-arm after a moment so the user can retry without backing out
          setTimeout(() => setError(null), 1800);
        }
      } finally {
        setBusy(false);
      }
    },
    [accounts, busy, t],
  );

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
