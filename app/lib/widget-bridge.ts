/**
 * Thin wrapper over the `CharaWidgets` native module (see
 * `modules/chara-widgets/`). The only place in the app that talks to it.
 *
 * Contract: a widget failure must never surface in the app. Every call
 * swallows its errors and no-ops when the native module is missing — web,
 * Expo Go, and any build made before the widget targets existed.
 */

import type { WidgetSnapshot } from './widget-snapshot-types';

interface CharaWidgetsNativeModule {
  /** Persists the payload to shared storage and reloads placed widgets. */
  setSnapshot(json: string): Promise<void>;
  /** Deletes the payload outright — not an empty write. */
  clearSnapshot(): Promise<void>;
}

/**
 * Resolved per call, with `expo-modules-core` pulled in lazily.
 *
 * The lazy require matters: `accounts-store` imports this module, and is in
 * turn imported by `api.ts` and thus almost everything. A top-level native
 * import would drag `expo-modules-core` into every unit test that touches
 * the account store. Same reasoning as the analytics accessor in
 * `accounts-store.ts`.
 *
 * The module is legitimately absent on web and in Expo Go, so a null return
 * is a normal outcome, not an error.
 */
function nativeModule(): CharaWidgetsNativeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule<T>(name: string): T | null;
    };
    return core.requireOptionalNativeModule<CharaWidgetsNativeModule>('CharaWidgets');
  } catch {
    return null;
  }
}

export function isWidgetBridgeAvailable(): boolean {
  return nativeModule() != null;
}

/**
 * Identity of a snapshot's *content*, ignoring the fields that change on
 * every rebuild. Without this the home screen's refresh cadence would fire a
 * native reload on every focus change and burn the OS refresh budget for no
 * visible difference.
 */
function contentKey(snapshot: WidgetSnapshot): string {
  const { generatedAt, updatedAtText, ...content } = snapshot;
  void generatedAt;
  void updatedAtText;
  return JSON.stringify(content);
}

let lastWritten: string | null = null;

export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  const native = nativeModule();
  if (!native) return;

  const key = contentKey(snapshot);
  if (key === lastWritten) return;

  try {
    await native.setSnapshot(JSON.stringify(snapshot));
    // Only remember a write that landed, so a transient failure retries
    // instead of pinning the widget to stale data until content changes.
    lastWritten = key;
  } catch {
    lastWritten = null;
  }
}

export async function clearWidgetSnapshot(): Promise<void> {
  lastWritten = null;
  const native = nativeModule();
  if (!native) return;
  try {
    await native.clearSnapshot();
  } catch {
    // Nothing useful to do — the app must proceed with sign-out regardless.
  }
}

/** @internal Test seam for the module-level dedup cache. */
export function __resetWidgetBridgeForTests(): void {
  lastWritten = null;
}
