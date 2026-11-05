/**
 * Recovery for a Swish settle the app was killed in the middle of.
 *
 * The settle screen sends the user to Swish (and Swish on to BankID) and
 * waits for them to come back and tap "I've paid". The OS is free to kill
 * Chara while it is in the background, and when it does the waiting screen —
 * and with it the only way to confirm — is gone: the user relaunches onto the
 * home screen with the debt still open. So the settle screen persists what it
 * was waiting for right before handing off to Swish, and clears it when the
 * wait ends normally. A record that survives to the next cold launch means the
 * app died mid-wait, and `runPendingSwishRecovery` asks the user whether the
 * payment went through (docs/swish-integration.md §3, failure-mode table).
 *
 * The record carries the screen's settlement id, so confirming here is the
 * same idempotent POST /settle the screen would have made.
 */

import * as SecureStore from 'expo-secure-store';

import type { SettleInput } from './api';

const KEY = 'chara.pendingSwish';

/** Past this, nobody remembers whether the payment went through. */
export const PENDING_SWISH_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingSwish {
  serverUrl: string;
  groupId: string;
  groupName: string;
  fromMemberId: string;
  toMemberId: string;
  payeeName: string;
  /** Decimal string — the debt amount the screen would have recorded. */
  amount: string;
  currency: string;
  settlementId: string;
  /** Epoch ms when Swish was opened. */
  startedAt: number;
}

export async function savePendingSwish(p: PendingSwish): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(p));
}

export async function clearPendingSwish(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export type PendingSwishResolution =
  | { kind: 'none' }
  | { kind: 'drop' }
  | { kind: 'wait' }
  | { kind: 'prompt'; pending: PendingSwish };

interface AccountRef {
  serverUrl: string;
  status?: string;
}

const STRING_FIELDS = [
  'serverUrl',
  'groupId',
  'groupName',
  'fromMemberId',
  'toMemberId',
  'payeeName',
  'amount',
  'currency',
  'settlementId',
] as const;

/** Decides what to do with a stored record: nothing stored, discard it
 *  (malformed, expired, or its account is gone), keep it for later (its
 *  account can't make requests right now), or ask the user. */
export function resolvePendingSwish(
  raw: string | null,
  accounts: readonly AccountRef[],
  now: number,
): PendingSwishResolution {
  if (!raw) return { kind: 'none' };
  let p: PendingSwish;
  try {
    p = JSON.parse(raw);
  } catch {
    return { kind: 'drop' };
  }
  if (
    typeof p !== 'object' ||
    p === null ||
    typeof p.startedAt !== 'number' ||
    STRING_FIELDS.some((f) => typeof p[f] !== 'string')
  ) {
    return { kind: 'drop' };
  }
  if (now - p.startedAt > PENDING_SWISH_TTL_MS) return { kind: 'drop' };
  const account = accounts.find((a) => a.serverUrl === p.serverUrl);
  if (!account) return { kind: 'drop' };
  if (account.status === 'reauth_required' || account.status === 'incompatible') {
    return { kind: 'wait' };
  }
  return { kind: 'prompt', pending: p };
}

export interface RecoveryDeps {
  accounts: readonly AccountRef[];
  now: number;
  /** Shows the "did it go through?" question; `null` = dismissed. */
  ask: (p: PendingSwish) => Promise<'yes' | 'no' | null>;
  settle: (serverUrl: string, groupId: string, input: SettleInput) => Promise<unknown>;
  navigateToGroup: (serverUrl: string, groupId: string) => void;
  notifyError: (e: unknown) => void;
  track: (event: 'swish_confirmed' | 'swish_recovery_shown' | 'swish_recovery_declined', props: Record<string, string>) => void;
}

/** Cold-launch check: if the app died while waiting on Swish, ask whether
 *  the payment went through and record it if so. */
export async function runPendingSwishRecovery(deps: RecoveryDeps): Promise<void> {
  const resolution = resolvePendingSwish(
    await SecureStore.getItemAsync(KEY),
    deps.accounts,
    deps.now,
  );
  if (resolution.kind === 'drop') {
    await clearPendingSwish();
    return;
  }
  if (resolution.kind !== 'prompt') return;

  const p = resolution.pending;
  deps.track('swish_recovery_shown', {});
  const answer = await deps.ask(p);
  if (answer === null) return;
  // Answered either way: the record has done its job. Clearing before the
  // POST also means a failed attempt can't resurface on a later launch after
  // the user has recorded the payment some other way.
  await clearPendingSwish();
  if (answer === 'no') {
    deps.track('swish_recovery_declined', {});
    return;
  }
  try {
    await deps.settle(p.serverUrl, p.groupId, {
      id: p.settlementId,
      from_member_id: p.fromMemberId,
      to_member_id: p.toMemberId,
      amount: p.amount,
      currency: p.currency,
      method: 'swish',
    });
  } catch (e) {
    deps.notifyError(e);
    return;
  }
  deps.track('swish_confirmed', { source: 'recovery' });
  deps.navigateToGroup(p.serverUrl, p.groupId);
}
