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
 * self-heal. A transient (thrown) fetch is retried a bounded number of times
 * so a single network blip on the sign-in screen's one-shot mount fetch can't
 * strand a logged-out user on email-only. It never throws: a server that stays
 * unreachable, or a non-Chara response, returns null and leaves any cached
 * snapshot untouched.
 *
 * Mirrors the dependency-injection style of `compat-recovery.ts` /
 * `discovery.ts` so it can be unit-tested with a fake `fetchInstanceInfo`.
 */

import { publicApi } from './api';
import { accountFor, updateAccount, type AccountInstanceInfo } from './accounts-store';
import { parseInstanceInfo } from './discovery';

/** Delay between retry attempts after a transient (thrown) fetch failure. */
const RETRY_DELAY_MS = 400;

export interface RefreshInstanceDeps {
  /** Fetches `/.well-known/chara-instance`. Defaults to the real publicApi. */
  fetchInstanceInfo?: () => Promise<unknown>;
  /** Re-attempts after a transient (thrown) fetch failure. Default 2. */
  retries?: number;
  /** Injected for deterministic tests; defaults to a real timer delay. */
  sleep?: (ms: number) => Promise<void>;
}

export async function refreshAccountInstance(
  serverUrl: string,
  deps: RefreshInstanceDeps = {},
): Promise<AccountInstanceInfo | null> {
  const fetchInstanceInfo =
    deps.fetchInstanceInfo ?? (() => publicApi(serverUrl).instanceInfo());
  const retries = deps.retries ?? 2;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // Retry only the thrown path (network / non-2xx). A single transient blip on
  // this fetch must not strand the sign-in screen on email-only — the
  // Apple/Google buttons are gated on the fetched `features`, and post-logout
  // there is no cached snapshot to fall back on. A successful-but-unparseable
  // 200 is a definitive negative, not transient, so it's handled below.
  let raw: unknown;
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await fetchInstanceInfo();
      break;
    } catch {
      if (attempt >= retries) return null;
      await sleep(RETRY_DELAY_MS);
    }
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
