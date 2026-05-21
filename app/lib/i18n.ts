import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en.json';

export const SUPPORTED_LANGUAGES = ['en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const resources = {
  en: { translation: en },
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
 *  you ever support JPY/KWD. */
export function decimalToMinor(decimal: string | number): number {
  if (typeof decimal === 'number') return Math.round(decimal * 100);
  const s = decimal.trim();
  if (!s) return 0;
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const n = parseInt(intPart || '0', 10) * 100 + parseInt(frac || '0', 10);
  return neg ? -n : n;
}

/** Format a money value stored as minor units (öre/cents) into a localized
 *  string like "1 234 SEK" or "-1,234 USD". `relative` adds a leading sign. */
export function formatMinorUnits(minor: number | string, currency: string, opts?: { relative?: boolean }): string {
  const n = typeof minor === 'string' ? parseInt(minor, 10) : minor;
  if (!Number.isFinite(n)) return `0 ${currency}`;
  const abs = Math.abs(n);
  const formatted = (abs / 100).toLocaleString(currentLocale(), { minimumFractionDigits: 0 });
  if (opts?.relative) {
    const sign = n > 0 ? '+' : n < 0 ? '−' : '';
    return `${sign}${formatted} ${currency}`;
  }
  return `${formatted} ${currency}`;
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
