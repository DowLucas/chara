// Importing api.ts pulls in native modules; mock them (mirrors request-on.test).
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

// React Native's `__DEV__` global isn't defined in node; api.ts reads it.
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

import { apiErrorMessage } from '../api';

describe('apiErrorMessage', () => {
  it('surfaces the backend {"error": ...} envelope, not the raw JSON body', () => {
    const raw = '{"error":"equal split values must be 0"}';
    expect(apiErrorMessage({ error: 'equal split values must be 0' }, raw)).toBe(
      'equal split values must be 0',
    );
  });

  it('trims the extracted error message', () => {
    expect(apiErrorMessage({ error: '  title is required  ' }, '')).toBe('title is required');
  });

  it('passes through a short non-JSON body (e.g. a plain-text proxy 502)', () => {
    expect(apiErrorMessage(null, 'Bad Gateway')).toBe('Bad Gateway');
  });

  it('never surfaces a raw JSON blob when the body has no error field', () => {
    const raw = '{"unexpected":"shape","lots":"of detail here"}';
    const msg = apiErrorMessage({ unexpected: 'shape', lots: 'of detail here' }, raw);
    expect(msg.startsWith('{')).toBe(false);
    expect(msg).not.toContain('unexpected');
  });

  it('falls back to a friendly generic for an oversized/unparseable body', () => {
    const huge = '{' + 'x'.repeat(500) + '}';
    const msg = apiErrorMessage(null, huge);
    expect(msg.startsWith('{')).toBe(false);
    expect(msg.length).toBeLessThan(200);
  });
});
