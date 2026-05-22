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

const nativeStorage: MigrationStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

export const blobStorage: MigrationStorage =
  Platform.OS === 'web' ? webStorage : nativeStorage;
