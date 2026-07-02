/**
 * Local, per-device "pinned to top of home screen" preference for groups.
 *
 * Groups are aggregated across N independent server-accounts (see
 * aggregated-reads.ts) and identified by the composite (serverUrl, groupId)
 * key used everywhere else in the app (routes, row keys). Pin state is a
 * pure device preference — it is never synced to any server, mirrors the
 * simple SecureStore-backed get/set pattern in preferences.ts.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_PINNED_GROUPS = 'chara.pinnedGroups';

/** Composite key matching the `${serverUrl}::${groupId}` shape used for
 *  row keys on the home screen. */
export function groupKey(serverUrl: string, groupId: string): string {
  return `${serverUrl}::${groupId}`;
}

export async function getPinnedGroupKeys(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(KEY_PINNED_GROUPS);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === 'string');
}

async function setPinnedGroupKeys(keys: string[]): Promise<void> {
  await SecureStore.setItemAsync(KEY_PINNED_GROUPS, JSON.stringify(keys));
}

export async function isGroupPinned(serverUrl: string, groupId: string): Promise<boolean> {
  const keys = await getPinnedGroupKeys();
  return keys.includes(groupKey(serverUrl, groupId));
}

export async function pinGroup(serverUrl: string, groupId: string): Promise<void> {
  const keys = await getPinnedGroupKeys();
  const key = groupKey(serverUrl, groupId);
  if (keys.includes(key)) return;
  await setPinnedGroupKeys([...keys, key]);
}

export async function unpinGroup(serverUrl: string, groupId: string): Promise<void> {
  const keys = await getPinnedGroupKeys();
  const key = groupKey(serverUrl, groupId);
  const next = keys.filter((k) => k !== key);
  if (next.length === keys.length) return;
  await setPinnedGroupKeys(next);
}

/** Flips pin state and returns the new state (true = now pinned). */
export async function togglePinnedGroup(serverUrl: string, groupId: string): Promise<boolean> {
  const pinned = await isGroupPinned(serverUrl, groupId);
  if (pinned) {
    await unpinGroup(serverUrl, groupId);
    return false;
  }
  await pinGroup(serverUrl, groupId);
  return true;
}
