/**
 * PostHog analytics wrapper for the hosted Chara build.
 *
 * Spec: docs/superpowers/specs/2026-05-23-posthog-onboarding-analytics-design.md
 *
 * Contract:
 *  - `init()` is called once on app boot. It reads `POSTHOG_API_KEY` from
 *    Expo `extra`. Missing key → wrapper becomes a permanent no-op (this is
 *    how forks/self-builds end up sending nothing).
 *  - `track(event, properties?)` enqueues if called before `init()` resolves;
 *    otherwise forwards to `posthog.capture()`. Always wrapped in try/catch —
 *    analytics never breaks the app.
 *  - `identify(serverUserId, serverUrl)` is called once on the transition
 *    from 0 → 1 server accounts. The PostHog distinct_id is a 32-char
 *    truncated SHA-256 of `serverUrl|serverUserId`; server URLs never leave
 *    the device unhashed.
 *  - The opt-out toggle (Settings → Privacy) lives in SecureStore and
 *    survives cold launches.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import PostHog from 'posthog-react-native';

import { currentLocale } from './i18n';
import { APP_PROTOCOL_VERSION } from './protocol';

// ---------- event catalogue ----------

export type AnalyticsEvent =
  // funnel
  | 'app_opened'
  | 'auth_screen_seen'
  | 'auth_method_selected'
  | 'magic_link_requested'
  | 'auth_completed'
  | 'onboarding_seen'
  | 'onboarding_create_chosen'
  | 'onboarding_scan_chosen'
  | 'user_name_entered'
  | 'group_created'
  | 'qr_scanned'
  | 'group_joined'
  | 'onboarding_finished'
  // errors
  | 'auth_error'
  | 'discovery_error'
  | 'invite_invalid'
  | 'group_create_failed'
  | 'group_join_failed';

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

// ---------- internal state ----------

const ANON_ID_KEY = 'analytics_anon_id';
const OPTED_OUT_KEY = 'analytics_opted_out';
const IDENTIFIED_KEY = 'analytics_identified';
const QUEUE_MAX = 50;

interface QueuedEvent {
  event: AnalyticsEvent;
  properties: AnalyticsProperties;
}

let posthog: PostHog | null = null;
let initStarted = false;
let initDone = false;
let optedOut = false;
let identified = false;
let queue: QueuedEvent[] = [];

// ---------- helpers ----------

function readExtra(): { apiKey: string | null; host: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    posthogApiKey?: string | null;
    posthogHost?: string;
  };
  return {
    apiKey: extra.posthogApiKey ?? null,
    host: extra.posthogHost ?? 'https://eu.i.posthog.com',
  };
}

async function ensureAnonId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ANON_ID_KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await SecureStore.setItemAsync(ANON_ID_KEY, fresh);
  return fresh;
}

async function hashDistinctId(serverUrl: string, userId: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${serverUrl}|${userId}`,
  );
  return digest.slice(0, 32);
}

function stripUndefined(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function safeCapture(event: AnalyticsEvent, properties: AnalyticsProperties): void {
  if (!posthog) return;
  try {
    posthog.capture(event, stripUndefined(properties));
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] capture failed:', err);
    }
  }
}

function flushQueue(): void {
  if (!posthog || optedOut) {
    queue = [];
    return;
  }
  const pending = queue;
  queue = [];
  for (const { event, properties } of pending) {
    safeCapture(event, properties);
  }
}

// ---------- public API ----------

export async function init(): Promise<void> {
  if (initStarted) return;
  initStarted = true;

  try {
    const { apiKey, host } = readExtra();

    // Load persisted state regardless of whether the SDK will run, so that
    // isOptedOut() returns the right thing even in no-op mode.
    optedOut = (await SecureStore.getItemAsync(OPTED_OUT_KEY)) === '1';
    identified = (await SecureStore.getItemAsync(IDENTIFIED_KEY)) === '1';

    if (!apiKey) {
      // No key → permanent no-op. Don't construct the SDK.
      initDone = true;
      queue = [];
      return;
    }

    const distinctId = await ensureAnonId();

    posthog = new PostHog(apiKey, {
      host,
      // Lifecycle autocapture: Application Opened / Backgrounded / Became Active /
      // Installed / Updated. Cheap (~5 events/session) and gives session shape
      // for free.
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableGeoip: true,
      defaultOptIn: true,
      // Seed distinct_id from our anon UUID.
      customAppProperties: (props) => ({ ...props, $device_id: distinctId }),
    });

    // Super-properties on every event.
    await posthog.register({
      app_version: Constants.expoConfig?.version ?? 'unknown',
      app_protocol: APP_PROTOCOL_VERSION,
      platform: Platform.OS,
      locale: currentLocale(),
    });

    if (optedOut) {
      await posthog.optOut();
    }

    initDone = true;
    flushQueue();
  } catch (err) {
    // Any init failure → degrade to no-op for the session.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] init failed:', err);
    }
    posthog = null;
    initDone = true;
    queue = [];
  }
}

export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}): void {
  if (optedOut) return;
  if (!initDone) {
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ event, properties });
    return;
  }
  safeCapture(event, properties);
}

export async function identify(serverUserId: string, serverUrl: string): Promise<void> {
  if (optedOut || identified) return;
  try {
    const distinctId = await hashDistinctId(serverUrl, serverUserId);
    if (posthog) {
      posthog.identify(distinctId);
    }
    identified = true;
    await SecureStore.setItemAsync(IDENTIFIED_KEY, '1');
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] identify failed:', err);
    }
  }
}

export async function setOptedOut(next: boolean): Promise<void> {
  optedOut = next;
  await SecureStore.setItemAsync(OPTED_OUT_KEY, next ? '1' : '0');
  if (!posthog) return;
  try {
    if (next) {
      await posthog.optOut();
      queue = [];
    } else {
      await posthog.optIn();
    }
  } catch (err) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] opt-out toggle failed:', err);
    }
  }
}

export async function isOptedOut(): Promise<boolean> {
  if (initDone) return optedOut;
  return (await SecureStore.getItemAsync(OPTED_OUT_KEY)) === '1';
}

/** Test-only: reset module-level state. Does NOT clear SecureStore. */
export function __resetForTests(): void {
  posthog = null;
  initStarted = false;
  initDone = false;
  optedOut = false;
  identified = false;
  queue = [];
}
