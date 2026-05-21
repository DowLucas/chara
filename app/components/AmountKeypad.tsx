import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  colors,
  fontBodyMedium,
  fontMono,
  fontMonoMedium,
  fontSize,
  spacing,
} from '@/lib/theme';
import { evalExpression, hasOperator } from '@/lib/evalExpression';

/**
 * Modal math keypad. Slides up over the screen; tapping the scrim or `=` closes it.
 *
 * Contract:
 *   - `value` is the raw expression string (e.g. "12.50+3.40").
 *   - `onChange(next)` fires on every keystroke.
 *   - `onSubmit(resolved)` fires on `=`. The resolved value is the evaluated number
 *     with up to 2 decimals (trailing zeros trimmed). For plain numbers, the value
 *     is returned unchanged.
 */
interface Props {
  visible: boolean;
  value: string;
  currency: string;
  onChange: (next: string) => void;
  onSubmit: (resolved: string) => void;
  onClose: () => void;
}

// All characters the evaluator treats as binary operators (incl. ASCII synonyms).
const OPERATORS = new Set(['+', '-', '*', '/', '×', '÷', '−']);

// The four operator glyphs used on keypad buttons (display form).
const DISPLAY_OPERATORS = ['÷', '×', '−', '+'] as const;
const BACKSPACE_KEY = '⌫';
const DECIMAL_KEY = '.';

// Starting translateY for the closed sheet — window height guarantees off-screen.
const SHEET_OFFSCREEN = Dimensions.get('window').height;

const KEY_ROWS: readonly (readonly string[])[] = [
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  [DECIMAL_KEY, '0', BACKSPACE_KEY, '+'],
];

const isOperator = (ch: string): boolean => OPERATORS.has(ch);
const isDisplayOperator = (k: string): boolean =>
  (DISPLAY_OPERATORS as readonly string[]).includes(k);
const lastChar = (s: string): string => (s.length === 0 ? '' : s[s.length - 1]);

function appendKey(value: string, key: string): string {
  // Tapping a second operator replaces a trailing one — taps fix mistakes.
  if (isOperator(key) && isOperator(lastChar(value))) {
    return value.slice(0, -1) + key;
  }
  // Disallow leading non-minus operator.
  if (value.length === 0 && isOperator(key) && key !== '-' && key !== '−') {
    return value;
  }
  if (key === DECIMAL_KEY) {
    // Prevent two decimals in the current number segment.
    for (let i = value.length - 1; i >= 0; i--) {
      const c = value[i];
      if (isOperator(c)) break;
      if (c === DECIMAL_KEY) return value;
    }
    // Implicit leading zero so ".5" renders as "0.5".
    const tail = lastChar(value);
    if (value.length === 0 || isOperator(tail)) return value + '0.';
  }
  return value + key;
}

function formatResolved(n: number): string {
  // Round to minor units, then trim trailing zeros and stray dot.
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
}

export function AmountKeypad({
  visible,
  value,
  currency,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();

  const preview = useMemo(() => {
    if (!hasOperator(value)) return null;
    const r = evalExpression(value);
    return r === null ? null : formatResolved(r);
  }, [value]);

  const handleKey = (k: string) => onChange(appendKey(value, k));
  const handleBackspace = () => onChange(value.slice(0, -1));
  const handleClear = () => onChange('');

  const handleEquals = () => {
    if (!value) { onClose(); return; }
    if (!hasOperator(value)) { onSubmit(value); return; }
    const r = evalExpression(value);
    if (r === null) return; // invalid — let the user fix it
    const resolved = formatResolved(r);
    onChange(resolved);
    onSubmit(resolved);
  };

  // Animate scrim opacity and sheet translateY independently — the Modal renders
  // with animationType="none" so we control both values. `mounted` keeps the Modal
  // rendered through the closing animation; it flips to false in the completion
  // callback so the native modal unmounts only after the sheet has slid away.
  const [mounted, setMounted] = useState(visible);
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(SHEET_OFFSCREEN)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslate, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(scrimOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslate, {
          toValue: SHEET_OFFSCREEN,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // mounted intentionally excluded — we only react to `visible` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrimPressable} onPress={onClose}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.scrimBg, { opacity: scrimOpacity }]}
        />
      </Pressable>
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]}
      >
        <DisplayField
          value={value}
          preview={preview}
          currency={currency}
          placeholder={t('keypad.placeholder')}
        />

        <View style={styles.grid}>
          {KEY_ROWS.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((k) => (
                <KeypadKey
                  key={k}
                  label={k}
                  onPress={k === BACKSPACE_KEY ? handleBackspace : () => handleKey(k)}
                  onLongPress={k === BACKSPACE_KEY ? handleClear : undefined}
                  accessibilityLabel={accessibilityLabelFor(k, t)}
                />
              ))}
            </View>
          ))}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleEquals}
            style={styles.equals}
            accessibilityLabel={t('keypad.equals')}
          >
            <Text style={styles.equalsLabel}>=</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

interface DisplayFieldProps {
  value: string;
  preview: string | null;
  currency: string;
  placeholder: string;
}

function DisplayField({ value, preview, currency, placeholder }: DisplayFieldProps) {
  return (
    <View style={styles.displayField}>
      <Text
        style={[styles.displayExpr, !value && styles.displayPlaceholder]}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      <View style={styles.displayRight}>
        {preview !== null ? (
          <Text style={styles.displayResult} numberOfLines={1}>{'= '}{preview}</Text>
        ) : null}
        <Text style={styles.displayCurrency} numberOfLines={1}>
          {currency.toLowerCase()}
        </Text>
      </View>
    </View>
  );
}

interface KeypadKeyProps {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}

function KeypadKey({ label, onPress, onLongPress, accessibilityLabel }: KeypadKeyProps) {
  const isOp = isDisplayOperator(label);
  const isBack = label === BACKSPACE_KEY;
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      style={[styles.key, isOp && styles.keyOp, isBack && styles.keyBack]}
    >
      <Text style={styles.keyLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function accessibilityLabelFor(k: string, t: (k: string) => string): string {
  if (k === BACKSPACE_KEY) return t('keypad.backspace');
  if (isDisplayOperator(k)) return t(`keypad.op.${k}`);
  return k;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrimPressable: { flex: 1 },
  scrimBg: { backgroundColor: 'rgba(45, 31, 26, 0.35)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleSoft,
  },
  displayField: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ruleSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s3,
    minHeight: 48,
  },
  displayExpr: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.displayS,
    color: colors.graphite,
    flexShrink: 1,
  },
  displayPlaceholder: {
    color: colors.lead,
    fontFamily: fontMono,
  },
  displayRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: spacing.s2,
  },
  displayResult: {
    fontFamily: fontMonoMedium,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    marginRight: spacing.s1,
  },
  displayCurrency: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.lead,
  },
  grid: { gap: spacing.s2 },
  row: { flexDirection: 'row', gap: spacing.s2 },
  key: {
    flex: 1,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOp: { backgroundColor: 'rgba(45, 31, 26, 0.08)' },
  keyBack: { backgroundColor: 'rgba(184, 61, 61, 0.10)' },
  keyLabel: {
    fontFamily: fontMonoMedium,
    fontSize: 22,
    color: colors.graphite,
  },
  equals: {
    marginTop: spacing.s3,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.vermillion,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equalsLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
    letterSpacing: 0.2,
  },
});
