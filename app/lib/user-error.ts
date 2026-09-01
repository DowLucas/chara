/**
 * Last gate between a thrown error and a popup the user reads.
 *
 * `apiErrorMessage` (api.ts) already unwraps the backend's `{"error": …}`
 * envelope, so an `ApiError.message` is usually decent server prose and
 * passes straight through. What still leaks without this helper:
 *
 *   - `TypeError: Network request failed` — fetch's offline shape, which
 *     reads as a crash rather than "you have no signal".
 *   - machine output: a raw JSON blob, a Go type name, a `panic:` line.
 *   - a wall of text no alert can render.
 *
 * Those collapse to a friendly line: the translated offline message for a
 * network failure, otherwise the caller's own already-translated fallback.
 */

import i18n from './i18n';

/** Messages fetch (and the platform layers under it) produce when the
 *  request never reached a server. Matched case-insensitively. */
const NETWORK_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'load failed',
  'network error',
  'connection appears to be offline',
  'timeout',
  'timed out',
];

/**
 * Machine-shaped messages that must never reach a user:
 *   `*net.OpError` (Go pointer type) · `json.SyntaxError` (whole message is a
 *   qualified identifier) · `panic:` / `runtime error:` · a `foo.go:12` frame ·
 *   the stdlib error prefixes (`sql:`, `pq:`, `http:`, …) · a bare `EOF`.
 */
const MACHINE_SHAPED =
  /^\*|^panic:|^runtime error:|\.go:\d|^(?:[a-z][a-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$|^(?:sql|pq|http|tls|json|rpc|net|x509)\b:|^EOF$/;

/** Longer than this and it's a stack trace or a dump, not a sentence. */
const MAX_LENGTH = 200;

function rawMessageOf(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return '';
}

/**
 * @param fallback an already-translated string the caller is happy to show.
 */
export function userErrorMessage(e: unknown, fallback: string): string {
  const message = rawMessageOf(e).trim();
  const lower = message.toLowerCase();

  if (e instanceof TypeError || NETWORK_PATTERNS.some((p) => lower.includes(p))) {
    return i18n.t('common.networkError');
  }

  if (!message || message.length > MAX_LENGTH) return fallback;
  if (message.startsWith('{') || message.startsWith('[')) return fallback;
  if (MACHINE_SHAPED.test(message)) return fallback;

  return message;
}
