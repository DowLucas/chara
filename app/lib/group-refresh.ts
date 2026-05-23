/**
 * Lightweight in-memory event emitter that tells a group-detail screen to
 * refetch its data after a mutation made on a different screen.
 *
 * `useFocusEffect` alone isn't reliable across every navigation path
 * (modal returns, deep-link replaces, fast pops). Mutators call
 * `notifyGroupChanged(serverUrl, groupId)` after a successful write;
 * subscribers (group detail screen) call `load()` on the next tick.
 */

type Key = string;
const subs = new Map<Key, Set<() => void>>();

function keyOf(serverUrl: string, groupId: string): Key {
  return `${serverUrl}::${groupId}`;
}

export function notifyGroupChanged(serverUrl: string, groupId: string): void {
  const set = subs.get(keyOf(serverUrl, groupId));
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      // swallow — subscribers must not break each other
    }
  }
}

export function subscribeGroupChanged(
  serverUrl: string,
  groupId: string,
  fn: () => void,
): () => void {
  const k = keyOf(serverUrl, groupId);
  let set = subs.get(k);
  if (!set) {
    set = new Set();
    subs.set(k, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subs.delete(k);
  };
}
