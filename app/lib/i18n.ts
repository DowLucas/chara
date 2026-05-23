import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';
import sv from './locales/sv.json';

export const SUPPORTED_LANGUAGES = ['en', 'sv'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const resources = {
  en: { translation: en },
  sv: { translation: sv },
} as const;

function detectLanguage(): SupportedLanguage {
  const locales = getLocales();
  for (const l of locales) {
    const code = (l.languageCode ?? '').toLowerCase();
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      return code as SupportedLanguage;
    }
  }
  return FALLBACK_LANGUAGE;
}

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      resources,
      lng: detectLanguage(),
      fallbackLng: FALLBACK_LANGUAGE,
      defaultNS: 'translation',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
}

/** BCP-47 locale tag for Intl.* APIs — uses the device's region when available. */
export function currentLocale(): string {
  const locales = getLocales();
  const first = locales[0];
  if (first?.languageTag) return first.languageTag;
  return i18n.language || FALLBACK_LANGUAGE;
}

/** Convert a wire-format decimal string ("12.34", "12", "-6.00") to int64
 *  minor units (1234, 1200, -600). Assumes 2-decimal currencies; expand if
 *  you ever support JPY/KWD. Re-exported from a pure module so jest can
 *  pull it without dragging in expo-localization. */
export { decimalToMinor } from './money-utils';

/** Format a money value stored as minor units (öre/cents) using the device's
 *  locale and the currency's native presentation — "495,82 kr" for SEK in
 *  sv-SE, "$1,234.56" for USD in en-US, "1.234,56 €" for EUR in de-DE. Falls
 *  back to "amount CODE" if the runtime can't resolve the currency.
 *  `relative` adds a leading + / − sign. */
export function formatMinorUnits(minor: number | string, currency: string, opts?: { relative?: boolean }): string {
  const n = typeof minor === 'string' ? parseInt(minor, 10) : minor;
  const safe = Number.isFinite(n) ? n : 0;
  const value = Math.abs(safe) / 100;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(currentLocale(), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(value);
  } catch {
    // Unknown ISO code on this runtime — keep the old shape so the UI
    // doesn't crash.
    formatted = `${value.toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} ${currency}`;
  }
  if (opts?.relative) {
    const sign = safe > 0 ? '+' : safe < 0 ? '−' : '';
    return `${sign}${formatted}`;
  }
  return formatted;
}

/** Localized date string (short form). */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(currentLocale());
}

/** Localized time string (HH:MM). */
export function formatTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
}

export default i18n;
