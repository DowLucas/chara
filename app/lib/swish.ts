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

const MAX_GROUP_NAME_LEN = 40;
const MESSAGE_PREFIX = 'Quits · ';
const CALLBACK_URL_BASE = 'quits://settle/swish/return';

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
 * Builds the `swish://payment?data=<urlSafeBase64>` deep link.
 *
 * Throws if `payeeSwishNumber` is not a valid SE mobile number — callers
 * should gate with `isSwishEligible` first.
 *
 * See docs/swish-integration.md §3 for the JSON spec.
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

  const payload = {
    version: 1,
    payee: { value: toNationalFormat(canonical) },
    amount: { value: formatMinorAsDecimal(opts.amountMinor), editable: false },
    message: { value: buildMessage(opts.groupName), editable: false },
    callbackurl: `${CALLBACK_URL_BASE}?pendingId=${encodeURIComponent(opts.pendingId)}`,
  };

  const json = JSON.stringify(payload);
  const data = urlSafeBase64Encode(json);
  return `swish://payment?data=${data}`;
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

/** `"Quits · " + groupName` with the group portion truncated to 40 chars. */
function buildMessage(groupName: string): string {
  const truncated = groupName.length > MAX_GROUP_NAME_LEN
    ? groupName.slice(0, MAX_GROUP_NAME_LEN)
    : groupName;
  return MESSAGE_PREFIX + truncated;
}

/** URL-safe base64 (`+`→`-`, `/`→`_`, no padding). */
function urlSafeBase64Encode(input: string): string {
  // Use Buffer when available (Node, RN via polyfill); fall back to btoa.
  let b64: string;
  if (typeof Buffer !== 'undefined') {
    b64 = Buffer.from(input, 'utf8').toString('base64');
  } else if (typeof btoa !== 'undefined') {
    // btoa needs binary string; encode UTF-8 first.
    const bytes = new TextEncoder().encode(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    b64 = btoa(bin);
  } else {
    throw new Error('No base64 encoder available in this environment');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
