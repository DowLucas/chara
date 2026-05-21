import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';

interface Props {
  onScanned: (data: string) => void;
  onCancel?: () => void;
}

/** Full-screen QR scanner. Calls onScanned exactly once per code; the parent
 *  is responsible for closing the screen or re-enabling scanning if it wants
 *  to keep the camera open after a failed join. */
export function QRScanner({ onScanned, onCancel }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const lastValue = useRef<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.graphite} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Feather name="camera-off" size={32} color={colors.lead} />
        <Text style={styles.title}>{t('scanner.permissionDeniedTitle')}</Text>
        <Text style={styles.body}>{t('scanner.permissionDeniedBody')}</Text>
        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelLabel}>{t('scanner.goBack')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function handle({ data }: { data: string }) {
    if (scanned) return;
    if (lastValue.current === data) return;
    lastValue.current = data;
    setScanned(true);
    onScanned(data);
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handle}
      />
      {/* Viewfinder overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.window}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.hint}>{t('scanner.hint')}</Text>
      </View>
      {onCancel && (
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel} accessibilityLabel={t('common.close')}>
          <Feather name="x" size={22} color={colors.paper} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const VIEWFINDER = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s5,
    backgroundColor: colors.paper,
    gap: spacing.s3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  window: {
    width: VIEWFINDER,
    height: VIEWFINDER,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.paper,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  hint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.paper,
    letterSpacing: 0.3,
    marginTop: spacing.s4,
    opacity: 0.85,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.s5,
    right: spacing.s4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelBtn: {
    marginTop: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
  },
  cancelLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
});
