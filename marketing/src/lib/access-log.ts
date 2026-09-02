/**
 * One structured JSON line per page request, written to stdout.
 *
 * The container's stdout is already shipped to Loki by the homelab's Alloy
 * agent (it discovers every container), so this needs no tracking script, no
 * cookies and no third party. It is the authoritative traffic count: it sees
 * every request, including the ones `lib/analytics.ts` never runs for (bots,
 * blockers, JS off), so it will always report more than PostHog does.
 *
 * Visitors are counted by an opaque id: SHA-256 over the client IP plus a salt
 * generated fresh at process start. Raw IPs are never written, and the ids
 * cannot be correlated across restarts or back to an address.
 */

const SALT = crypto.randomUUID();

/** Assets are requested dozens of times per page view and answer no question worth the log volume. */
const STATIC_PATH = /^\/(assets|_build|_server|favicon|robots\.txt|llms\.txt|sitemap)/;

const encoder = new TextEncoder();

async function visitorId(ip: string | null): Promise<string | undefined> {
  if (!ip) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${SALT}:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function logAccess(request: Request, status: number, startedAt: number): void {
  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    return;
  }
  if (STATIC_PATH.test(path)) return;

  const headers = request.headers;
  const durationMs = Math.round(performance.now() - startedAt);

  // Floating on purpose: hashing must not delay the response.
  void visitorId(headers.get("cf-connecting-ip")).then((visitor) => {
    console.log(
      JSON.stringify({
        log: "access",
        ts: new Date().toISOString(),
        method: request.method,
        path,
        status,
        duration_ms: durationMs,
        referer: headers.get("referer") ?? undefined,
        user_agent: headers.get("user-agent") ?? undefined,
        country: headers.get("cf-ipcountry") ?? undefined,
        visitor,
      }),
    );
  });
}
