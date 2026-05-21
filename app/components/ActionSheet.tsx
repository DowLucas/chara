import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18n from '@/lib/i18n';
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
  const cancelLabel = i18n.t('common.cancel');

  // On iOS, the native sheet is the right primitive — but we only invoke it
  // imperatively. Callers that want the native sheet should use openNativeSheet
  // directly; this component renders the Android/Web bottom sheet UI.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.s3 }]}>
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
              onClose();
              // Defer so the modal can dismiss before the next screen mounts.
              setTimeout(opt.onPress, Platform.OS === 'android' ? 80 : 0);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowLabel, opt.destructive && styles.rowLabelDestructive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.row, styles.cancelRow]} onPress={onClose} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, styles.cancelLabel]}>{cancelLabel}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/** Convenience: on iOS, show the native sheet; on other platforms, the caller
 *  should render <ActionSheet> with its own visible state. */
export function openNativeActionSheet(
  title: string | undefined,
  options: ActionSheetOption[],
): boolean {
  if (Platform.OS !== 'ios') return false;
  const labels = [...options.map((o) => o.label), i18n.t('common.cancel')];
  const destructiveIndex = options.findIndex((o) => o.destructive);
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options: labels,
      cancelButtonIndex: labels.length - 1,
      destructiveButtonIndex: destructiveIndex === -1 ? undefined : destructiveIndex,
    },
    (i) => {
      if (i >= 0 && i < options.length) options[i].onPress();
    },
  );
  return true;
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
