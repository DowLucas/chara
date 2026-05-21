// Tiny key/value persistence for non-sensitive flags. Mirrors the same
// web/native split as lib/api.ts so the API surface is platform-agnostic.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export async function getFlag(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setFlag(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function clearFlag(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}

export const FLAG_ONBOARDING_SKIPPED = 'onboarding_skipped';
