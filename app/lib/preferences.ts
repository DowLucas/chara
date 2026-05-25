import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { isValidSecurityCode, normalizeSecurityCode } from './security-code';

const KEY_PIN = 'chara.securityCode';
const KEY_FACE_ID = 'chara.confirmWithFaceId';
const KEY_LANGUAGE = 'chara.language';

// PBKDF2-lite: many SHA-256 rounds over salt||PIN, slows brute force
// against the disclosed-keychain case (device unlock is the first line of
// defense; the iteration count is the second).
const PIN_HASH_ITERATIONS = 100_000;
const PIN_SALT_BYTES = 16;
const PIN_STORED_VERSION = 1;

interface StoredPinV1 {
  v: 1;
  salt: string; // base64
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

async function hashPin(pin: string, salt: string): Promise<string> {
  let current = `${salt}:${pin}`;
  for (let i = 0; i < PIN_HASH_ITERATIONS; i++) {
    current = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      current,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  }
  return current;
}

async function generateSaltB64(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(PIN_SALT_BYTES);
  return bytesToBase64(bytes);
}

async function persistHashedPin(pin: string): Promise<void> {
  const salt = await generateSaltB64();
  const hash = await hashPin(pin, salt);
  const payload: StoredPinV1 = { v: PIN_STORED_VERSION, salt, hash };
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

  // Try v1 (hashed) format first.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(stored);
  } catch {
    /* not JSON — treat as legacy plaintext */
  }
  if (isStoredPinV1(parsed)) {
    const candidate = await hashPin(normalized, parsed.salt);
    return constantTimeEqual(candidate, parsed.hash);
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
