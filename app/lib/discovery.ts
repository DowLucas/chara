/**
 * Discovery + validation handshake for the addAccountFlow (spec §8).
 *
 * Pure orchestration over an injected `publicApi(serverUrl).instanceInfo()`
 * call plus `checkProtocolCompat()`. The screen-level code (see
 * `app/app/(auth)/add-server.tsx`) wires the real `publicApi` factory and
 * `checkProtocolCompat` in; tests pass fakes.
 *
 *   1. Reachability + JSON parse (5s timeout enforced here).
 *   2. Schema check — the seven required fields per §8 step 2. Unknown
 *      fields are silently tolerated (forward compatibility).
 *   3. Bidirectional protocol-version compat check (§9).
 *
 * The function never throws — every failure mode is returned as a
 * discriminated `DiscoveryError`. The screen maps these to i18n strings.
 */

import type { AccountInstanceInfo } from './accounts-store';
import type { CompatResult } from './protocol';

export const DISCOVERY_TIMEOUT_MS = 5000;

export type DiscoveryResult =
  | { ok: true; instance: AccountInstanceInfo }
  | DiscoveryError;

export type DiscoveryError =
  | { ok: false; reason: 'unreachable' }
  | { ok: false; reason: 'not_chara' }
  | { ok: false; reason: 'app_too_old' | 'app_too_new' | 'server_too_old' | 'server_too_new' };

export interface DiscoveryDeps {
  /** Fetches `/.well-known/chara-instance`. Must reject on network error. */
  fetchInstanceInfo: () => Promise<unknown>;
  /** Runs the protocol compat check. */
  checkCompat: (args: {
    serverProtocol: number;
    serverMinApp: number;
    serverMaxApp: number;
  }) => CompatResult;
  /** Overridable for tests. Defaults to DISCOVERY_TIMEOUT_MS. */
  timeoutMs?: number;
}

const REQUIRED_FIELDS = [
  'mode',
  'version',
  'protocol_version',
  'min_app_protocol',
  'max_app_protocol',
  'auth_methods',
  'features',
] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse the raw instance JSON into a typed AccountInstanceInfo. Returns
 * null if any required field is missing or the wrong shape.
 */
export function parseInstanceInfo(raw: unknown): AccountInstanceInfo | null {
  if (!isObject(raw)) return null;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in raw)) return null;
  }
  const mode = raw.mode;
  if (mode !== 'hosted' && mode !== 'selfhost') return null;

  const version = raw.version;
  if (typeof version !== 'string') return null;

  const protocol_version = raw.protocol_version;
  if (typeof protocol_version !== 'number' || !Number.isFinite(protocol_version)) return null;

  const min_app_protocol = raw.min_app_protocol;
  if (typeof min_app_protocol !== 'number' || !Number.isFinite(min_app_protocol)) return null;

  const max_app_protocol = raw.max_app_protocol;
  if (typeof max_app_protocol !== 'number' || !Number.isFinite(max_app_protocol)) return null;

  const auth_methods = raw.auth_methods;
  if (!Array.isArray(auth_methods) || !auth_methods.every((m) => typeof m === 'string')) {
    return null;
  }

  const features = raw.features;
  if (!isObject(features)) return null;
  const featuresTyped: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(features)) {
    if (typeof v !== 'boolean') return null;
    featuresTyped[k] = v;
  }

  return {
    mode,
    version,
    protocol_version,
    min_app_protocol,
    max_app_protocol,
    auth_methods: auth_methods as string[],
    features: featuresTyped,
  };
}

/**
 * Race a promise against a timeout. Resolves with the promise's value or
 * rejects with a sentinel timeout error.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(handle);
        resolve(v);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

export async function runDiscoveryHandshake(deps: DiscoveryDeps): Promise<DiscoveryResult> {
  const timeoutMs = deps.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  let raw: unknown;
  try {
    raw = await withTimeout(deps.fetchInstanceInfo(), timeoutMs);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  const parsed = parseInstanceInfo(raw);
  if (!parsed) {
    return { ok: false, reason: 'not_chara' };
  }

  const compat = deps.checkCompat({
    serverProtocol: parsed.protocol_version,
    serverMinApp: parsed.min_app_protocol,
    serverMaxApp: parsed.max_app_protocol,
  });

  if (!compat.ok) {
    return { ok: false, reason: compat.reason };
  }

  return { ok: true, instance: parsed };
}
