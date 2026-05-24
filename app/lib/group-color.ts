import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { groupAccentSwatches } from './theme';

export const GROUP_COLORS_KEY = 'chara.groupColors';

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function validateHex(v: string): boolean {
  return HEX_RE.test(v);
}

/** FNV-1a 32-bit. Deterministic, dependency-free, good distribution for short
 *  string keys like ULIDs and UUIDs. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashSwatch(groupId: string): string {
  const idx = fnv1a32(groupId) % groupAccentSwatches.length;
  return groupAccentSwatches[idx];
}

export function overrideKey(serverUrl: string, groupId: string): string {
  return `${serverUrl}::${groupId}`;
}

// In-memory cache of the override map. Loaded once on first access, mutated
// in-place by setOverride/clearOverride, and persisted atomically on every
// write. Listeners are notified for React subscribers.
let overrides: Record<string, string> = {};
let loaded = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export async function loadOverrides(): Promise<void> {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const raw = await SecureStore.getItemAsync(GROUP_COLORS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          overrides = parsed as Record<string, string>;
        }
      }
    } catch {
      // Corrupt blob, ignore — defaults will be used. Next write replaces it.
      overrides = {};
    }
    loaded = true;
    loadPromise = null;
    notify();
  })();
  return loadPromise;
}

async function persist() {
  await SecureStore.setItemAsync(GROUP_COLORS_KEY, JSON.stringify(overrides));
}

export async function setOverride(
  serverUrl: string,
  groupId: string,
  hex: string,
): Promise<void> {
  if (!validateHex(hex)) throw new Error('invalid hex');
  await loadOverrides();
  overrides[overrideKey(serverUrl, groupId)] = hex;
  await persist();
  notify();
}

export async function clearOverride(
  serverUrl: string,
  groupId: string,
): Promise<void> {
  await loadOverrides();
  delete overrides[overrideKey(serverUrl, groupId)];
  await persist();
  notify();
}

/** Synchronous read. Callers should ensure loadOverrides() has resolved
 *  at least once (the hook does this on mount). Before load completes,
 *  returns the hash default — safe degradation. */
export function groupColorFor(serverUrl: string, groupId: string): string {
  const override = overrides[overrideKey(serverUrl, groupId)];
  return override ?? hashSwatch(groupId);
}

export function hasOverride(serverUrl: string, groupId: string): boolean {
  return overrides[overrideKey(serverUrl, groupId)] !== undefined;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook: returns the current color for a group, re-rendering on
 *  override changes. Triggers a lazy load on first mount. */
export function useGroupColor(serverUrl: string, groupId: string): string {
  // Fire-and-forget the load on first call; rerender happens via notify().
  if (!loaded && !loadPromise) {
    void loadOverrides();
  }
  return useSyncExternalStore(
    subscribe,
    () => groupColorFor(serverUrl, groupId),
    () => groupColorFor(serverUrl, groupId),
  );
}

export function __resetForTests() {
  overrides = {};
  loaded = false;
  loadPromise = null;
  listeners.clear();
}
