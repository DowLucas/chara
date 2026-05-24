import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { markPopupClosed } from '@/lib/popup-guard';
import {
  clearOverride,
  groupColorFor,
  hashSwatch,
  hasOverride,
  setOverride,
  validateHex,
} from '@/lib/group-color';
import {
  colors,
  fontBody,
  fontBodyMedium,
  fontMono,
  fontSize,
  groupAccentSwatches,
  spacing,
} from '@/lib/theme';

// Maps each swatch hex to the i18n key used for its accessibility label.
// Names are i18n-keyed (not the hexes themselves) so designers can retune
// a hex without breaking translations.
const SWATCH_A11Y_KEY: Record<string, string> = {
  '#1F3A6E': 'groupColor.swatch.indigo',
  '#3E6FA8': 'groupColor.swatch.blue',
  '#5E908A': 'groupColor.swatch.teal',
  '#6B4B7E': 'groupColor.swatch.purple',
  '#C26A7F': 'groupColor.swatch.pink',
  '#C99A2E': 'groupColor.swatch.gold',
  '#7A4F2E': 'groupColor.swatch.brown',
  '#1F1A18': 'groupColor.swatch.black',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  serverUrl: string;
  groupId: string;
}

/** Bottom sheet for picking a group's accent color. 8 swatches + reset +
 *  custom-hex input. Per-device, per-(serverUrl, groupId). */
export function GroupColorPicker({ visible, onClose, serverUrl, groupId }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [hexError, setHexError] = useState(false);

  const current = groupColorFor(serverUrl, groupId);
  const isOverridden = hasOverride(serverUrl, groupId);
  const autoColor = hashSwatch(groupId);

  // Reset internal state every time the sheet is reopened.
  useEffect(() => {
    if (visible) {
      setCustomOpen(false);
      setHexInput('');
      setHexError(false);
    }
  }, [visible]);

  const close = React.useCallback(() => {
    markPopupClosed();
    onClose();
  }, [onClose]);

  async function pickSwatch(hex: string) {
    await setOverride(serverUrl, groupId, hex);
    close();
  }

  async function resetToAuto() {
    await clearOverride(serverUrl, groupId);
    close();
  }

  async function submitCustom() {
    const v = hexInput.trim();
    const normalized = v.startsWith('#') ? v : `#${v}`;
    if (!validateHex(normalized)) {
      setHexError(true);
      return;
    }
    await setOverride(serverUrl, groupId, normalized.toLowerCase());
    close();
  }

  const previewHex = (() => {
    const v = hexInput.trim();
    const normalized = v.startsWith('#') ? v : `#${v}`;
    return validateHex(normalized) ? normalized : null;
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={close}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.s4 },
        ]}
      >
        <Text style={styles.title}>{t('groupColor.title')}</Text>

        {customOpen ? (
          <View style={styles.customWrap}>
            <View style={styles.customRow}>
              <View
                style={[
                  styles.previewDisk,
                  { backgroundColor: previewHex ?? colors.ruleSoft },
                ]}
              />
              <TextInput
                value={hexInput}
                onChangeText={(v) => {
                  setHexInput(v);
                  setHexError(false);
                }}
                placeholder={t('groupColor.hexPlaceholder')}
                placeholderTextColor={colors.lead}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                maxLength={7}
                style={styles.hexInput}
                onSubmitEditing={submitCustom}
                returnKeyType="done"
              />
            </View>
            {hexError && (
              <Text style={styles.hexError}>{t('groupColor.hexInvalid')}</Text>
            )}
            <View style={styles.customActions}>
              <TouchableOpacity
                onPress={() => setCustomOpen(false)}
                style={styles.secondaryBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnLabel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitCustom}
                style={[styles.primaryBtn, !previewHex && styles.primaryBtnDisabled]}
                activeOpacity={previewHex ? 0.7 : 1}
                disabled={!previewHex}
              >
                <Text style={styles.primaryBtnLabel}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              {groupAccentSwatches.map((hex) => {
                const selected = hex.toLowerCase() === current.toLowerCase();
                return (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => pickSwatch(hex)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t(SWATCH_A11Y_KEY[hex] ?? 'groupColor.title')}
                    style={styles.swatchHit}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: hex },
                        selected && styles.swatchSelected,
                      ]}
                    >
                      {selected && (
                        <Feather name="check" size={18} color={colors.fgOnAccent} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setCustomOpen(true)}
              style={styles.actionRow}
              activeOpacity={0.7}
            >
              <View style={styles.actionRowLeft}>
                <Feather name="plus" size={16} color={colors.lead} />
                <Text style={styles.actionRowLabel}>{t('groupColor.custom')}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.lead} />
            </TouchableOpacity>

            {isOverridden && (
              <TouchableOpacity
                onPress={resetToAuto}
                style={styles.actionRow}
                activeOpacity={0.7}
              >
                <View style={styles.actionRowLeft}>
                  <View
                    style={[styles.autoDot, { backgroundColor: autoColor }]}
                  />
                  <Text style={styles.actionRowLabel}>{t('groupColor.reset')}</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const SWATCH_DIM = 56;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.s4,
    paddingHorizontal: spacing.s5,
    borderTopWidth: 1.5,
    borderTopColor: colors.graphite,
  },
  title: {
    fontFamily: fontMono,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: spacing.s4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s3,
    justifyContent: 'flex-start',
    marginBottom: spacing.s3,
  },
  swatchHit: {
    padding: 2,
  },
  swatch: {
    width: SWATCH_DIM,
    height: SWATCH_DIM,
    borderRadius: SWATCH_DIM / 2,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: colors.graphite,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.ruleSoft,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  actionRowLabel: {
    fontFamily: fontBody,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
  autoDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
  customWrap: {
    paddingBottom: spacing.s3,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  previewDisk: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
  hexInput: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    borderBottomWidth: 1,
    borderBottomColor: colors.ruleSoft,
    paddingVertical: spacing.s2,
    letterSpacing: 0.5,
  },
  hexError: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.brick,
    marginTop: spacing.s2,
  },
  customActions: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s4,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    backgroundColor: colors.vermillion,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: colors.lead,
  },
  primaryBtnLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.graphite,
  },
});
