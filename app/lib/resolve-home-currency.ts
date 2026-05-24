/**
 * Pure resolver for the effective home currency. Order of precedence:
 *
 *   1. Explicit setting (from `accountsBlob.homeCurrency`). Trusted —
 *      we surface whatever was stored without re-validating.
 *   2. Device locale's currency code (e.g. "SEK" on a Swedish device).
 *   3. The default account's first group's currency.
 *   4. "EUR" — hard fallback aligned with the ECB pivot.
 *
 * Fallback values (2, 3) are validated against `/^[A-Z]{3}$/`; anything
 * else is treated as missing and we fall through to the next level.
 *
 * No React, no expo-localization — see `useHomeCurrency()` for the hook
 * that wires this up.
 */

const HARD_FALLBACK = 'EUR';
const ISO_4217 = /^[A-Z]{3}$/;

export interface HomeCurrencyInputs {
  /** Persisted user choice (`accountsBlob.homeCurrency`); `null` means
   *  the user hasn't picked one yet. */
  explicit: string | null;
  /** Device locale's currency code (`getLocales()[0].currencyCode`). */
  localeCurrency: string | null;
  /** Currency of the first group on the user's default account, if any. */
  defaultAccountFirstGroupCurrency: string | null;
}

export interface ResolvedHomeCurrency {
  homeCurrency: string;
  /** `true` iff the user has explicitly chosen one. Drives the "auto"
   *  hint in the Settings row. */
  isExplicit: boolean;
}

function validIso(code: string | null): string | null {
  if (!code) return null;
  return ISO_4217.test(code) ? code : null;
}

export function resolveHomeCurrency(
  input: HomeCurrencyInputs,
): ResolvedHomeCurrency {
  if (input.explicit) {
    return { homeCurrency: input.explicit, isExplicit: true };
  }
  const fallback =
    validIso(input.localeCurrency) ??
    validIso(input.defaultAccountFirstGroupCurrency) ??
    HARD_FALLBACK;
  return { homeCurrency: fallback, isExplicit: false };
}
