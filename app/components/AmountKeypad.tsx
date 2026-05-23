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
 * Modal math keypad. Slides up over the screen; tapping the scrim or Done closes it.
 *
 * Contract:
 *   - `value` is the raw expression string (e.g. "12.50+3.40").
 *   - `onChange(next)` fires on every keystroke and when `=` folds the expression
 *     into its result (Ans-style — keypad stays open so the user can keep typing,
 *     e.g. `+ 2 =` to continue from the new total).
 *   - `onSubmit(resolved)` fires on Done. The resolved value is the evaluated
 *     number with up to 2 decimals (trailing zeros trimmed); plain numbers pass
 *     through unchanged.
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
const CLEAR_KEY = 'AC';
const EQUALS_KEY = '=';
const DECIMAL_KEY = '.';

// Starting translateY for the closed sheet — window height guarantees off-screen.
const SHEET_OFFSCREEN = Dimensions.get('window').height;

// Calculator layout: numbers on the left, operators on the right column,
// AC + ⌫ on top, 0 spans two cells on the bottom row, = at bottom-right.
// `span` controls how many of the 4 grid columns a key occupies.
type KeySpec = { label: string; span?: number };
const KEY_ROWS: readonly (readonly KeySpec[])[] = [
  [{ label: CLEAR_KEY, span: 2 }, { label: BACKSPACE_KEY }, { label: '÷' }],
  [{ label: '7' }, { label: '8' }, { label: '9' }, { label: '×' }],
  [{ label: '4' }, { label: '5' }, { label: '6' }, { label: '−' }],
  [{ label: '1' }, { label: '2' }, { label: '3' }, { label: '+' }],
  [{ label: '0', span: 2 }, { label: DECIMAL_KEY }, { label: EQUALS_KEY }],
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

  // Evaluate the in-progress expression and replace it with the result, like
  // Ans on a classic calculator. Keeps the keypad open so the user can keep
  // composing (e.g. type `+ 2 =` again to continue from the new total).
  const handleEquals = () => {
    if (!value || !hasOperator(value)) return;
    const r = evalExpression(value);
    if (r === null) return; // invalid — let the user fix it
    onChange(formatResolved(r));
  };

  // Submit + close. Evaluates first so a half-typed expression resolves cleanly.
  const handleDone = () => {
    if (!value) { onClose(); return; }
    if (!hasOperator(value)) { onSubmit(value); return; }
    const r = evalExpression(value);
    if (r === null) return;
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
              {row.map(({ label, span }) => {
                let onPress: () => void;
                if (label === BACKSPACE_KEY) onPress = handleBackspace;
                else if (label === CLEAR_KEY) onPress = handleClear;
                else if (label === EQUALS_KEY) onPress = handleEquals;
                else onPress = () => handleKey(label);
                return (
                  <KeypadKey
                    key={label}
                    label={label}
                    span={span ?? 1}
                    onPress={onPress}
                    onLongPress={label === BACKSPACE_KEY ? handleClear : undefined}
                    accessibilityLabel={accessibilityLabelFor(label, t)}
                  />
                );
              })}
            </View>
          ))}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleDone}
            style={styles.done}
            accessibilityLabel={t('keypad.done')}
          >
            <Text style={styles.doneLabel}>{t('keypad.done')}</Text>
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
  span: number;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}

function KeypadKey({ label, span, onPress, onLongPress, accessibilityLabel }: KeypadKeyProps) {
  const isOp = isDisplayOperator(label);
  const isBack = label === BACKSPACE_KEY;
  const isClear = label === CLEAR_KEY;
  const isEquals = label === EQUALS_KEY;
  // = is styled like the other operators — it folds the expression into a result
  // (Ans), but doesn't submit. Done is the primary action.
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.key,
        { flex: span },
        (isOp || isEquals) && styles.keyOp,
        isBack && styles.keyBack,
        isClear && styles.keyClear,
      ]}
    >
      <Text style={styles.keyLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function accessibilityLabelFor(k: string, t: (k: string) => string): string {
  if (k === BACKSPACE_KEY) return t('keypad.backspace');
  if (k === CLEAR_KEY) return t('keypad.clear');
  if (k === EQUALS_KEY) return t('keypad.equals');
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
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.bone,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOp: { backgroundColor: 'rgba(45, 31, 26, 0.08)' },
  keyBack: { backgroundColor: 'rgba(184, 61, 61, 0.10)' },
  keyClear: { backgroundColor: 'rgba(184, 61, 61, 0.10)' },
  keyLabel: {
    fontFamily: fontMonoMedium,
    fontSize: 22,
    color: colors.graphite,
  },
  done: {
    marginTop: spacing.s3,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.vermillion,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    fontFamily: fontBodyMedium,
    fontSize: fontSize.body,
    color: colors.fgOnAccent,
    letterSpacing: 0.2,
  },
});
