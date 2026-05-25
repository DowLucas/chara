/**
 * Security-code (PIN) storage must hash + salt before persisting; the
 * raw PIN must never sit at rest. Legacy plaintext entries (from before
 * this change) are accepted on first verify, then transparently re-hashed.
 */

const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

// Deterministic crypto: digest is a stable function of the input string,
// random bytes are a fixed buffer so the salt is predictable per test.
jest.mock('expo-crypto', () => {
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    digestStringAsync: async (_alg: string, input: string) => {
      let h = 0xdeadbeef;
      for (let i = 0; i < input.length; i++) {
        h = ((h * 33) ^ input.charCodeAt(i)) | 0;
      }
      return Math.abs(h).toString(16).padStart(64, '0');
    },
    getRandomBytesAsync: async (n: number) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = (i * 7 + 13) & 0xff;
      return out;
    },
  };
});

import {
  clearSecurityCode,
  hasSecurityCode,
  setSecurityCode,
  verifySecurityCode,
} from '../preferences';

const KEY_PIN = 'chara.securityCode';

beforeEach(() => {
  store.clear();
});

describe('preferences security code', () => {
  it('does not store the raw PIN', async () => {
    await setSecurityCode('1234');
    const stored = store.get(KEY_PIN);
    expect(stored).toBeDefined();
    expect(stored).not.toBe('1234');
    // Stored form is JSON with salt + hash; the bare PIN must not appear.
    expect(stored!.includes('1234')).toBe(false);
  });

  it('verifies the correct PIN and rejects a wrong one', async () => {
    await setSecurityCode('123456');
    expect(await verifySecurityCode('123456')).toBe(true);
    expect(await verifySecurityCode('000000')).toBe(false);
    expect(await verifySecurityCode('1234')).toBe(false);
  });

  it('hasSecurityCode reflects state', async () => {
    expect(await hasSecurityCode()).toBe(false);
    await setSecurityCode('4321');
    expect(await hasSecurityCode()).toBe(true);
    await clearSecurityCode();
    expect(await hasSecurityCode()).toBe(false);
  });

  it('rejects invalid PIN inputs', async () => {
    await expect(setSecurityCode('12')).rejects.toThrow();
    await expect(setSecurityCode('abcd')).rejects.toThrow();
  });

  it('accepts a legacy plaintext value once, then re-hashes it', async () => {
    // Simulate a pre-migration plaintext entry.
    store.set(KEY_PIN, '5678');

    // Wrong PIN still fails.
    expect(await verifySecurityCode('0000')).toBe(false);
    // Stored value should still be the legacy plaintext at this point
    // (failed verify doesn't trigger re-hash).
    expect(store.get(KEY_PIN)).toBe('5678');

    // Correct PIN succeeds against the legacy plaintext.
    expect(await verifySecurityCode('5678')).toBe(true);

    // After a successful legacy verify, the stored form is upgraded.
    const upgraded = store.get(KEY_PIN);
    expect(upgraded).toBeDefined();
    expect(upgraded).not.toBe('5678');
    // The upgraded form should still verify with the same PIN.
    expect(await verifySecurityCode('5678')).toBe(true);
  });
});
