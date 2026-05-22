/**
 * Invite URL parser for the multi-server accounts feature.
 *
 * See `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md`
 * §10 for the authoritative formats. We accept three forms:
 *
 *   1. Canonical HTTPS:  https://server.example/api/groups/join/<token>
 *   2. App deep link:    chara://join?invite=<urlencoded-https-url>
 *   3. Legacy alias:     quits://join?invite=<urlencoded-https-url>
 *      (kept for one release during the rename rollout)
 *
 * All three return the same normalized `InviteRef`. The resolved server
 * URL passes through `normalizeServerUrl`, so any downstream consumer
 * can treat `serverUrl` as canonical.
 */

import { normalizeServerUrl } from './server-url';

export type InviteParseError = { kind: 'invalid'; reason: string };

export interface InviteRef {
  /** Normalized server URL (no path), e.g. `https://api.chara.app`. */
  serverUrl: string;
  /** URL-decoded join token. */
  token: string;
}

const JOIN_PATH_PREFIX = '/api/groups/join/';

function invalid(reason: string): InviteParseError {
  return { kind: 'invalid', reason };
}

/**
 * Parse the inner HTTPS form. Returns the InviteRef or an error.
 * Enforces:
 *   - https scheme (not http, not anything else)
 *   - path matches `/api/groups/join/<token>` exactly (one non-empty
 *     segment after `join`)
 *   - no query, no fragment
 *   - host passes `normalizeServerUrl`
 */
function parseHttpsForm(input: string): InviteRef | InviteParseError {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return invalid('not a valid URL');
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'https:') {
    return invalid('invite must use https');
  }

  if (parsed.search !== '') {
    return invalid('invite URL must not include a query');
  }
  if (parsed.hash !== '') {
    return invalid('invite URL must not include a fragment');
  }

  // Trim a single trailing slash (tolerated per spec), then require the
  // exact `/api/groups/join/<token>` shape.
  let path = parsed.pathname;
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1);
  }
  if (!path.startsWith(JOIN_PATH_PREFIX)) {
    return invalid('invite path must be /api/groups/join/<token>');
  }
  const tokenSegment = path.slice(JOIN_PATH_PREFIX.length);
  if (tokenSegment.length === 0) {
    return invalid('missing invite token');
  }
  if (tokenSegment.includes('/')) {
    return invalid('invite URL has extra path segments');
  }

  // Build the host-root URL string and normalize it. We can't pass
  // `parsed` directly into `normalizeServerUrl` because that helper
  // rejects any non-empty path; reconstruct just the host[:port] part.
  const port = parsed.port;
  const hostRoot = port === ''
    ? `https://${parsed.hostname}`
    : `https://${parsed.hostname}:${port}`;
  const normalized = normalizeServerUrl(hostRoot);
  if (typeof normalized !== 'string') {
    return invalid(`server URL invalid: ${normalized.reason}`);
  }

  let token: string;
  try {
    token = decodeURIComponent(tokenSegment);
  } catch {
    return invalid('invite token is not valid URL-encoded text');
  }
  if (token.length === 0) {
    return invalid('missing invite token');
  }

  return { serverUrl: normalized, token };
}

/**
 * Parse a `chara://` or `quits://` deep link. The inner `?invite=`
 * payload must be a URL-encoded HTTPS invite URL.
 */
function parseAppSchemeForm(
  input: string,
  scheme: 'chara' | 'quits',
): InviteRef | InviteParseError {
  // URL constructor handles custom schemes consistently when there's a
  // `//` after them. The host is the part before `?`.
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return invalid('not a valid URL');
  }

  if (parsed.protocol.toLowerCase() !== `${scheme}:`) {
    return invalid(`expected ${scheme}:// scheme`);
  }
  if (parsed.hostname.toLowerCase() !== 'join') {
    return invalid(`expected ${scheme}://join`);
  }

  const invitePayload = parsed.searchParams.get('invite');
  if (invitePayload === null || invitePayload === '') {
    return invalid('missing invite parameter');
  }

  return parseHttpsForm(invitePayload);
}

export function parseInviteUrl(input: string): InviteRef | InviteParseError {
  if (input == null) return invalid('empty input');
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return invalid('empty input');

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('https://')) {
    return parseHttpsForm(trimmed);
  }
  if (lower.startsWith('chara://')) {
    return parseAppSchemeForm(trimmed, 'chara');
  }
  if (lower.startsWith('quits://')) {
    return parseAppSchemeForm(trimmed, 'quits');
  }
  return invalid('unsupported scheme');
}
