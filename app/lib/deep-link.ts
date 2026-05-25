/**
 * Pure (testable) classifier for the `chara://groups/<server>/<groupId>`
 * deep-link shape. The runtime handler in `app/_layout.tsx` consumes the
 * returned intent and decides whether to navigate, alert the user, or
 * defer until the accounts blob is loaded.
 *
 * Security: a deep link is untrusted input — a push payload, an SMS, a
 * scanned QR. We must never blindly route the user into a group screen
 * on a server they aren't signed into; that screen would issue
 * authenticated requests to whoever the attacker pointed us at (and
 * leak request metadata even if the server has no token). The classifier
 * rejects unknown servers up-front.
 */

import type { Account } from './accounts-store';
import { normalizeServerUrl } from './server-url';

export type GroupDeepLinkIntent =
  /** URL was empty / not a group deep link / not recognised. */
  | { kind: 'ignore' }
  /** Looked like a group link but the path/server is unparseable. */
  | { kind: 'malformed' }
  /** Accounts blob hasn't finished loading; caller should retry later. */
  | { kind: 'not_loaded' }
  /** Group link points at a server the user isn't signed into. */
  | { kind: 'unknown_server'; serverUrl: string }
  /** Safe to navigate. */
  | { kind: 'navigate'; serverUrl: string; groupId: string };

interface ClassifyDeps {
  accounts: Account[];
  isLoaded: boolean;
}

export function classifyGroupDeepLink(
  url: string | null | undefined,
  deps: ClassifyDeps,
): GroupDeepLinkIntent {
  if (!url) return { kind: 'ignore' };
  const lower = url.toLowerCase();
  if (!lower.startsWith('chara://groups/')) return { kind: 'ignore' };

  if (!deps.isLoaded) return { kind: 'not_loaded' };

  // Strip scheme and any query/fragment, then split.
  const withoutScheme = url.slice('chara://'.length);
  const [path] = withoutScheme.split(/[?#]/);
  const parts = path.split('/').filter((p) => p.length > 0);
  // parts: ['groups', '<encodedServer>', '<groupId>', ...]
  if (parts.length < 3 || parts[0] !== 'groups') return { kind: 'malformed' };

  const encodedServer = parts[1];
  const groupId = parts[2];
  if (!encodedServer || !groupId) return { kind: 'malformed' };

  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedServer);
  } catch {
    return { kind: 'malformed' };
  }

  const normalized = normalizeServerUrl(decoded);
  if (typeof normalized !== 'string') return { kind: 'malformed' };

  const match = deps.accounts.some((a) => a.serverUrl === normalized);
  if (!match) return { kind: 'unknown_server', serverUrl: normalized };

  return { kind: 'navigate', serverUrl: normalized, groupId };
}
