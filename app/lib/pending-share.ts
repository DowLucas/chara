/**
 * Holds the file the OS just handed us, between the share-intent callback in
 * _layout.tsx and whichever screen consumes it (receipt-inbox → add-expense).
 *
 * Module-level rather than context: the intent arrives before any screen has
 * mounted. Session-only, never persisted — the bytes are large and the file
 * itself lives in the App Group container with its own TTL sweep
 * (lib/share-inbox.ts).
 */

import { useSyncExternalStore } from 'react';

export interface PendingShare {
  uri: string;
  mimeType: string;
  name: string;
  extraFilesIgnored: number;
}

let pending: PendingShare | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setPendingShare(next: PendingShare | null): void {
  pending = next;
  emit();
}

/** Read without clearing — for screens that display it. */
export function usePendingShare(): PendingShare | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
    () => pending,
  );
}

/** Read AND clear. Called by add-expense so a stale file can't be re-applied
 *  to a second expense if the user navigates back into the wizard. */
export function consumePendingShare(): PendingShare | null {
  const current = pending;
  if (current) setPendingShare(null);
  return current;
}
