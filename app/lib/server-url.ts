/**
 * Canonical server URL normalization for the multi-server accounts feature.
 *
 * The canonical form is `scheme://host[:port]` — no path, no query, no
 * fragment. See `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md`
 * §4 for the authoritative rules. This module is pure (no I/O, no DNS
 * resolution); callers run every URL entry point through it before any
 * downstream consumer sees it.
 */

export type NormalizationError = { kind: 'invalid'; reason: string };

const HTTPS_DEFAULT_PORT = '443';
const HTTP_DEFAULT_PORT = '80';

function invalid(reason: string): NormalizationError {
  return { kind: 'invalid', reason };
}

/**
 * Returns true if the (already-normalized, lowercased) host is a loopback,
 * link-local, or RFC1918 / RFC4193 private address. This is the heuristic
 * for accepting `http://` in dev — we can't do DNS resolution from a pure
 * helper, so we accept the literal string forms that are unambiguously
 * private.
 */
function isPrivateOrLoopbackHost(host: string): boolean {
  if (host === 'localhost') return true;

  // IPv6: URL constructor stores them bracketed in `host`. We get the
  // un-bracketed form here.
  if (host.startsWith('[') && host.endsWith(']')) {
    const inner = host.slice(1, -1);
    return isPrivateOrLoopbackIPv6(inner);
  }

  // IPv4 dotted-quad
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const c = Number(ipv4[3]);
    const d = Number(ipv4[4]);
    if ([a, b, c, d].some(n => n > 255)) return false;
    if (a === 127) return true;              // 127.0.0.0/8 loopback
    if (a === 10) return true;               // 10.0.0.0/8
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    return false;
  }

  return false;
}

function isPrivateOrLoopbackIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::1') return true;
  // fc00::/7 — first byte has top 7 bits = 1111110, i.e. 0xfc or 0xfd
  const firstGroup = lower.split(':')[0];
  if (firstGroup.length > 0 && firstGroup.length <= 4) {
    const val = parseInt(firstGroup, 16);
    if (!Number.isNaN(val) && (val & 0xfe00) === 0xfc00) return true;
  }
  return false;
}

function stripTrailingColon(s: string): string {
  return s.endsWith(':') ? s.slice(0, -1) : s;
}

/**
 * The canonical URL of the main Chara hosted server. Anything matching
 * this should be rendered as "Chara Server" in UI rather than the
 * domain.
 */
export const MAIN_HOSTED_SERVER_URL = 'https://api.chara.app';

/**
 * True when `serverUrl` is the main Chara hosted instance. Comparison
 * tolerates a trailing slash and case differences in the host part.
 */
export function isMainHostedServer(serverUrl: string): boolean {
  const stripped = String(serverUrl || '').replace(/\/+$/, '').toLowerCase();
  return stripped === MAIN_HOSTED_SERVER_URL.toLowerCase();
}

/**
 * UI-facing label for a server. The main hosted server gets a friendly
 * brand name; everything else falls back to the bare host. Callers pass
 * the translated brand label so this stays i18n-aware without dragging
 * i18next into a pure helper.
 */
export function displayHostFor(serverUrl: string, mainServerLabel: string): string {
  if (isMainHostedServer(serverUrl)) return mainServerLabel;
  return String(serverUrl || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * True if the URL's host is a loopback/private IP — i.e. exposing it on
 * the UI in plain text leaks LAN topology. Use to decide whether to
 * mask the chip behind a tap-to-reveal.
 */
export function isPrivateServerUrl(serverUrl: string): boolean {
  try {
    const parsed = new URL(serverUrl);
    return isPrivateOrLoopbackHost(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeServerUrl(input: string): string | NormalizationError {
  if (input == null) return invalid('empty input');
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return invalid('empty input');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return invalid('not a valid URL');
  }

  const scheme = stripTrailingColon(parsed.protocol).toLowerCase();
  if (scheme !== 'https' && scheme !== 'http') {
    return invalid(`unsupported scheme "${scheme}"`);
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return invalid('userinfo is not allowed');
  }

  // The URL constructor sets pathname to '/' even for a bare host.
  // The spec treats a bare trailing slash as not a path component — strip
  // it silently. Anything else is a real path and rejected.
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    return invalid('server URL must not include a path');
  }

  if (parsed.search !== '') {
    return invalid('server URL must not include a query');
  }

  if (parsed.hash !== '') {
    return invalid('server URL must not include a fragment');
  }

  // Host as the URL constructor stored it. For IDN, the WHATWG URL
  // implementation in Node converts to punycode automatically and
  // lowercases ASCII. For IPv6, `hostname` is the un-bracketed form.
  const hostnameRaw = parsed.hostname;
  if (hostnameRaw === '') {
    return invalid('missing host');
  }
  const hostname = hostnameRaw.toLowerCase();

  // Node's URL constructor returns IPv6 hosts already bracketed (e.g.
  // `[::1]`). Use that form both for the private-check helper and for the
  // canonical output.
  const hostForCheck = hostname;

  if (scheme === 'http' && !isPrivateOrLoopbackHost(hostForCheck)) {
    return invalid('http is only allowed for loopback or private hosts');
  }

  // Port handling.
  const port = parsed.port; // empty string if default or unspecified
  let portSuffix = '';
  if (port !== '') {
    if (scheme === 'https' && port === HTTPS_DEFAULT_PORT) {
      portSuffix = '';
    } else if (scheme === 'http' && port === HTTP_DEFAULT_PORT) {
      portSuffix = '';
    } else {
      portSuffix = `:${port}`;
    }
  }

  return `${scheme}://${hostForCheck}${portSuffix}`;
}
