/**
 * Cold-launch + foreground recovery probe for `incompatible` accounts
 * (spec §9, last bullet).
 *
 * The aggregated-reads fan-out (see `aggregated-reads.ts`) skips
 * accounts in `incompatible` status entirely — without an active
 * pathway back to `ok`, an account upgraded while the app was killed
 * would stay stuck.
 *
 * `runRecoveryProbes()` re-runs the unauthenticated discovery
 * handshake for every `incompatible` account; if compatibility is
 * restored, `clearStatus(serverUrl)` flips the account back to ok and
 * the next fan-out tick (driven by `useAccounts()` re-render) resumes
 * normal reads. Failures are swallowed.
 *
 * Triggers (wired in `app/app/_layout.tsx`):
 *   • cold launch, once, after AccountsProvider mounts
 *   • every `AppState` `'active'` transition
 *
 * Both are required — see spec §9 for rationale.
 */

import { clearStatus, snapshot } from './accounts-store';
import { publicApi } from './api';
import { checkProtocolCompat } from './protocol';
import { runDiscoveryHandshake } from './discovery';

export interface RecoveryProbeResult {
  ok: true;
}

export interface RecoveryProbeFailure {
  ok: false;
  reason: string;
}

export type RecoveryProbe = (
  serverUrl: string,
) => Promise<RecoveryProbeResult | RecoveryProbeFailure>;

/**
 * Default probe: runs the same discovery handshake the addAccountFlow
 * uses, but bound to `publicApi(serverUrl).instanceInfo()`.
 */
export const defaultRecoveryProbe: RecoveryProbe = async (serverUrl) => {
  const result = await runDiscoveryHandshake({
    fetchInstanceInfo: () => publicApi(serverUrl).instanceInfo(),
    checkCompat: (args) => checkProtocolCompat(args),
  });
  if (result.ok) return { ok: true };
  return { ok: false, reason: result.reason };
};

export interface RunRecoveryDeps {
  probe?: RecoveryProbe;
}

/**
 * Probe every `incompatible` account. Probes run in parallel via
 * `Promise.allSettled` — one slow / hung server doesn't block recovery
 * for the others. Failures are swallowed: the account stays
 * `incompatible`, no UI change.
 */
export async function runRecoveryProbes(deps: RunRecoveryDeps = {}): Promise<void> {
  const probe = deps.probe ?? defaultRecoveryProbe;
  const targets = snapshot().accounts.filter((a) => a.status === 'incompatible');

  await Promise.allSettled(
    targets.map(async (account) => {
      try {
        const result = await probe(account.serverUrl);
        if (result.ok) {
          await clearStatus(account.serverUrl);
        }
      } catch {
        /* swallow per spec — account stays incompatible */
      }
    }),
  );
}
