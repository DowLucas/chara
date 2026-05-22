/**
 * Expo push token acquisition + per-account registration fan-out.
 *
 * Spec §15. One device, one Expo push token. Every server-account this
 * device is signed into needs to register that token, and re-register
 * when the OS rotates it. Per-account registration failures are
 * silently retried on the next app foreground transition until they
 * succeed — a failed rotation registration means that server stops
 * pushing to this device until the next rotation (possibly weeks),
 * which is unacceptable.
 *
 * No user-visible status; the silent retry is the entire recovery
 * mechanism.
 *
 * Module-level (non-React) state lives here so it can be subscribed to
 * the accounts-store directly without a React context. The driver is
 * mounted from `app/app/_layout.tsx`:
 *
 *   - `bootstrapPush()`  — once, alongside `runRecoveryProbes()`.
 *   - `retryPendingRegistrations()` — from the AppState `'active'`
 *     listener, throttled to REFRESH_FLOOR_MS.
 *
 * Imperative single-account hooks for hot paths:
 *
 *   - `registerForAccount(serverUrl)` — call after a successful
 *     `addAccount(...)` so the new account doesn't wait for the next
 *     bootstrap.
 *   - `unregisterForAccount(serverUrl)` — call before
 *     `removeAccount(serverUrl)` so the server stops pushing to this
 *     device.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { snapshot, subscribe } from './accounts-store';
import { apiFor as defaultApiFor } from './api';
import { REFRESH_FLOOR_MS } from './aggregated-reads-internal';

export interface PushDeviceInfo {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

// --- injectable deps (test seam) -----------------------------------------
//
// The default driver wires straight to expo-notifications / expo-device /
// the real `apiFor`. Tests inject thin shims so they can assert without
// pulling in the native modules.

export interface PushDeps {
  /** Returns the device's Expo push token, or `null` if unavailable. */
  getOrAcquireToken: () => Promise<string | null>;
  /** The platform tag sent to the server. */
  platform: 'ios' | 'android' | 'web';
  /** Per-server API factory (defaults to the real `apiFor`). */
  apiFor: (serverUrl: string) => {
    registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') => Promise<void>;
    deletePushToken: (token: string) => Promise<void>;
  };
  /** Subscribe to push token rotation events. Returns an unsubscribe fn. */
  onTokenRotation: (handler: (token: string) => void) => () => void;
}

// --- module state --------------------------------------------------------

let currentToken: string | null = null;
const registered = new Set<string>();
const failed = new Set<string>();
let lastRetryAt = 0;
let permissionDenied = false;
let accountsUnsub: (() => void) | null = null;
let rotationUnsub: (() => void) | null = null;
let bootstrapped = false;

let activeDeps: PushDeps | null = null;

// --- default deps --------------------------------------------------------

function getPlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

async function defaultGetOrAcquireToken(): Promise<string | null> {
  // Web: Expo Push doesn't ship a token on web; skip silently.
  if (Platform.OS === 'web') return null;

  // Simulator / non-physical device: Expo push tokens require a real device.
  if (!Device.isDevice) return null;

  // Re-use a cached token if we've already acquired one this session.
  if (currentToken) return currentToken;

  // Permission flow: check first, request once if undetermined, never
  // re-request after a hard deny.
  if (permissionDenied) return null;
  let perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) {
    if (perms.canAskAgain === false) {
      permissionDenied = true;
      return null;
    }
    perms = await Notifications.requestPermissionsAsync();
    if (!perms.granted) {
      permissionDenied = true;
      return null;
    }
  }

  // Resolve the EAS projectId. Without one, `getExpoPushTokenAsync` throws
  // in SDK ≥49. Skip the call entirely (silently) when no projectId is
  // configured — push won't work without it anyway, and warning every cold
  // launch is noise for projects that haven't run `eas init` yet.
  const projectId =
    (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas
      ?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
    null;
  if (!projectId) return null;

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return result.data;
  } catch (e) {
    console.warn('[chara] expo push token acquisition failed', e);
    return null;
  }
}

const defaultDeps: PushDeps = {
  getOrAcquireToken: defaultGetOrAcquireToken,
  platform: getPlatform(),
  apiFor: (serverUrl) => defaultApiFor(serverUrl),
  onTokenRotation: (handler) => {
    const sub = Notifications.addPushTokenListener((evt) => {
      handler(evt.data);
    });
    return () => sub.remove();
  },
};

// --- reconciliation ------------------------------------------------------

async function reconcile(deps: PushDeps): Promise<void> {
  if (!currentToken) return;
  const accounts = snapshot().accounts;
  await Promise.allSettled(
    accounts.map((a) => {
      if (registered.has(a.serverUrl)) return Promise.resolve();
      if (failed.has(a.serverUrl)) return Promise.resolve();
      return registerInternal(a.serverUrl, deps);
    }),
  );
}

async function registerInternal(serverUrl: string, deps: PushDeps): Promise<void> {
  if (!currentToken) return;
  try {
    await deps.apiFor(serverUrl).registerPushToken(currentToken, deps.platform);
    registered.add(serverUrl);
    failed.delete(serverUrl);
  } catch {
    failed.add(serverUrl);
  }
}

// --- public surface ------------------------------------------------------

/**
 * One-time bootstrap. Idempotent. Safe to call from `useEffect` in the
 * root layout. Acquires (or restores from in-memory cache) the device's
 * Expo push token, subscribes to the accounts store, and fans-out
 * registration to every account that isn't already known to have this
 * token registered.
 */
export async function bootstrapPush(deps: PushDeps = defaultDeps): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  activeDeps = deps;

  const token = await deps.getOrAcquireToken();
  if (token) {
    currentToken = token;
  }

  // Subscribe to token rotation regardless of whether we have a token yet:
  // permission could be granted out-of-band later and the OS could issue
  // a token in response.
  rotationUnsub = deps.onTokenRotation((newToken) => {
    currentToken = newToken;
    // Every server's old token is now stale.
    registered.clear();
    failed.clear();
    void reconcile(activeDeps ?? deps);
  });

  // Subscribe to accounts so newly-added accounts get caught.
  accountsUnsub = subscribe(() => {
    void reconcile(activeDeps ?? deps);
  });

  // Initial pass so existing linked accounts get registered.
  await reconcile(deps);
}

/**
 * Imperative single-account hook. Call this after a successful
 * `addAccount(...)` so the new account doesn't have to wait for the
 * accounts-store subscription to fire (which it will too, but the
 * imperative call resolves a tighter latency on the hot path).
 */
export async function registerForAccount(serverUrl: string): Promise<void> {
  const deps = activeDeps ?? defaultDeps;
  if (!currentToken) {
    // Maybe we haven't bootstrapped yet (e.g., the user signed in before
    // the root effect ran). Try to acquire opportunistically.
    const token = await deps.getOrAcquireToken();
    if (!token) return;
    currentToken = token;
  }
  await registerInternal(serverUrl, deps);
}

/**
 * Imperative single-account hook. Call this BEFORE `removeAccount(...)`
 * so the server stops pushing to this device. Best-effort: errors are
 * swallowed.
 */
export async function unregisterForAccount(serverUrl: string): Promise<void> {
  const deps = activeDeps ?? defaultDeps;
  if (!currentToken) {
    registered.delete(serverUrl);
    failed.delete(serverUrl);
    return;
  }
  try {
    await deps.apiFor(serverUrl).deletePushToken(currentToken);
  } catch {
    /* best-effort */
  }
  registered.delete(serverUrl);
  failed.delete(serverUrl);
}

/**
 * Retry every account whose last registration attempt failed. Throttled
 * to REFRESH_FLOOR_MS so a flappy AppState listener can't hammer the
 * servers. Called from the AppState `'active'` listener in
 * `app/app/_layout.tsx`.
 */
export async function retryPendingRegistrations(): Promise<void> {
  if (Date.now() - lastRetryAt < REFRESH_FLOOR_MS) return;
  lastRetryAt = Date.now();

  const deps = activeDeps ?? defaultDeps;
  if (!currentToken) return;

  const accountUrls = new Set(snapshot().accounts.map((a) => a.serverUrl));
  // Snapshot failed set so we don't mutate while iterating.
  const targets = Array.from(failed).filter((url) => accountUrls.has(url));
  await Promise.allSettled(targets.map((url) => registerInternal(url, deps)));
}

// --- test helpers --------------------------------------------------------

/** Test-only: reset module state. */
export function __resetForTests(): void {
  currentToken = null;
  registered.clear();
  failed.clear();
  lastRetryAt = 0;
  permissionDenied = false;
  bootstrapped = false;
  activeDeps = null;
  if (accountsUnsub) accountsUnsub();
  accountsUnsub = null;
  if (rotationUnsub) rotationUnsub();
  rotationUnsub = null;
}

/** Test-only: peek at internal sets. */
export function __getInternalsForTests(): {
  token: string | null;
  registered: string[];
  failed: string[];
  lastRetryAt: number;
} {
  return {
    token: currentToken,
    registered: Array.from(registered),
    failed: Array.from(failed),
    lastRetryAt,
  };
}
