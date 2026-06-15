/**
 * Refresh a server's advertised capabilities and persist them to the account.
 *
 * The sign-in screen renders its auth buttons (Apple / Google / email) from
 * the server's advertised `features` (`account.instance.features`). That
 * snapshot is cached on the account and — on iOS — survives app reinstall via
 * the Keychain. Without a refresh path, a stale snapshot (e.g. captured while
 * the server was temporarily misconfigured during an outage) sticks forever,
 * hiding social-login buttons the server actually supports.
 *
 * `refreshAccountInstance` re-reads `/.well-known/chara-instance`, validates
 * it, and writes the fresh `instance` back onto the account so the buttons
 * self-heal. It never throws: an unreachable server or a non-Chara response
 * returns null and leaves any cached snapshot untouched.
 *
 * Mirrors the dependency-injection style of `compat-recovery.ts` /
 * `discovery.ts` so it can be unit-tested with a fake `fetchInstanceInfo`.
 */

import { publicApi } from './api';
import { accountFor, updateAccount, type AccountInstanceInfo } from './accounts-store';
import { parseInstanceInfo } from './discovery';

export interface RefreshInstanceDeps {
  /** Fetches `/.well-known/chara-instance`. Defaults to the real publicApi. */
  fetchInstanceInfo?: () => Promise<unknown>;
}

export async function refreshAccountInstance(
  serverUrl: string,
  deps: RefreshInstanceDeps = {},
): Promise<AccountInstanceInfo | null> {
  const fetchInstanceInfo =
    deps.fetchInstanceInfo ?? (() => publicApi(serverUrl).instanceInfo());

  let raw: unknown;
  try {
    raw = await fetchInstanceInfo();
  } catch {
    // Unreachable / network error — keep whatever snapshot we already have.
    return null;
  }

  const parsed = parseInstanceInfo(raw);
  if (!parsed) return null;

  // Persist only when we already track this server, so the sign-in screen's
  // first-launch path (no account yet) doesn't create a phantom entry.
  if (accountFor(serverUrl)) {
    await updateAccount(serverUrl, { instance: parsed });
  }
  return parsed;
}
