/**
 * `avatarImageSource` must never attach the user's bearer token to an
 * absolute URL — a malicious or untrusted server could return an
 * attacker-controlled `avatar_object_url` and exfiltrate the JWT via the
 * Authorization header.
 *
 * Contract:
 *   - server-relative path (`/avatars/x.jpg`)  → `{ uri, headers: { Authorization } }`
 *   - absolute http(s) URL in `avatar_object_url` → `null` (do NOT attach token)
 *   - oauth `avatar_url` (provider-served, no auth needed) → unaffected
 */

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

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

import { avatarImageSource } from '../api';

describe('avatarImageSource', () => {
  const TOKEN = 'jwt.secret.value';

  it('attaches Authorization for a server-relative avatar_object_url', () => {
    const src = avatarImageSource(
      { avatar_object_url: '/api/avatars/u1.jpg', avatar_updated_at: '2026-05-25T00:00:00Z' },
      TOKEN,
    );
    expect(src).not.toBeNull();
    expect(src!.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(src!.uri).toContain('/api/avatars/u1.jpg');
  });

  it('returns null for an absolute http(s) avatar_object_url — never leaks the token', () => {
    const src = avatarImageSource(
      { avatar_object_url: 'https://attacker.example.com/steal.jpg' },
      TOKEN,
    );
    expect(src).toBeNull();
  });

  it('returns null for an absolute http avatar_object_url too', () => {
    const src = avatarImageSource(
      { avatar_object_url: 'http://attacker.example.com/steal.jpg' },
      TOKEN,
    );
    expect(src).toBeNull();
  });

  it('returns an un-authenticated source for the OAuth avatar_url fallback', () => {
    const src = avatarImageSource(
      { avatar_url: 'https://lh3.googleusercontent.com/u/abc' },
      TOKEN,
    );
    expect(src).not.toBeNull();
    expect(src!.headers).toBeUndefined();
    expect(src!.uri).toBe('https://lh3.googleusercontent.com/u/abc');
  });

  it('returns null for empty input', () => {
    expect(avatarImageSource(null, TOKEN)).toBeNull();
    expect(avatarImageSource(undefined, TOKEN)).toBeNull();
    expect(avatarImageSource({}, TOKEN)).toBeNull();
  });

  it('does not crash when token is null on a server-relative path', () => {
    const src = avatarImageSource({ avatar_object_url: '/api/avatars/x.jpg' }, null);
    expect(src).not.toBeNull();
    expect(src!.headers).toBeUndefined();
  });
});
