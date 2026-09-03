/**
 * Pure classifier for the `chara://summary/<period>` deep link the monthly
 * summary push carries.
 *
 * Unlike the group link, this one names no server. The feature is
 * hosted-only, so there is exactly one server it can mean — and a link that
 * cannot name a server cannot be crafted to point the app at an attacker's
 * host, which is the whole risk the group classifier has to work to close.
 * The trade-off is that the classifier has to resolve the account itself,
 * and refuse when the user holds none on the hosted server.
 */

import type { Account } from './accounts-store';
import { normalizeServerUrl } from './server-url';

/** Mirrors `scheme` in app.config.ts — see the note in deep-link.ts. */
const ACCEPTED_SCHEMES = ['chara', 'charadev'];

/** A calendar month, and nothing else. The value is interpolated into an
 *  API query, so it is validated at the edge rather than downstream. */
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type SummaryDeepLinkIntent =
  /** Not a summary link. */
  | { kind: 'ignore' }
  /** A summary link whose period is unusable. */
  | { kind: 'malformed' }
  /** Accounts blob hasn't finished loading; caller should retry later. */
  | { kind: 'not_loaded' }
  /** No account on the hosted server, so there is no summary to open. */
  | { kind: 'no_account' }
  /** Safe to navigate. */
  | { kind: 'navigate'; serverUrl: string; period: string };

interface ClassifySummaryDeps {
  accounts: Account[];
  isLoaded: boolean;
  /** The hosted server this build talks to (`legacyHostedUrl()`). */
  hostedUrl: string;
}

export function classifySummaryDeepLink(
  url: string | null | undefined,
  deps: ClassifySummaryDeps,
): SummaryDeepLinkIntent {
  if (!url) return { kind: 'ignore' };
  const lower = url.toLowerCase();
  const scheme = ACCEPTED_SCHEMES.find((s) => lower.startsWith(`${s}://summary/`));
  if (!scheme) return { kind: 'ignore' };

  if (!deps.isLoaded) return { kind: 'not_loaded' };

  const [path] = url.slice(`${scheme}://`.length).split(/[?#]/);
  const parts = path.split('/').filter((p) => p.length > 0);
  // Exactly ['summary', '<period>']. A third segment means someone tried to
  // give the link a shape it does not have.
  if (parts.length !== 2 || !PERIOD_RE.test(parts[1])) return { kind: 'malformed' };

  const period = parts[1];

  // Prefer the hosted account: in production that is the only server the
  // feature exists on, so this is the exact answer.
  const hosted = normalizeServerUrl(deps.hostedUrl);
  if (typeof hosted === 'string' && deps.accounts.some((a) => a.serverUrl === hosted)) {
    return { kind: 'navigate', serverUrl: hosted, period };
  }

  // Otherwise fall back to the sole account. Two cases reach here and both
  // are unambiguous: a dev build whose hostedUrl does not even normalize
  // (Metro over Tailscale gives http://100.x, and 100.64.0.0/10 is not in
  // normalizeServerUrl's private-http allowlist), and a user signed into one
  // server that is not the hosted constant. Returning `malformed` there made
  // the notification tap do nothing at all.
  //
  // This is not a hole: the link names no server, and the candidates are
  // only ever servers the user already signed into. The attack the
  // server-less shape closes — pointing the app at a host of the attacker's
  // choosing — stays closed, because nothing here reads a server from the URL.
  if (deps.accounts.length === 1) {
    return { kind: 'navigate', serverUrl: deps.accounts[0].serverUrl, period };
  }

  // Several accounts and no hosted match: nothing in the link says which
  // server sent the push, and guessing would open another server's month.
  return { kind: 'no_account' };
}
