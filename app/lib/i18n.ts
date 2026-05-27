import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';
import { currencyLocale } from './currencies';

import en from './locales/en.json';
import sv from './locales/sv.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import nl from './locales/nl.json';
import da from './locales/da.json';
import fi from './locales/fi.json';
import ar from './locales/ar.json';
import ja from './locales/ja.json';
import zhHans from './locales/zh-Hans.json';

const KEY_LANGUAGE = 'chara.language';

export const SUPPORTED_LANGUAGES = [
  'en',
  'sv',
  'de',
  'fr',
  'it',
  'nl',
  'da',
  'fi',
  'ar',
  'ja',
  'zh-Hans',
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/** Native-tongue display names, shown in the language picker so a user can
 *  find their language regardless of what the UI is currently set to. */
export const LANGUAGE_NATIVE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  sv: 'Svenska',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  nl: 'Nederlands',
  da: 'Dansk',
  fi: 'Suomi',
  ar: 'العربية',
  ja: '日本語',
  'zh-Hans': '中文（简体）',
};

export const resources = {
  en: { translation: en },
  sv: { translation: sv },
  de: { translation: de },
  fr: { translation: fr },
  it: { translation: it },
  nl: { translation: nl },
  da: { translation: da },
  fi: { translation: fi },
  ar: { translation: ar },
  ja: { translation: ja },
  'zh-Hans': { translation: zhHans },
} as const;

function detectLanguage(): SupportedLanguage {
  const supported = SUPPORTED_LANGUAGES as readonly string[];
  const locales = getLocales();
  for (const l of locales) {
    const tag = (l.languageTag ?? '').toLowerCase();
    const code = (l.languageCode ?? '').toLowerCase();
    // Try the most specific match first: tag prefix (e.g. "zh-Hans" from
    // "zh-Hans-CN"), then the bare language code.
    const tagMatch = supported.find((s) => tag.startsWith(s.toLowerCase()));
    if (tagMatch) return tagMatch as SupportedLanguage;
    if (supported.includes(code)) return code as SupportedLanguage;
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
  // After sync init, async-load the user's explicit choice (if any) and
  // switch to it. Brief device-locale → stored-choice flash on cold boot
  // is acceptable; the alternative (async-init) would block app startup.
  SecureStore.getItemAsync(KEY_LANGUAGE)
    .then((stored) => {
      if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
        if (i18n.language !== stored) {
          i18n.changeLanguage(stored);
        }
      }
    })
    .catch(() => {
      // SecureStore can throw before the keychain is unlocked on iOS; the
      // user can re-pick from the You tab if their stored choice is lost.
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

/** Format a money value stored as minor units (öre/cents) in the currency's
 *  native presentation — "495,82 kr" for SEK, "$1,234.56" for USD, "1.234,56 €"
 *  for EUR — regardless of the app's UI language. This matches the convention
 *  used by Wise, Revolut, and Stripe Dashboard: amounts read in the shape the
 *  currency's home audience uses, not whatever the reader's UI happens to be
 *  set to.
 *
 *  Currencies without a home-locale mapping (or whose locale the runtime
 *  doesn't recognise) fall back to the app's current locale.
 *
 *  `relative` adds a leading + / − sign. */
export function formatMinorUnits(minor: number | string, currency: string, opts?: { relative?: boolean }): string {
  const n = typeof minor === 'string' ? parseInt(minor, 10) : minor;
  const safe = Number.isFinite(n) ? n : 0;
  const value = Math.abs(safe) / 100;
  const home = currencyLocale(currency);
  // Try the currency's home locale first; if Intl on this runtime doesn't
  // recognise that BCP-47 tag (older Hermes / JSC builds), retry with the
  // app's current locale before giving up.
  let formatted: string | null = null;
  for (const locale of home ? [home, currentLocale()] : [currentLocale()]) {
    try {
      formatted = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      }).format(value);
      break;
    } catch {
      /* try the next locale */
    }
  }
  if (formatted == null) {
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

/** Compact variant of `formatMinorUnits` for tight layouts (the home
 *  hero in particular). Replaces wide locale spaces — the non-breaking
 *  / narrow-no-break thousand separator and the regular space between
 *  number and currency symbol — with a hair space (U+200A), and uses a
 *  narrower minus prefix. Same number, ~30% less horizontal width.
 *
 *  Use ONLY in display layouts that already struggle for room. Forms,
 *  receipts, and ledger rows should keep `formatMinorUnits` so the user
 *  reads exactly what their OS would render anywhere else. */
export function formatMinorUnitsCompact(
  minor: number | string,
  currency: string,
  opts?: { relative?: boolean },
): string {
  const raw = formatMinorUnits(minor, currency, opts);
  // U+00A0 (NBSP), U+202F (narrow NBSP), U+2009 (thin space), regular ASCII
  // space — every horizontal space gets squeezed to U+200A (hair space).
  return raw.replace(/[    ]/g, ' ');
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

/** Returns a `t` function that always resolves keys in English, regardless of
 *  the user's selected app language. Used by the login and onboarding screens
 *  where the user hasn't yet confirmed they understand the UI language — the
 *  detected device locale can be wrong (shared/borrowed device, multilingual
 *  users) and getting stuck unable to read the sign-in screen is fatal. */
export function useEnglishT(): (key: string, opts?: Record<string, unknown>) => string {
  return useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      i18n.t(key, { ...(opts ?? {}), lng: 'en' }) as string,
    [],
  );
}

export default i18n;
