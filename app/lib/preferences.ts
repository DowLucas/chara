import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { sha256 } from 'js-sha256';
import { isValidSecurityCode, normalizeSecurityCode } from './security-code';

const KEY_PIN = 'chara.securityCode';
const KEY_FACE_ID = 'chara.confirmWithFaceId';
const KEY_LANGUAGE = 'chara.language';
const KEY_SWISH_PHONE_PROMPT_DISMISSED = 'chara.swishPhonePromptDismissed';

// PBKDF2-lite: SHA-256 rounds over salt||PIN, to slow brute force against the
// disclosed-keychain case. Device unlock + the hardware Keychain/Keystore are
// the real defense; against an attacker who has the stored blob, a 4-6 digit
// numeric PIN (keyspace 10^4-10^6) falls in seconds on a GPU regardless of the
// round count, so the stretching is defense-in-depth only. We therefore keep
// it cheap enough to stay snappy on the device JS engine (Hermes), where each
// round costs far more than on V8.
//
// The round count lives *in* the stored blob (v2), so it can be retuned later
// without a new format version. v1 blobs predate that and use a fixed 100k.
const PIN_HASH_ITERATIONS = 25_000;
const PIN_HASH_ITERATIONS_V1 = 100_000;
const PIN_SALT_BYTES = 16;
const PIN_STORED_VERSION = 2;

interface StoredPinV1 {
  v: 1;
  salt: string; // base64
  hash: string; // hex
}

interface StoredPinV2 {
  v: 2;
  salt: string; // base64
  iters: number;
  hash: string; // hex
}

function isStoredPinV1(v: unknown): v is StoredPinV1 {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { v?: unknown }).v === 1 &&
    typeof (v as { salt?: unknown }).salt === 'string' &&
    typeof (v as { hash?: unknown }).hash === 'string'
  );
}

function isStoredPinV2(v: unknown): v is StoredPinV2 {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { v?: unknown }).v === 2 &&
    typeof (v as { salt?: unknown }).salt === 'string' &&
    typeof (v as { iters?: unknown }).iters === 'number' &&
    typeof (v as { hash?: unknown }).hash === 'string'
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  // Avoid relying on global Buffer (RN Hermes has it, but jsdom in tests doesn't always).
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa exists in RN's JS engine and in node 18+.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (typeof g.btoa === 'function') return g.btoa(bin);
  // Fallback: Buffer in node.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return Buffer.from(bytes).toString('base64');
}

// Iterated SHA-256 done in-JS rather than via `expo-crypto`
// `digestStringAsync` round-trips — each of those crosses the native bridge,
// so tens of thousands serially took seconds. `js-sha256` is standard SHA-256
// over the UTF-8 bytes of the input, producing the exact same hex digest as
// expo-crypto (input here is pure ASCII `salt:pin`), so any hash previously
// written by the expo-crypto path still verifies. Hex-string chaining is the
// fastest shape for this lib (byte-array chaining benchmarks slower).
function hashPin(pin: string, salt: string, iters: number): string {
  let current = `${salt}:${pin}`;
  for (let i = 0; i < iters; i++) {
    current = sha256(current);
  }
  return current;
}

async function generateSaltB64(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(PIN_SALT_BYTES);
  return bytesToBase64(bytes);
}

async function persistHashedPin(pin: string): Promise<void> {
  const salt = await generateSaltB64();
  const iters = PIN_HASH_ITERATIONS;
  const hash = hashPin(pin, salt, iters);
  const payload: StoredPinV2 = { v: PIN_STORED_VERSION, salt, iters, hash };
  await SecureStore.setItemAsync(KEY_PIN, JSON.stringify(payload), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: false,
  });
}

/** True if `a` and `b` are equal — constant-time over equal-length inputs.
 *  Mostly defense-in-depth; the comparison is gated behind device unlock. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** @deprecated for external use — no longer returns the raw PIN. Returns
 *  the opaque stored blob if one exists. Kept for `hasSecurityCode()`. */
export async function getSecurityCode(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PIN);
}

export async function hasSecurityCode(): Promise<boolean> {
  const code = await SecureStore.getItemAsync(KEY_PIN);
  return !!code;
}

export async function setSecurityCode(code: string): Promise<void> {
  const normalized = normalizeSecurityCode(code);
  if (!isValidSecurityCode(normalized)) {
    throw new Error('Invalid security code');
  }
  await persistHashedPin(normalized);
}

export async function clearSecurityCode(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PIN);
}

export async function verifySecurityCode(input: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(KEY_PIN);
  if (!stored) return false;
  const normalized = normalizeSecurityCode(input);

  // Try the hashed formats first.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stored);
  } catch {
    /* not JSON — treat as legacy plaintext */
  }
  if (isStoredPinV2(parsed)) {
    const candidate = hashPin(normalized, parsed.salt, parsed.iters);
    return constantTimeEqual(candidate, parsed.hash);
  }
  if (isStoredPinV1(parsed)) {
    // v1 used a fixed 100k rounds. Verify against that, then transparently
    // re-hash to the current (v2) format so the next unlock is fast.
    const candidate = hashPin(normalized, parsed.salt, PIN_HASH_ITERATIONS_V1);
    if (!constantTimeEqual(candidate, parsed.hash)) return false;
    try {
      await persistHashedPin(normalized);
    } catch {
      /* upgrade is best-effort; v1 entry stays valid if it fails */
    }
    return true;
  }

  // Legacy plaintext path (pre-hash migration). Accept once, then upgrade.
  if (!constantTimeEqual(normalized, stored)) return false;
  try {
    await persistHashedPin(normalized);
  } catch {
    /* if upgrade fails, leave the legacy entry; user can still log in */
  }
  return true;
}

export async function getConfirmWithFaceId(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_FACE_ID);
  return v === '1';
}

export async function setConfirmWithFaceId(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_FACE_ID, enabled ? '1' : '0');
}

/** Returns the user's explicitly-picked language code, or null if they're
 *  on auto-detect (the default — i18n.ts falls back to the device locale). */
export async function getPreferredLanguage(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_LANGUAGE);
}

export async function setPreferredLanguage(code: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_LANGUAGE, code);
}

export async function clearPreferredLanguage(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_LANGUAGE);
}

/** True once the user has dismissed the one-time "add your Swish number"
 *  nudge shown on the settle screen (so we don't ask again). */
export async function getSwishPhonePromptDismissed(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_SWISH_PHONE_PROMPT_DISMISSED)) === '1';
}

export async function setSwishPhonePromptDismissed(): Promise<void> {
  await SecureStore.setItemAsync(KEY_SWISH_PHONE_PROMPT_DISMISSED, '1');
}
