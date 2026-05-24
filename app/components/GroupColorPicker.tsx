import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ReactNativeColorPicker from 'react-native-wheel-color-picker';
import { markPopupClosed } from '@/lib/popup-guard';
import {
  clearOverride,
  groupColorFor,
  hashSwatch,
  hasOverride,
  setOverride,
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

type PersistedProps = {
  visible: boolean;
  onClose: () => void;
  serverUrl: string;
  groupId: string;
};

type EphemeralProps = {
  visible: boolean;
  onClose: () => void;
  /** Currently picked hex (null = no selection / auto). */
  value: string | null;
  /** Called with the picked hex, or null to reset to auto. */
  onChange: (hex: string | null) => void;
  /** Seed used for the "auto" preview dot when no value is picked.
   *  For the create-group flow there's no groupId yet, so any stable
   *  string (e.g. the typed name) works; an empty string falls back to
   *  the first swatch via hashSwatch. */
  autoSeed?: string;
};

type Props = PersistedProps | EphemeralProps;

function isEphemeral(p: Props): p is EphemeralProps {
  return (p as EphemeralProps).onChange !== undefined;
}

/** Bottom sheet for picking a group's accent color. 8 Edo swatches +
 *  a "Custom color" affordance opening a hue-saturation wheel + lightness
 *  slider. Two modes:
 *   - Persisted: pass (serverUrl, groupId); writes via group-color overrides.
 *   - Ephemeral: pass (value, onChange); used before the group exists. */
export function GroupColorPicker(props: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);
  const [wheelColor, setWheelColor] = useState<string>('#6B4B7E');

  const ephemeral = isEphemeral(props);
  const current = ephemeral
    ? props.value ?? hashSwatch(props.autoSeed ?? '')
    : groupColorFor(props.serverUrl, props.groupId);
  const isOverridden = ephemeral
    ? props.value !== null
    : hasOverride(props.serverUrl, props.groupId);
  const autoColor = ephemeral
    ? hashSwatch(props.autoSeed ?? '')
    : hashSwatch(props.groupId);

  // Reset internal state every time the sheet is reopened, seeding the
  // wheel from the group's currently-resolved color so the user starts
  // from "where they are" instead of an arbitrary default.
  useEffect(() => {
    if (props.visible) {
      setCustomOpen(false);
      setWheelColor(current);
    }
    // `current` deliberately omitted — only seed at open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  const close = React.useCallback(() => {
    markPopupClosed();
    props.onClose();
  }, [props]);

  async function pickSwatch(hex: string) {
    if (ephemeral) {
      props.onChange(hex);
    } else {
      await setOverride(props.serverUrl, props.groupId, hex);
    }
    close();
  }

  async function resetToAuto() {
    if (ephemeral) {
      props.onChange(null);
    } else {
      await clearOverride(props.serverUrl, props.groupId);
    }
    close();
  }

  async function submitCustom() {
    const hex = wheelColor.toLowerCase();
    if (ephemeral) {
      props.onChange(hex);
    } else {
      await setOverride(props.serverUrl, props.groupId, hex);
    }
    close();
  }

  return (
    <Modal
      visible={props.visible}
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
            <View style={styles.previewRow}>
              <View
                style={[styles.previewDisk, { backgroundColor: wheelColor }]}
              />
              <Text style={styles.previewLabel} numberOfLines={1}>
                {wheelColor.toUpperCase()}
              </Text>
            </View>
            <View style={styles.wheelWrap}>
              <ReactNativeColorPicker
                color={wheelColor}
                onColorChange={(c: string) => setWheelColor(c)}
                thumbSize={28}
                sliderSize={22}
                gapSize={spacing.s4}
                noSnap
                swatches={false}
                shadeWheelThumb
                shadeSliderThumb
              />
            </View>
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
                style={styles.primaryBtn}
                activeOpacity={0.7}
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
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  previewDisk: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.ruleSoft,
  },
  previewLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.lead,
    letterSpacing: 0.5,
  },
  wheelWrap: {
    // Fixed height so the bottom sheet has a stable size regardless of
    // the wheel library's internal layout pass.
    height: 280,
    marginBottom: spacing.s3,
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
