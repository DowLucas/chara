import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Linking,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { colors, fontBody, fontDisplay, fontMono, fontSize, spacing } from '@/lib/theme';
import { scanReceipt, convertFx, ScannedReceipt, ApiError, isOcrCapReached, submitWaitlist } from '@/lib/api';
import { useDefaultAccount } from '@/lib/accounts';
import { WaitlistModal } from '@/components/WaitlistModal';
import { formatMinorUnits } from '@/lib/i18n';
import {
  FxConversionSection,
  FxState as SharedFxState,
} from '@/components/FxConversionSection';

/**
 * What the parent ultimately commits to the expense form.
 *  - `receipt`: the raw, structured AI extraction in the receipt's own currency
 *  - `applied`: the amount + currency to populate the form with. When the
 *    receipt currency matches the group's, this is just the receipt's total.
 *    When it differs, this is the converted amount in the group currency,
 *    using the (possibly user-overridden) rate.
 *  - `fx`: present iff conversion was applied. Lets the parent record the
 *    original-currency amount and rate alongside the converted total.
 */
export interface ReceiptScanResult {
  receipt: ScannedReceipt;
  applied: { amount_minor: number; currency: string };
  fx?: {
    from: string;
    to: string;
    rate: string;
    as_of: string;
    source: string;
    original_total_minor: number;
  };
  /** Captured image bytes the parent can persist as an attachment after
   *  the expense is saved. Set on every successful scan. */
  image?: { base64: string; mime_type: string };
}

interface Props {
  groupCurrency: string;
  /** ISO 639-1 code (en, sv, ja, …) — the language Gemini should generate
   *  the title in. Passed to /api/receipts/scan as `language`. Empty/
   *  omitted falls back to the receipt's own language on the backend. */
  groupLanguage?: string;
  onScanned: (result: ReceiptScanResult) => void;
  onCancel: () => void;
}

// Map common image extensions to MIME types accepted by the backend. We use
// this when expo-image-picker returns an asset without a populated
// mimeType field (older library versions / certain platforms).
function inferMimeFromUri(uri: string): string | null {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

type Phase =
  | { kind: 'camera' }
  | { kind: 'analyzing'; photoUri: string }
  | {
      kind: 'result';
      photoUri: string;
      receipt: ScannedReceipt;
      imageBase64: string;
      imageMime: string;
    }
  | { kind: 'error'; photoUri: string; message: string };

/**
 * Full-screen receipt scanner with three phases:
 *   1. camera     — live viewfinder, shutter button
 *   2. analyzing  — captured photo with scan-line animation while Gemini runs
 *   3. result     — AI-extracted breakdown; user confirms or retakes
 *
 * Only mount this when the server reports `features.ocr === true`.
 */
export function ReceiptScanner({ groupCurrency, groupLanguage, onScanned, onCancel }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'camera' });
  // Waitlist modal state, separate from the phase state machine. The modal
  // floats over whichever phase the scanner happens to be in (we drop back
  // to 'camera' on cap-hit so the analyzing animation isn't stuck behind it).
  const [waitlistState, setWaitlistState] = useState<{ resetsAt?: string } | null>(null);
  const defaultAccount = useDefaultAccount();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  async function capture() {
    if (phase.kind !== 'camera' || !cameraRef.current) return;
    let photoUri: string | undefined;
    let base64: string | undefined;
    try {
      // quality 0.8 keeps file size well under the backend's 6 MB cap while
      // staying sharp enough for receipt OCR.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
        skipProcessing: false,
      });
      if (!photo?.base64 || !photo?.uri) throw new Error('camera returned no image data');
      photoUri = photo.uri;
      base64 = photo.base64;
    } catch {
      // Failure before we have a photo — stay on the camera phase and let the
      // user retry. A toast would be nicer, but in practice this only fires
      // when permissions race or the camera is mid-init.
      return;
    }

    runScan(photoUri, base64, 'image/jpeg');
  }

  async function pickFromLibrary() {
    if (phase.kind !== 'camera') return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        // Capping quality keeps base64 well under the backend's 6 MB limit.
        // 0.8 matches the camera capture path so behaviour is uniform.
        quality: 0.8,
        base64: true,
        exif: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      if (!asset?.base64 || !asset?.uri) return;
      // expo-image-picker reports the MIME via the asset.mimeType field when
      // available; otherwise infer from the file extension and fall back to
      // jpeg, which the backend always accepts.
      const mime =
        (asset as { mimeType?: string }).mimeType ??
        inferMimeFromUri(asset.uri) ??
        'image/jpeg';
      runScan(asset.uri, asset.base64, mime);
    } catch {
      // Permission denial / unavailable library — stay on the camera phase.
    }
  }

  async function runScan(photoUri: string, base64: string, mimeType: string) {
    // Switch to analyzing immediately so the user sees feedback while the
    // network call runs.
    setPhase({ kind: 'analyzing', photoUri });
    try {
      const receipt = await scanReceipt(base64, mimeType, groupLanguage);
      setPhase({ kind: 'result', photoUri, receipt, imageBase64: base64, imageMime: mimeType });
    } catch (e) {
      // Hosted free-tier cap hit. Don't render the generic error state — open
      // the waitlist modal so we capture intent instead of just an apology.
      const cap = isOcrCapReached(e);
      if (cap) {
        setPhase({ kind: 'camera' });
        setWaitlistState({ resetsAt: cap.period_resets_at });
        return;
      }
      const message =
        e instanceof ApiError && e.status === 422
          ? t('receiptScanner.errorUnreadable')
          : e instanceof ApiError
          ? t('receiptScanner.errorUpstream')
          : t('receiptScanner.errorCapture');
      setPhase({ kind: 'error', photoUri, message });
    }
  }

  // Self-host docs deep-link — used as the secondary CTA in the waitlist
  // modal ("Or self-host Chara for unlimited everything").
  const openSelfHostDocs = React.useCallback(() => {
    void Linking.openURL('https://github.com/DowLucas/chara#self-hosting').catch(() => {
      // openURL throws synchronously on unsupported schemes; here it'd only
      // happen if the device has no browser. Nothing graceful to do.
    });
  }, []);

  const handleWaitlistSubmit = React.useCallback(async (email: string) => {
    await submitWaitlist({
      email,
      trigger: 'ocr_cap',
      source: 'mobile',
    });
  }, []);

  if (!permission) {
    return (
      <View style={styles.permWrap}>
        <ActivityIndicator color={colors.graphite} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permWrap}>
        <Feather name="camera-off" size={32} color={colors.lead} />
        <Text style={styles.permTitle}>{t('receiptScanner.permissionDeniedTitle')}</Text>
        <Text style={styles.permBody}>{t('receiptScanner.permissionDeniedBody')}</Text>
        <TouchableOpacity onPress={onCancel} style={styles.permBtn}>
          <Text style={styles.permBtnLabel}>{t('scanner.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Close button is shared by every phase so the user can always escape.
  const closeBtn = (
    <TouchableOpacity
      style={[styles.closeBtn, { top: insets.top + spacing.s3, left: spacing.s4 }]}
      onPress={onCancel}
      accessibilityLabel={t('common.close')}
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
    >
      <Feather name="x" size={26} color={colors.paper} />
    </TouchableOpacity>
  );

  if (phase.kind === 'camera') {
    return (
      <View style={styles.container}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.window}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.hint}>{t('receiptScanner.hint')}</Text>
        </View>
        {closeBtn}
        <View style={[styles.shutterRow, { bottom: insets.bottom + spacing.s5 }]}>
          {/* Spacer keeps the shutter visually centred while the gallery
              button hangs off to the right. */}
          <View style={styles.shutterSide} />
          <TouchableOpacity
            style={styles.shutter}
            onPress={capture}
            accessibilityLabel={t('receiptScanner.capture')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <View style={styles.shutterSide}>
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={pickFromLibrary}
              accessibilityLabel={t('receiptScanner.pickFromLibrary')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="image" size={22} color={colors.paper} />
            </TouchableOpacity>
          </View>
        </View>
        <WaitlistModal
          visible={waitlistState !== null}
          cap={3}
          periodResetsAt={waitlistState?.resetsAt}
          defaultEmail={defaultAccount?.user.email}
          onSubmit={handleWaitlistSubmit}
          onDismiss={() => setWaitlistState(null)}
          onSelfHostPressed={openSelfHostDocs}
        />
      </View>
    );
  }

  if (phase.kind === 'analyzing') {
    return (
      <View style={styles.container}>
        <AnalyzingView photoUri={phase.photoUri} />
        {closeBtn}
      </View>
    );
  }

  if (phase.kind === 'error') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: phase.photoUri }} style={styles.fullPhoto} resizeMode="contain" />
        <View style={styles.errorOverlay}>
          <Feather name="alert-triangle" size={28} color={colors.paper} />
          <Text style={styles.errorTitle}>{t('receiptScanner.errorTitle')}</Text>
          <Text style={styles.errorBody}>{phase.message}</Text>
          <View style={styles.errorBtns}>
            <Button kind="secondary" onPress={onCancel} style={{ flex: 1 }}>
              {t('common.close')}
            </Button>
            <Button
              kind="primary"
              onPress={() => setPhase({ kind: 'camera' })}
              style={{ flex: 1 }}
            >
              {t('receiptScanner.retake')}
            </Button>
          </View>
        </View>
        {closeBtn}
      </View>
    );
  }

  // phase.kind === 'result'
  const imageBase64 = phase.imageBase64;
  const imageMime = phase.imageMime;
  return (
    <View style={styles.container}>
      <ResultView
        photoUri={phase.photoUri}
        receipt={phase.receipt}
        groupCurrency={groupCurrency}
        onUse={(r) => onScanned({ ...r, image: { base64: imageBase64, mime_type: imageMime } })}
        onRetake={() => setPhase({ kind: 'camera' })}
        topPad={insets.top + spacing.s7}
        bottomPad={insets.bottom + spacing.s4}
      />
      {closeBtn}
    </View>
  );
}

// ─── Analyzing phase ──────────────────────────────────────────────────────────
function AnalyzingView({ photoUri }: { photoUri: string }) {
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(0)).current;
  const [stepIdx, setStepIdx] = useState(0);

  const steps = useMemo(
    () => [
      t('receiptScanner.analyzingStep1'),
      t('receiptScanner.analyzingStep2'),
      t('receiptScanner.analyzingStep3'),
      t('receiptScanner.analyzingStep4'),
      t('receiptScanner.analyzingStep5'),
    ],
    [t],
  );

  useEffect(() => {
    // Bouncing scan line: 0 → 1 → 0 in a loop. Linear easing keeps the
    // sweep speed constant so the user reads it as "still working".
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  // Rotate the status text every ~1.5s. Stops on the last step so we don't
  // loop back to "reading merchant" forever — the user reads "adding it all
  // up" and assumes we're nearly done, which is honest about the order Gemini
  // reports fields in.
  useEffect(() => {
    if (stepIdx >= steps.length - 1) return;
    const id = setTimeout(() => setStepIdx((i) => i + 1), 1500);
    return () => clearTimeout(id);
  }, [stepIdx, steps.length]);

  // The photo box is laid out with `flex: 1`; we can't know its exact pixel
  // height ahead of time, so the scan line is positioned with `top: 0` and
  // translated by a percentage of its parent (via `transform` on an
  // absolutely-filled parent of fixed-percentage height). Simplest reliable
  // approach: animate translateY across a known offset within the photo
  // container by measuring its height on layout.
  const [boxHeight, setBoxHeight] = useState(0);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, boxHeight - 3)],
  });

  return (
    <View style={styles.analyzingWrap}>
      <View
        style={styles.photoBox}
        onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
      >
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {boxHeight > 0 && (
          <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
        )}
        {/* Soft top/bottom gradients for the scan line feel */}
        <View pointerEvents="none" style={styles.scanTint} />
      </View>
      <View style={styles.analyzingMeta}>
        <Text style={styles.analyzingTitle}>{t('receiptScanner.analyzing')}</Text>
        <View style={styles.analyzingStepRow}>
          <ActivityIndicator color={colors.graphite} size="small" />
          <Text style={styles.analyzingStep} key={stepIdx}>
            {steps[stepIdx]}
          </Text>
        </View>
        <Text style={styles.analyzingKeepOpen}>
          {t('receiptScanner.analyzingKeepOpen')}
        </Text>
      </View>
    </View>
  );
}

// ─── Result phase ─────────────────────────────────────────────────────────────
interface ResultViewProps {
  photoUri: string;
  receipt: ScannedReceipt;
  groupCurrency: string;
  onUse: (result: ReceiptScanResult) => void;
  onRetake: () => void;
  topPad: number;
  bottomPad: number;
}

type FxState =
  | { kind: 'none' } // same currency, no conversion
  | SharedFxState;

function ResultView({
  photoUri,
  receipt,
  groupCurrency,
  onUse,
  onRetake,
  topPad,
  bottomPad,
}: ResultViewProps) {
  const { t } = useTranslation();
  const needsConversion = receipt.currency !== groupCurrency;

  const [fx, setFx] = useState<FxState>(
    needsConversion ? { kind: 'loading' } : { kind: 'none' },
  );
  // User-editable rate (decimal string). Defaults to the rate returned from
  // the FX endpoint; the user can overwrite it.
  const [rateInput, setRateInput] = useState('');

  useEffect(() => {
    if (!needsConversion) return;
    let cancelled = false;
    convertFx({
      from: receipt.currency,
      to: groupCurrency,
      amountMinor: receipt.total_minor,
      asOf: receipt.date || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setFx({ kind: 'ready', data });
        setRateInput(data.rate);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : String(e);
        setFx({ kind: 'error', message: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [needsConversion, receipt.currency, receipt.total_minor, receipt.date, groupCurrency]);

  // Parse the user-edited rate into a positive finite number, or null if
  // empty / invalid. Commas tolerated for European locales.
  const rateNumber: number | null = (() => {
    if (!rateInput.trim()) return null;
    const n = parseFloat(rateInput.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  })();

  // Convert any minor-unit amount in the receipt currency to minor units in
  // the group currency using the current rate.
  function applyRate(minor: number): number {
    if (!rateNumber) return 0;
    return Math.round(minor * rateNumber);
  }

  const rows: Array<{ key: string; label: string; value: string; emphasis?: boolean }> = [];
  if (receipt.merchant) {
    rows.push({ key: 'merchant', label: t('receiptScanner.fieldMerchant'), value: receipt.merchant });
  }
  if (receipt.date) {
    rows.push({ key: 'date', label: t('receiptScanner.fieldDate'), value: receipt.date });
  }
  if (receipt.subtotal_minor && receipt.subtotal_minor > 0) {
    rows.push({
      key: 'subtotal',
      label: t('receiptScanner.fieldSubtotal'),
      value: formatMinorUnits(receipt.subtotal_minor, receipt.currency),
    });
  }
  if (receipt.tax_minor && receipt.tax_minor > 0) {
    rows.push({
      key: 'tax',
      label: t('receiptScanner.fieldTax'),
      value: formatMinorUnits(receipt.tax_minor, receipt.currency),
    });
  }
  if (receipt.tip_minor && receipt.tip_minor > 0) {
    rows.push({
      key: 'tip',
      label: t('receiptScanner.fieldTip'),
      value: formatMinorUnits(receipt.tip_minor, receipt.currency),
    });
  }
  rows.push({
    key: 'total',
    label: t('receiptScanner.fieldTotal'),
    value: formatMinorUnits(receipt.total_minor, receipt.currency),
    emphasis: true,
  });

  // What "Use this" commits — recomputed every render.
  const result: ReceiptScanResult = needsConversion
    ? fx.kind === 'ready' && rateNumber !== null
      ? {
          receipt,
          applied: { amount_minor: applyRate(receipt.total_minor), currency: groupCurrency },
          fx: {
            from: receipt.currency,
            to: groupCurrency,
            rate: String(rateNumber),
            as_of: fx.data.as_of,
            source: fx.data.source,
            original_total_minor: receipt.total_minor,
          },
        }
      : // FX failed or rate empty: fall back to the original currency so the
        // add-expense form's FX preview can take over.
        {
          receipt,
          applied: { amount_minor: receipt.total_minor, currency: receipt.currency },
        }
    : {
        receipt,
        applied: { amount_minor: receipt.total_minor, currency: receipt.currency },
      };

  const canUse = !needsConversion || fx.kind !== 'loading';

  return (
    <View style={[styles.resultWrap, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <ScrollView
        contentContainerStyle={styles.resultScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.resultThumbWrap}>
          <Image source={{ uri: photoUri }} style={styles.resultThumb} resizeMode="cover" />
        </View>
        <Text style={styles.resultEyebrow}>{t('receiptScanner.resultEyebrow')}</Text>
        <Text style={styles.resultTitle}>
          {receipt.title || t('receiptScanner.resultTitle')}
        </Text>

        <View style={styles.breakdown}>
          {rows.map((r, i) => (
            <View
              key={r.key}
              style={[
                styles.breakdownRow,
                i === rows.length - 1 && styles.breakdownRowLast,
                r.emphasis && styles.breakdownRowEmph,
              ]}
            >
              <Text style={[styles.breakdownLabel, r.emphasis && styles.breakdownLabelEmph]}>
                {r.label}
              </Text>
              <Text style={[styles.breakdownValue, r.emphasis && styles.breakdownValueEmph]}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>

        {needsConversion && fx.kind !== 'none' && (
          <FxConversionSection
            from={receipt.currency}
            to={groupCurrency}
            amountMinor={receipt.total_minor}
            fx={fx}
            rateInput={rateInput}
            setRateInput={setRateInput}
            rateNumber={rateNumber}
          />
        )}
      </ScrollView>

      <View style={styles.resultCtas}>
        <Button kind="secondary" onPress={onRetake} style={{ flex: 1 }}>
          {t('receiptScanner.retake')}
        </Button>
        <Button
          kind="primary"
          onPress={() => onUse(result)}
          disabled={!canUse}
          style={{ flex: 1 }}
        >
          {t('receiptScanner.useThis')}
        </Button>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const VIEWFINDER = 280;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Permission screen
  permWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s5,
    backgroundColor: colors.paper,
    gap: spacing.s3,
  },
  permTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },
  permBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    textAlign: 'center',
    lineHeight: 20,
  },
  permBtn: {
    marginTop: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderWidth: 0.5,
    borderColor: colors.graphite,
    borderRadius: 6,
  },
  permBtnLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },

  // Camera phase
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  window: { width: VIEWFINDER, height: VIEWFINDER * 1.3 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.paper },
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
    textAlign: 'center',
    paddingHorizontal: spacing.s5,
  },
  closeBtn: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  shutterRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: spacing.s5,
  },
  shutterSide: { width: 76, alignItems: 'center', justifyContent: 'center' },
  galleryBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.graphite,
  },

  // Analyzing phase
  analyzingWrap: { flex: 1, backgroundColor: colors.paper, paddingBottom: spacing.s6 },
  photoBox: { flex: 1, overflow: 'hidden', backgroundColor: colors.bone },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.vermillion,
    shadowColor: colors.vermillion,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  scanTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(45,31,26,0.06)',
  },
  analyzingMeta: {
    alignItems: 'center',
    gap: spacing.s3,
    paddingTop: spacing.s5,
    paddingHorizontal: spacing.s5,
  },
  analyzingTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },
  analyzingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  analyzingStep: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  analyzingHint: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  analyzingKeepOpen: {
    fontFamily: fontBody,
    fontSize: fontSize.caption,
    color: colors.lead,
    textAlign: 'center',
    paddingTop: spacing.s2,
  },

  // Error phase
  fullPhoto: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  errorOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.s5,
    backgroundColor: 'rgba(0,0,0,0.8)',
    gap: spacing.s3,
    alignItems: 'center',
  },
  errorTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.paper,
    letterSpacing: -0.5,
  },
  errorBody: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.paper,
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBtns: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignSelf: 'stretch',
    marginTop: spacing.s2,
  },

  // Result phase
  resultWrap: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: spacing.s5 },
  resultScroll: { paddingBottom: spacing.s5 },
  resultThumbWrap: {
    alignSelf: 'center',
    width: 140,
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 0.5,
    borderColor: colors.ruleSoft,
    marginBottom: spacing.s4,
  },
  resultThumb: { width: '100%', height: '100%' },
  resultEyebrow: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.4,
    textAlign: 'center',
    textTransform: 'lowercase',
    marginBottom: 6,
  },
  resultTitle: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayL,
    color: colors.graphite,
    letterSpacing: -1,
    lineHeight: 44,
    textAlign: 'center',
    marginBottom: spacing.s4,
  },

  breakdown: {
    borderTopWidth: 0.5,
    borderTopColor: colors.ruleSoft,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ruleSoft,
  },
  breakdownRowLast: { borderBottomWidth: 0 },
  breakdownRowEmph: {
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
    marginTop: 4,
  },
  breakdownLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  breakdownLabelEmph: {
    color: colors.graphite,
    fontFamily: fontBody,
    fontSize: fontSize.body,
  },
  breakdownValue: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  breakdownValueEmph: {
    fontFamily: fontDisplay,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    letterSpacing: -0.5,
  },

  resultCtas: {
    flexDirection: 'row',
    gap: spacing.s3,
    paddingTop: spacing.s3,
  },

});
