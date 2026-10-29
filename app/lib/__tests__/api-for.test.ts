/**
 * `apiFor(serverUrl)` must return the same object for the same server.
 *
 * Screens do `const api = apiFor(serverUrl)` in the render body and list
 * `api` in a `useCallback` dependency array. A fresh object per call made the
 * callback change on every render, so `useEffect(() => load(), [load])`
 * re-ran after each `setState` — an endless fetch/render loop ("Maximum
 * update depth exceeded" on group settings).
 */
// Importing api.ts pulls in native modules; mock them (mirrors api-error-message.test).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {}, manifest: {} },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

import { apiFor } from '../api';

describe('apiFor', () => {
  it('returns the same object for the same server, so it is a stable hook dependency', () => {
    expect(apiFor('https://a.example.com')).toBe(apiFor('https://a.example.com'));
  });

  it('returns a separate object per server', () => {
    expect(apiFor('https://a.example.com')).not.toBe(apiFor('https://b.example.com'));
  });
});
