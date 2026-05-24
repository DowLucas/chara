import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  colors,
  fontBody,
  fontMono,
  fontSize,
  spacing,
} from '@/lib/theme';
import { ApiError, FxConvertResponse } from '@/lib/api';

export type FxState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: FxConvertResponse }
  | { kind: 'error'; message: string };

interface ConvertFn {
  (input: {
    from: string;
    to: string;
    amountMinor: number;
    asOf?: string;
  }): Promise<FxConvertResponse>;
}

/** Hook that owns the FX fetch + user-editable rate. Refetches whenever
 *  any of (from, to, amountMinor, asOf) changes. Same logic as the
 *  receipt scanner's FX section, just hoisted into a reusable hook. */
export function useFxConversion(args: {
  from: string;
  to: string;
  amountMinor: number;
  asOf?: string;
  enabled: boolean;
  convertFx: ConvertFn;
  /** debounce ms before firing the request. Set 0 for "now" (e.g. when
   *  the source is a fixed receipt total); >0 for inputs that change on
   *  every keystroke. */
  debounceMs?: number;
}) {
  const {
    from,
    to,
    amountMinor,
    asOf,
    enabled,
    convertFx,
    debounceMs = 0,
  } = args;
  const [fx, setFx] = useState<FxState | null>(
    enabled ? { kind: 'loading' } : null,
  );
  const [rateInput, setRateInput] = useState('');

  useEffect(() => {
    if (!enabled || amountMinor <= 0) {
      setFx(null);
      setRateInput('');
      return;
    }
    setFx({ kind: 'loading' });
    let cancelled = false;
    const handle = setTimeout(() => {
      convertFx({ from, to, amountMinor, asOf })
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
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // We don't put `convertFx` in deps — callers pass a fresh closure
    // each render; relying on (from, to, amountMinor, asOf, enabled) is
    // sufficient and prevents an effect-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, amountMinor, asOf, enabled, debounceMs]);

  const rateNumber: number | null = (() => {
    if (!rateInput.trim()) return null;
    const n = parseFloat(rateInput.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  })();

  const convertedMinor =
    rateNumber !== null ? Math.round(amountMinor * rateNumber) : 0;

  return { fx, rateInput, setRateInput, rateNumber, convertedMinor };
}

interface Props {
  from: string;
  to: string;
  amountMinor: number;
  fx: FxState | null;
  rateInput: string;
  setRateInput: (v: string) => void;
  rateNumber: number | null;
}

export function FxConversionSection({
  from,
  to,
  amountMinor,
  fx,
  rateInput,
  setRateInput,
  rateNumber,
}: Props) {
  const { t } = useTranslation();

  if (!fx) return null;

  if (fx.kind === 'loading') {
    return (
      <View style={styles.fxWrap}>
        <View style={styles.fxLoading}>
          <ActivityIndicator color={colors.graphite} />
          <Text style={styles.fxLoadingText}>
            {t('fx.loading', { from, to })}
          </Text>
        </View>
      </View>
    );
  }

  if (fx.kind === 'error') {
    return (
      <View style={styles.fxWrap}>
        <View style={styles.fxErrorRow}>
          <Feather name="alert-triangle" size={16} color={colors.vermillion} />
          <Text style={styles.fxErrorText}>
            {t('fx.error', { from, to })}
          </Text>
        </View>
        <Text style={styles.fxErrorHint}>{t('fx.errorHint')}</Text>
      </View>
    );
  }

  const convertedMinor =
    rateNumber !== null ? Math.round(amountMinor * rateNumber) : 0;

  return (
    <View style={styles.fxWrap}>
      <Text style={styles.fxHeader}>{t('fx.header', { to })}</Text>
      {/* helpers defined below */}

      <View style={styles.fxRateRow}>
        <Text style={styles.fxRateLabel}>{t('fx.rateLabel', { from })}</Text>
        <View style={styles.fxRateInputWrap}>
          <TextInput
            value={rateInput}
            onChangeText={setRateInput}
            keyboardType="decimal-pad"
            placeholder={fx.data.rate}
            placeholderTextColor={colors.lead}
            style={styles.fxRateInput}
            selectTextOnFocus
          />
          <Text style={styles.fxRateUnit}>{to}</Text>
        </View>
      </View>

      <View style={styles.fxConvertedRow}>
        <Text style={styles.fxConvertedLabel}>{t('fx.convertedLabel')}</Text>
        <View style={styles.fxConvertedInputWrap}>
          <TextInput
            value={
              rateNumber !== null
                ? formatMinorAsDecimal(convertedMinor)
                : ''
            }
            onChangeText={(txt) => {
              // User editing converted derives a new rate.
              // converted (major) * 100 = amountMinor * rate
              // → rate = (converted * 100) / amountMinor
              if (amountMinor <= 0) return;
              const n = parseFloat(txt.replace(',', '.'));
              if (!Number.isFinite(n) || n < 0) {
                setRateInput('');
                return;
              }
              const newRate = (n * 100) / amountMinor;
              setRateInput(stripTrailingZeros(newRate.toFixed(6)));
            }}
            keyboardType="decimal-pad"
            placeholder={t('fx.rateInvalid')}
            placeholderTextColor={colors.lead}
            style={styles.fxConvertedInput}
            selectTextOnFocus
          />
          <Text style={styles.fxConvertedUnit}>{to}</Text>
        </View>
      </View>
    </View>
  );
}

/** Minor units → "240.00" decimal string for editable display. */
function formatMinorAsDecimal(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  const body = `${major}.${cents.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

function stripTrailingZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

const styles = StyleSheet.create({
  fxWrap: {
    marginTop: spacing.s4,
    padding: spacing.s4,
    backgroundColor: colors.bone,
    borderRadius: 8,
    gap: spacing.s2,
  },
  fxHeader: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
  fxRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
    marginTop: 4,
  },
  fxRateLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  fxRateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.graphite,
    paddingBottom: 2,
    minWidth: 110,
  },
  fxRateInput: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    padding: 0,
    textAlign: 'right',
  },
  fxRateUnit: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  fxConvertedRow: {
    marginTop: spacing.s2,
    paddingTop: spacing.s2,
    borderTopWidth: 1,
    borderTopColor: colors.graphite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  fxConvertedLabel: {
    fontFamily: fontMono,
    fontSize: fontSize.body,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  fxConvertedInputWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.graphite,
    paddingBottom: 2,
    minWidth: 140,
    flexShrink: 1,
  },
  fxConvertedInput: {
    flex: 1,
    fontFamily: fontMono,
    fontSize: fontSize.bodyL,
    color: colors.graphite,
    padding: 0,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  fxConvertedUnit: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.lead,
    letterSpacing: 0.3,
  },
  fxLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  fxLoadingText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.graphite,
    letterSpacing: 0.3,
  },
  fxErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fxErrorText: {
    fontFamily: fontMono,
    fontSize: fontSize.caption,
    color: colors.vermillion,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  fxErrorHint: {
    fontFamily: fontBody,
    fontSize: fontSize.bodyS,
    color: colors.lead,
    lineHeight: 18,
  },
});
