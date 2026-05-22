import * as SecureStore from 'expo-secure-store';
import { isValidSecurityCode, normalizeSecurityCode } from './security-code';

const KEY_PIN = 'chara.securityCode';
const KEY_FACE_ID = 'chara.confirmWithFaceId';

export async function getSecurityCode(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PIN);
}

export async function hasSecurityCode(): Promise<boolean> {
  const code = await getSecurityCode();
  return !!code;
}

export async function setSecurityCode(code: string): Promise<void> {
  const normalized = normalizeSecurityCode(code);
  if (!isValidSecurityCode(normalized)) {
    throw new Error('Invalid security code');
  }
  await SecureStore.setItemAsync(KEY_PIN, normalized);
}

export async function clearSecurityCode(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PIN);
}

export async function verifySecurityCode(input: string): Promise<boolean> {
  const stored = await getSecurityCode();
  if (!stored) return false;
  return normalizeSecurityCode(input) === stored;
}

export async function getConfirmWithFaceId(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(KEY_FACE_ID);
  return v === '1';
}

export async function setConfirmWithFaceId(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_FACE_ID, enabled ? '1' : '0');
}
