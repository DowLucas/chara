import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '@/lib/i18n';
import { markPopupClosed } from '@/lib/popup-guard';
import { useResponsive } from '@/lib/use-responsive';
import { colors, fontBody, fontBodyMedium, fontMono, fontSize, spacing } from '@/lib/theme';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
}

/** Bottom sheet on Android / Web, native iOS sheet on iOS. */
export function ActionSheet({ visible, onClose, title, options }: Props) {
  const insets = useSafeAreaInsets();
  const { sheetMaxWidth } = useResponsive();
  const cancelLabel = i18n.t('common.cancel');

  // Pending option callback. We dismiss the Modal first, then fire the
  // callback only after the Modal has fully torn down its underlying view
  // controller (iOS) / view (Android). Without this, iOS refuses to present
  // a follow-up VC like ImagePicker.launchCameraAsync from inside the
  // still-mounted Modal's presenter chain — the camera call hangs forever
  // with no resolve and no reject.
  const pendingActionRef = React.useRef<(() => void) | null>(null);

  // Stamp the popup-guard whenever this sheet closes so the parent screen's
  // row underneath the backdrop can't fire `onPress` in the same gesture
  // that dismissed us. See app/lib/popup-guard.ts.
  const closeWithGuard = React.useCallback(() => {
    markPopupClosed();
    onClose();
  }, [onClose]);

  const handleDismissed = React.useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
  }, []);

  // On iOS, the native sheet is the right primitive — but we only invoke it
  // imperatively. Callers that want the native sheet should use openNativeSheet
  // directly; this component renders the Android/Web bottom sheet UI.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeWithGuard}
      onDismiss={handleDismissed}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={closeWithGuard}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.s3 },
          sheetMaxWidth != null && { maxWidth: sheetMaxWidth, marginHorizontal: 'auto' },
        ]}
      >
        {title && (
          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
          </View>
        )}
        {options.map((opt, i) => (
          <TouchableOpacity
            key={`${opt.label}-${i}`}
            style={[styles.row, i === 0 && !title && styles.rowFirst]}
            onPress={() => {
              // Queue the action and dismiss. On iOS the Modal fires
              // onDismiss after its presentation animation completes, which
              // is the only safe moment to launch another view controller
              // (camera, image picker, share sheet). onDismiss does not
              // fire on Android, so we fall back to a setTimeout there.
              pendingActionRef.current = opt.onPress;
              closeWithGuard();
              if (Platform.OS !== 'ios') {
                setTimeout(() => {
                  const action = pendingActionRef.current;
                  pendingActionRef.current = null;
                  if (action) action();
                }, 80);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowLabel, opt.destructive && styles.rowLabelDestructive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={closeWithGuard} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, styles.cancelLabel]}>{cancelLabel}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/**
 * Backward-compat shim. Previously this fired the native iOS ActionSheetIOS;
 * we now always render the JS `<ActionSheet>` component so the look matches
 * the rest of the app's custom modal infrastructure. Returns `false`
 * unconditionally so existing callers fall through to their JS-sheet
 * fallback path. New code should render `<ActionSheet>` directly.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function openNativeActionSheet(
  _title: string | undefined,
  _options: ActionSheetOption[],
): boolean {
  return false;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: 0.5,
    borderColor: colors.graphite,
    paddingTop: spacing.s2,
    paddingHorizontal: spacing.s2,
  },
  titleRow: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 0.5,
    borderColor: colors.ruleSoft,
  },
  title: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  row: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderBottomWidth: 0.5,
    borderColor: colors.ruleSoft,
  },
  rowFirst: {
    paddingTop: spacing.s5,
  },
  rowLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: -0.2,
  },
  rowLabelDestructive: {
    color: colors.vermillion,
  },
  cancelRow: {
    marginTop: spacing.s2,
    borderBottomWidth: 0,
    backgroundColor: colors.bone,
    borderRadius: 8,
  },
  cancelLabel: {
    color: colors.lead,
    textAlign: 'center',
    width: '100%',
  },
});
