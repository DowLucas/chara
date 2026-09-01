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

/**
 * Schemes we accept group links on, mirroring `scheme` in app.config.ts.
 *
 * The dev variant ships `charadev` so it can sit alongside a production
 * install, and links minted by that build — push payloads, homescreen widget
 * taps — carry the dev scheme. Matching only `chara://` silently dropped all
 * of them, in exactly the build we test in.
 *
 * Kept as literals rather than read from `expo-constants`: this classifier is
 * deliberately dependency-free so it stays trivially testable, and the two
 * variants are fixed by app.config.ts anyway. Keep in sync if `scheme` changes.
 */
const ACCEPTED_SCHEMES = ['chara', 'charadev'];

export type GroupDeepLinkIntent =
  /** URL was empty / not a group deep link / not recognised. */
  | { kind: 'ignore' }
  /** Looked like a group link but the path/server is unparseable. */
  | { kind: 'malformed' }
  /** Accounts blob hasn't finished loading; caller should retry later. */
  | { kind: 'not_loaded' }
  /** Group link points at a server the user isn't signed into. */
  | { kind: 'unknown_server'; serverUrl: string }
  /** Safe to navigate. `target` selects a sub-screen (e.g. a settle-up
   *  reminder deep-links to the group's settle screen, the homescreen
   *  widget's shortcut to add-expense); undefined = group home. */
  | {
      kind: 'navigate';
      serverUrl: string;
      groupId: string;
      target?: 'settle' | 'add-expense';
    };

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
  const scheme = ACCEPTED_SCHEMES.find((s) => lower.startsWith(`${s}://groups/`));
  if (!scheme) return { kind: 'ignore' };

  if (!deps.isLoaded) return { kind: 'not_loaded' };

  // Strip scheme and any query/fragment, then split.
  const withoutScheme = url.slice(`${scheme}://`.length);
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

  // Optional sub-screen, e.g. chara://groups/<server>/<groupId>/settle.
  // Unrecognised values fall back to the group home rather than being
  // forwarded as a route fragment.
  const target =
    parts[3] === 'settle' || parts[3] === 'add-expense'
      ? (parts[3] as 'settle' | 'add-expense')
      : undefined;

  return { kind: 'navigate', serverUrl: normalized, groupId, target };
}

/**
 * How much trust a magic-link verify deep link's `server` param has earned.
 *
 *   known   — we already hold an account for it; adopting a token for it is
 *             the ordinary same-device sign-in / reauth case.
 *   hosted  — Chara Cloud (or whatever `hostedUrl` this build ships), which
 *             first-launch sign-in targets anyway. Also the verdict when no
 *             `server` param was supplied at all, since the screen defaults
 *             to the hosted URL.
 *   unknown — a server the user has never signed into. Verifying against it
 *             would persist an account and fan the device's Expo push token
 *             out to an attacker-chosen host, so the screen must ask first.
 *   invalid — not a usable server identity at all; drop the link.
 *
 * Pure so the decision is unit-testable away from the sign-in screen; the
 * screen only maps the verdict onto a prompt / navigation.
 */
export type VerifyTarget = 'known' | 'hosted' | 'unknown' | 'invalid';

export function classifyVerifyTarget(
  serverUrl: string | null | undefined,
  knownServerUrls: string[],
  hostedUrl: string,
): VerifyTarget {
  if (!serverUrl) return 'hosted';

  const normalized = normalizeServerUrl(serverUrl);
  if (typeof normalized !== 'string') return 'invalid';

  if (knownServerUrls.includes(normalized)) return 'known';

  const hosted = normalizeServerUrl(hostedUrl);
  if (typeof hosted === 'string' && hosted === normalized) return 'hosted';

  return 'unknown';
}
