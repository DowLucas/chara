import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { MigrationStorage } from './migrate-legacy-auth';

// Web has no keychain equivalent, so the accounts blob — access token plus a
// year-long refresh token — lands in `localStorage`, readable by any script
// running on the origin. That makes an XSS on the web build a full account
// takeover, not just a session hijack, and nothing here can prevent it:
// sessionStorage has the same exposure, and an httpOnly cookie would need
// backend support the API doesn't have.
//
// The mitigation is to keep foreign script out of the origin in the first
// place — see the Content-Security-Policy in `app/+html.tsx`. Anything added
// to the web build that loads third-party script (an analytics snippet, a
// widget, a CDN font loader) widens this hole and needs the CSP loosened to
// allow it, which is the moment to reconsider.
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
