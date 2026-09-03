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

  const hosted = normalizeServerUrl(deps.hostedUrl);
  if (typeof hosted !== 'string') return { kind: 'malformed' };
  if (!deps.accounts.some((a) => a.serverUrl === hosted)) return { kind: 'no_account' };

  return { kind: 'navigate', serverUrl: hosted, period: parts[1] };
}
