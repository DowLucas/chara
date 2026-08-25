/**
 * Minimal ULID generator.
 *
 * Pure except for `Date.now()` and the platform CSPRNG — no React, no
 * network. Used to mint client-side ids that double as idempotency keys:
 * a request whose response is lost can be retried with the same id and the
 * server returns the original record instead of writing a second one.
 *
 * Format (the spec the backend's `ulid.ParseStrict` enforces): 26 Crockford
 * base32 characters — 10 encoding a 48-bit millisecond timestamp, then 16
 * encoding 80 bits of randomness. The timestamp prefix means ids sort
 * lexicographically by creation time.
 */
import * as Crypto from 'expo-crypto';

/** Crockford base32 — no I, L, O or U, so ids can't be misread aloud. */
export const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TIME_CHARS = 10;
const RANDOM_BYTES = 10; // 80 bits → exactly 16 base32 chars.

export function newUlid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}

/** 48-bit millisecond timestamp → 10 chars, most-significant first.
 *  Stays exact: 2^48 is well inside JS's safe-integer range. */
function encodeTime(ms: number): string {
  let remaining = ms;
  const out = new Array<string>(TIME_CHARS);
  for (let i = TIME_CHARS - 1; i >= 0; i--) {
    out[i] = CROCKFORD32[remaining % 32];
    remaining = Math.floor(remaining / 32);
  }
  return out.join('');
}

/** 10 random bytes → 16 chars, read as a 5-bit-at-a-time bit stream.
 *  80 bits divides evenly into 5, so there is no padding to handle. */
function encodeRandom(): string {
  const bytes = Crypto.getRandomBytes(RANDOM_BYTES);
  let value = 0;
  let bits = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
