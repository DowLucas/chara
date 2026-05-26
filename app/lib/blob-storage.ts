import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { MigrationStorage } from './migrate-legacy-auth';

const webStorage: MigrationStorage = {
  async getItem(key) {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async deleteItem(key) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  },
};

// Auth tokens / the accounts blob must not be backed up to iCloud or
// restorable to a different device. WHEN_UNLOCKED_THIS_DEVICE_ONLY scopes
// the keychain item to this physical device and requires the device to be
// unlocked at read time. iOS-only option; expo-secure-store ignores it on
// Android (Keystore is already device-bound) and the web path uses
// localStorage instead.
const nativeStorage: MigrationStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

export const blobStorage: MigrationStorage =
  Platform.OS === 'web' ? webStorage : nativeStorage;
