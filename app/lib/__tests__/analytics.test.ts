/**
 * Tests for the analytics wrapper (spec: 2026-05-23-posthog-onboarding-analytics-design.md).
 *
 * The PostHog SDK is mocked — we assert on calls into the mock rather than
 * any network behaviour. The wrapper is responsible for:
 *  - No-op when POSTHOG_API_KEY is missing
 *  - No-op when the user has opted out
 *  - Buffering events fired before init() resolves
 *  - Anon-id generated once on first launch and stable thereafter
 *  - identify() called exactly once per install, hashing serverUrl+userId
 */

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

// --- mock surface ---------------------------------------------------------

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockRegister = jest.fn(async () => {});
const mockOptIn = jest.fn(async () => {});
const mockOptOut = jest.fn(async () => {});
const ctorCalls: Array<{ apiKey: string; options: Record<string, unknown> }> = [];

class FakePostHog {
  constructor(apiKey: string, options: Record<string, unknown>) {
    ctorCalls.push({ apiKey, options });
  }
  capture = mockCapture;
  identify = mockIdentify;
  register = mockRegister;
  optIn = mockOptIn;
  optOut = mockOptOut;
}

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: FakePostHog,
  PostHog: FakePostHog,
}));

// SecureStore — in-memory.
const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

// expo-crypto — deterministic SHA-256-ish for tests.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: async (_alg: string, input: string) => {
    // Stable deterministic "hash" — not real sha256 but is enough to assert
    // we got a 32+ char hex-ish string derived from the input.
    let h = 0;
    for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
    return ('deadbeefcafebabefeedface' + Math.abs(h).toString(16)).padEnd(64, '0');
  },
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));

// expo-constants — drives whether a key is present.
let expoExtra: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: expoExtra, version: '1.0.0' };
    },
  },
}));

// react-native Platform.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// i18n locale.
jest.mock('../i18n', () => ({
  currentLocale: () => 'en-US',
}));

// protocol.
jest.mock('../protocol', () => ({
  APP_PROTOCOL_VERSION: 1,
}));

import * as analytics from '../analytics';

function resetAll() {
  store.clear();
  ctorCalls.length = 0;
  mockCapture.mockReset();
  mockIdentify.mockReset();
  mockRegister.mockReset();
  mockOptIn.mockReset();
  mockOptOut.mockReset();
  expoExtra = {};
  analytics.__resetForTests();
}

beforeEach(() => {
  resetAll();
});

describe('analytics wrapper', () => {
  test('init() is a no-op when POSTHOG_API_KEY is missing', async () => {
    expoExtra = { posthogApiKey: null, posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();

    analytics.track('app_opened', { is_first_launch: true });

    expect(ctorCalls).toHaveLength(0);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('init() instantiates PostHog with strict config when key present', async () => {
    expoExtra = {
      posthogApiKey: 'phc_test',
      posthogHost: 'https://eu.i.posthog.com',
    };
    await analytics.init();

    expect(ctorCalls).toHaveLength(1);
    expect(ctorCalls[0].apiKey).toBe('phc_test');
    expect(ctorCalls[0].options).toMatchObject({
      host: 'https://eu.i.posthog.com',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableGeoip: true,
      defaultOptIn: true,
    });
  });

  test('events fired before init resolves are buffered and flushed in order', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };

    // Fire events before awaiting init.
    const initPromise = analytics.init();
    analytics.track('app_opened', { is_first_launch: true });
    analytics.track('auth_screen_seen', { entry: 'first_launch' });
    await initPromise;
    // Allow any microtask flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockCapture).toHaveBeenCalledTimes(2);
    expect(mockCapture.mock.calls[0][0]).toBe('app_opened');
    expect(mockCapture.mock.calls[1][0]).toBe('auth_screen_seen');
  });

  test('track() after init forwards directly to PostHog.capture', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();
    analytics.track('onboarding_seen');

    expect(mockCapture).toHaveBeenCalledWith('onboarding_seen', expect.any(Object));
  });

  test('opt-out short-circuits track() and propagates to SDK', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();

    await analytics.setOptedOut(true);
    analytics.track('onboarding_seen');

    expect(mockOptOut).toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('opt-out persists across init() calls', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();
    await analytics.setOptedOut(true);

    // Re-init (simulating cold-launch).
    analytics.__resetForTests();
    await analytics.init();

    expect(await analytics.isOptedOut()).toBe(true);
    analytics.track('onboarding_seen');
    expect(mockCapture).not.toHaveBeenCalled();
  });

  test('anon-id is generated on first launch and stable on re-init', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();
    const first = store.get('analytics_anon_id');
    expect(first).toBeTruthy();

    analytics.__resetForTests();
    await analytics.init();
    expect(store.get('analytics_anon_id')).toBe(first);
  });

  test('identify() hashes serverUrl+userId and is idempotent per install', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();

    await analytics.identify('user-123', 'https://chara.app');
    expect(mockIdentify).toHaveBeenCalledTimes(1);
    const distinctId = mockIdentify.mock.calls[0][0];
    expect(typeof distinctId).toBe('string');
    expect(distinctId).not.toContain('chara.app');
    expect(distinctId).not.toContain('user-123');
    expect(distinctId.length).toBe(32);

    // Second call (e.g. user adds a second account) — no-op.
    await analytics.identify('user-456', 'https://other.example.com');
    expect(mockIdentify).toHaveBeenCalledTimes(1);

    // Persisted across re-init.
    analytics.__resetForTests();
    await analytics.init();
    await analytics.identify('user-789', 'https://yet-another.example.com');
    expect(mockIdentify).toHaveBeenCalledTimes(1);
  });

  test('register sets super-properties after init', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();

    expect(mockRegister).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (mockRegister.mock.calls as any[])[0][0];
    expect(props).toMatchObject({
      app_version: '1.0.0',
      app_protocol: 1,
      platform: 'ios',
      locale: 'en-US',
    });
  });

  test('SDK errors do not propagate from track()', async () => {
    expoExtra = { posthogApiKey: 'phc_test', posthogHost: 'https://eu.i.posthog.com' };
    await analytics.init();

    mockCapture.mockImplementationOnce(() => {
      throw new Error('SDK exploded');
    });

    expect(() => analytics.track('onboarding_seen')).not.toThrow();
  });
});
