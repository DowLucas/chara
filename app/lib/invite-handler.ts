/**
 * Cross-server invite classifier (spec §10, Wave 6).
 *
 * Pure function: takes a scanned QR / deep-link payload and the current
 * accounts snapshot, returns a discriminated `InviteIntent`. Side effects
 * (API calls, navigation, alerts) live in `invite-dispatcher.ts`, which is
 * separate so this module stays test-clean (no RN imports → no jest
 * transform pain).
 *
 * Per the spec's "Join flow branches" table:
 *   - Doesn't parse                        → `invalid`
 *   - Parses; no account on that server    → `add-account-then-join`
 *   - Parses; one account on that server   → `join-with-account`
 *   - Parses; two-or-more accounts         → `choose-account`, pre-selecting
 *                                            the most-recent `lastUsedAt`
 *
 * Note: the current data model keys `accounts` by `serverUrl`, so the
 * "≥ 2 accounts on one server" branch is unreachable today. Still
 * implemented and tested so per-handle / sub-account distinctions later
 * are a UI change only — the dispatch is ready.
 */

import { parseInviteUrl } from './invite-url';

export type InviteIntent =
  /** Already signed in on the server; just call `joinGroupByToken`. */
  | { kind: 'join-with-account'; serverUrl: string; token: string; accountServerUrl: string }
  /** ≥ 2 accounts on this server; show chooser pre-selecting `defaultPick`. */
  | {
      kind: 'choose-account';
      serverUrl: string;
      token: string;
      candidateServerUrls: string[];
      defaultPick: string;
    }
  /** No account on this server; route through addAccountFlow with `pendingInvite`. */
  | { kind: 'add-account-then-join'; serverUrl: string; token: string }
  /** Parse failure. */
  | { kind: 'invalid'; reason: string };

/**
 * Just the bits of an `Account` the classifier needs. Keeping the shape
 * narrow lets tests fabricate inputs without constructing full Account
 * objects.
 */
export interface ClassifyDepsAccount {
  serverUrl: string;
  user: { id: string };
  lastUsedAt: string;
}

export interface ClassifyDeps {
  /** Snapshot of `useAccounts().accounts`. The function is pure; pass any time. */
  accounts: ClassifyDepsAccount[];
}

export function classifyInvite(scannedInput: string, deps: ClassifyDeps): InviteIntent {
  const parsed = parseInviteUrl(scannedInput);
  if ('kind' in parsed && parsed.kind === 'invalid') {
    return { kind: 'invalid', reason: parsed.reason };
  }
  // Narrowed: parsed is InviteRef
  const { serverUrl, token } = parsed as { serverUrl: string; token: string };

  const matches = deps.accounts.filter((a) => a.serverUrl === serverUrl);

  if (matches.length === 0) {
    return { kind: 'add-account-then-join', serverUrl, token };
  }

  if (matches.length === 1) {
    return {
      kind: 'join-with-account',
      serverUrl,
      token,
      accountServerUrl: matches[0].serverUrl,
    };
  }

  // ≥ 2 matches: pick the most-recent `lastUsedAt`. ISO 8601 strings are
  // lexicographically comparable when zero-padded (always, by spec).
  // Tie-break on first appearance for determinism.
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].lastUsedAt > best.lastUsedAt) {
      best = matches[i];
    }
  }

  return {
    kind: 'choose-account',
    serverUrl,
    token,
    candidateServerUrls: matches.map((a) => a.serverUrl),
    defaultPick: best.serverUrl,
  };
}
