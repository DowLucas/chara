/**
 * Personal, per-device "default split" for a group.
 *
 * A user who habitually splits a group the same uneven way (e.g. 60/40 in a
 * couple's group) can save that percentage split once; new expenses in the
 * group then prefill it. This is a pure device preference — never synced to
 * any server — and is keyed by the composite (serverUrl, groupId) used
 * everywhere else. Mirrors the SecureStore get/set pattern in pinned-groups.ts.
 *
 * Percentage-only by design: an uneven default only makes sense as a ratio
 * (amounts vary per expense). Stored as basis points per member (1% = 100),
 * summing to 10000.
 */

import * as SecureStore from 'expo-secure-store';

const KEY_SAVED_SPLITS = 'chara.savedSplits';

/** memberId → basis points (1% = 100). Sums to 10000 for a valid split. */
export type GroupDefaultSplit = Record<string, number>;

function groupKey(serverUrl: string, groupId: string): string {
  return `${serverUrl}::${groupId}`;
}

/** Floor + largest-remainder apportionment. Matches SplitEditor's auto-fill
 *  and the Go split engine so a saved split reproduces the same numbers. */
function distributeInt(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (total <= 0) return new Array(count).fill(0);
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Resolve the SplitEditor's percentage state (decimal-percent strings, some
 * members left "auto") into a full basis-points map over the included set.
 * Locked members keep their value; the remainder is distributed across the
 * auto members. Locked values for members outside `includedIds` are ignored.
 */
export function resolvePercentageBasisPoints(
  includedIds: string[],
  pctByMember: Record<string, string>,
): GroupDefaultSplit {
  const locked = new Map<string, number>();
  for (const id of includedIds) {
    const raw = pctByMember[id];
    if (raw === undefined || raw === '') continue;
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n)) locked.set(id, Math.round(n * 100));
  }
  const autoIds = includedIds.filter((id) => !locked.has(id));
  const lockedSum = [...locked.values()].reduce((s, v) => s + v, 0);
  const shares = distributeInt(10000 - lockedSum, autoIds.length);
  const out: GroupDefaultSplit = {};
  for (const id of includedIds) {
    out[id] = locked.has(id) ? (locked.get(id) ?? 0) : 0;
  }
  autoIds.forEach((id, i) => (out[id] = shares[i] ?? 0));
  return out;
}

function bpToPctString(bp: number): string {
  return String(bp / 100);
}

/**
 * Convert a saved split into SplitEditor percentage state for the wizard.
 * Returns null unless the saved member set exactly matches the current
 * roster — a stale template (someone joined/left) falls back to equal rather
 * than silently applying a partial split.
 */
export function savedSplitToPct(
  saved: GroupDefaultSplit,
  members: { id: string }[],
): { included: Record<string, boolean>; pctByMember: Record<string, string> } | null {
  const savedIds = Object.keys(saved);
  const memberIds = members.map((m) => m.id);
  if (savedIds.length !== memberIds.length) return null;
  const memberSet = new Set(memberIds);
  if (!savedIds.every((id) => memberSet.has(id))) return null;

  const included: Record<string, boolean> = {};
  const pctByMember: Record<string, string> = {};
  for (const id of memberIds) {
    included[id] = true;
    pctByMember[id] = bpToPctString(saved[id]);
  }
  return { included, pctByMember };
}

async function readAll(): Promise<Record<string, GroupDefaultSplit>> {
  const raw = await SecureStore.getItemAsync(KEY_SAVED_SPLITS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, GroupDefaultSplit>;
    }
  } catch {
    // fall through
  }
  return {};
}

async function writeAll(map: Record<string, GroupDefaultSplit>): Promise<void> {
  await SecureStore.setItemAsync(KEY_SAVED_SPLITS, JSON.stringify(map));
}

export async function loadGroupDefaultSplit(
  serverUrl: string,
  groupId: string,
): Promise<GroupDefaultSplit | null> {
  const all = await readAll();
  return all[groupKey(serverUrl, groupId)] ?? null;
}

export async function saveGroupDefaultSplit(
  serverUrl: string,
  groupId: string,
  split: GroupDefaultSplit,
): Promise<void> {
  const all = await readAll();
  all[groupKey(serverUrl, groupId)] = split;
  await writeAll(all);
}

export async function clearGroupDefaultSplit(
  serverUrl: string,
  groupId: string,
): Promise<void> {
  const all = await readAll();
  delete all[groupKey(serverUrl, groupId)];
  await writeAll(all);
}
