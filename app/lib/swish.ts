/**
 * Pure link-building module for the Swish "Send via App-Switch" deep link.
 *
 * No React, no Linking, no AsyncStorage, no Expo APIs — easy to unit test.
 * See docs/swish-integration.md §3 for the deep-link spec.
 */

export type Platform = 'ios' | 'android' | 'web';

// SE mobile prefixes accepted by Swish (national, after the leading 0).
// Source: docs/swish-integration.md §3 + SE national numbering plan.
const SE_MOBILE_PREFIXES = ['70', '72', '73', '76', '79'] as const;

// Length of the national portion (e.g. "0701234567" → 10 digits).
const SE_NATIONAL_LENGTH = 10;

const MAX_MESSAGE_LEN = 50;
const MESSAGE_PREFIX = 'Chara: ';
// Swish's consumer-mode deep-link parser enforces the same character
// set as the merchant API: letters (a-ö / A-Ö including Swedish
// diacritics), digits, and `:;.,?!()"` plus space. Anything else —
// including `·` (U+00B7) and `-` — triggers "Felaktig länk". Source:
// https://developer.swish.nu/api/payment-request/v1 (message regex)
const ALLOWED_MESSAGE_CHARS = /[^a-zA-ZåäöÅÄÖ0-9:;.,?!()" ]/g;

/**
 * Normalizes a Swedish mobile number to canonical E.164 (`+46XXXXXXXXX`).
 *
 * Strips whitespace and dashes, accepts either a leading `0` (national)
 * or `+46` (E.164). Returns `null` if the input is not a valid Swedish
 * mobile number (prefixes +46 70/72/73/76/79 + 7 digits).
 */
export function normalizeSwishNumber(input: string): string | null {
  if (!input) return null;

  // Strip spaces, dashes, and other formatting characters.
  const cleaned = input.replace(/[\s\-()]/g, '');
  if (!cleaned) return null;

  let national: string;
  if (cleaned.startsWith('+46')) {
    // E.164 form: "+46" + 9 national digits (drops the leading 0).
    const rest = cleaned.slice(3);
    if (!/^\d+$/.test(rest)) return null;
    national = '0' + rest;
  } else if (cleaned.startsWith('0')) {
    if (!/^\d+$/.test(cleaned)) return null;
    national = cleaned;
  } else {
    // Reject any other country code, or plain digit blobs.
    return null;
  }

  if (national.length !== SE_NATIONAL_LENGTH) return null;

  const prefix = national.slice(1, 3);
  if (!(SE_MOBILE_PREFIXES as readonly string[]).includes(prefix)) return null;

  // Canonical E.164: "+46" + national digits without the leading 0.
  return '+46' + national.slice(1);
}

/**
 * `true` iff a Swish payment link can be built and opened from this device.
 *
 * Swish only works in SEK, on iOS/Android (the app isn't on the web), with
 * a valid SE mobile number and a positive amount.
 */
export function isSwishEligible(opts: {
  currency: string;
  payeeSwishNumber: string | null;
  platform: Platform;
  amountMinor: number;
}): boolean {
  if (opts.currency !== 'SEK') return false;
  if (opts.platform !== 'ios' && opts.platform !== 'android') return false;
  if (opts.amountMinor <= 0) return false;
  if (!opts.payeeSwishNumber) return false;
  return normalizeSwishNumber(opts.payeeSwishNumber) !== null;
}

/**
 * Builds the `swish://payment?data=<URI-encoded-JSON>` deep link.
 *
 * Throws if `payeeSwishNumber` is not a valid SE mobile number — callers
 * should gate with `isSwishEligible` first.
 *
 * Wire format reverse-engineered from the Swish iOS/Android handlers and
 * cross-checked against the swish-easy reference (the only working open
 * implementation I've found) plus several live donation pages
 * (Filmstund, fluxer, biketoured/italy26). Strict-payload invariants
 * Swish enforces — any violation surfaces as the generic "Felaktig
 * länk" / "Incorrect link" error in the Swish app:
 *
 *   - Encoding is `encodeURIComponent(JSON.stringify(payload))`. Base64
 *     is rejected outright.
 *   - `payee.value` is E.164 (`+46...`) or national (`07...`). Both work.
 *   - `amount.value` MUST be an **integer** number of kronor. The
 *     consumer parser rejects decimals (226.82 → fail). The merchant
 *     HTTP API accepts decimal strings, but the deep-link parser is
 *     strict integer-only. Round at build time; the caller decides
 *     whether to use Math.round / Math.ceil / Math.floor for the öre.
 *   - `message.value` is restricted to `[a-zA-ZåäöÅÄÖ0-9:;.,?!()" ]`
 *     (max 50 chars). `·`, `-`, `*`, emoji, etc. all trigger
 *     "Felaktig länk". We sanitize at build time.
 *   - **Unknown top-level keys are rejected.** No `callbackurl` (that's
 *     a merchant-URL query param, not a consumer JSON field).
 *   - `editable` keys are omitted unless true.
 *
 * `pendingId` is accepted for caller-side correlation but is not
 * round-tripped through the link (Swish gives us no payment-status
 * callback — see docs/swish-integration.md §3.0.1). Kept in the
 * signature so call-sites don't have to change.
 */
export function buildSwishLink(opts: {
  payeeSwishNumber: string;
  amountMinor: number;
  currency: 'SEK';
  groupName: string;
  pendingId: string;
}): string {
  const canonical = normalizeSwishNumber(opts.payeeSwishNumber);
  if (!canonical) {
    throw new Error(`buildSwishLink: invalid Swish number "${opts.payeeSwishNumber}"`);
  }

  // Swish's consumer deep-link parser wants **national format**
  // (`0XXXXXXXXX`), not E.164. The swish-easy reference (2018) sends
  // E.164 and worked at the time, but the current Swish iOS/Android
  // apps reject `+46…` with "the link used to open the app has an
  // incorrect format" — even though they accept the same number in
  // E.164 when you type it manually. The live italy26 donation page
  // (https://github.com/biketoured/italy26/blob/main/donate.html)
  // ships `0725532011` and currently works.
  const national = '0' + canonical.slice(3);

  const payload = {
    version: 1,
    payee: { value: national },
    // Round up so the payee is never short — better to over-pay by <1 kr
    // than to under-pay (which would leave a tiny residual debt and force
    // a follow-up settlement). Caller-side display should match.
    amount: { value: Math.ceil(opts.amountMinor / 100) },
    message: { value: buildMessage(opts.groupName) },
  };

  return `swish://payment?data=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Rounds a minor-unit amount the same way `buildSwishLink` does, so
 *  the UI can show the rounded amount the user is about to send (and
 *  any settlement record can match). */
export function swishRoundedKronor(amountMinor: number): number {
  return Math.ceil(amountMinor / 100);
}

/**
 * Human-readable representation of the same details, used by the
 * "Copy Swish details" fallback on web and when the Swish app isn't
 * installed.
 */
export function formatSwishDetails(opts: {
  payeeSwishNumber: string;
  amountMinor: number;
  currency: 'SEK';
  groupName: string;
}): { phone: string; amount: string; message: string } {
  const canonical = normalizeSwishNumber(opts.payeeSwishNumber);
  if (!canonical) {
    throw new Error(
      `formatSwishDetails: invalid Swish number "${opts.payeeSwishNumber}"`,
    );
  }
  return {
    phone: formatNationalForDisplay(toNationalFormat(canonical)),
    amount: `${formatMinorAsDecimal(opts.amountMinor)} ${opts.currency}`,
    message: buildMessage(opts.groupName),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** "+46701234567" → "0701234567" */
function toNationalFormat(canonical: string): string {
  return '0' + canonical.slice(3);
}

/** "0701234567" → "070 123 45 67" */
function formatNationalForDisplay(national: string): string {
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
}

/** `24000` → `"240.00"`. Pure integer math; never touch floats for money. */
function formatMinorAsDecimal(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  const body = `${major}.${cents.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/** Builds the Swish payment message: `"Chara: <sanitized group name>"`,
 *  with any disallowed characters (anything outside Swish's permitted set
 *  `[a-zA-ZåäöÅÄÖ0-9:;.,?!()" ]`) replaced with a space, collapsed runs
 *  of spaces, and truncated to Swish's 50-character limit. */
function buildMessage(groupName: string): string {
  const sanitized = groupName
    .replace(ALLOWED_MESSAGE_CHARS, ' ')
    .replace(/ +/g, ' ')
    .trim();
  const full = MESSAGE_PREFIX + sanitized;
  return full.length > MAX_MESSAGE_LEN ? full.slice(0, MAX_MESSAGE_LEN) : full;
}
