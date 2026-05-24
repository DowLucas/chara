/**
 * Protocol-version constants and bidirectional compatibility check for
 * the multi-server accounts feature.
 *
 * See `docs/superpowers/specs/2026-05-22-multi-server-accounts-design.md`
 * §9 for the authoritative rules. Every authenticated request carries
 * `PROTOCOL_HEADER: APP_PROTOCOL_VERSION`. The server middleware compares
 * that against its own MIN_APP_PROTOCOL / MAX_APP_PROTOCOL range and may
 * respond `426 Upgrade Required`. The app additionally runs
 * `checkProtocolCompat` on the discovery payload so it can refuse to
 * sign in against an incompatible server in the first place.
 */

/** The single protocol the current app build speaks. */
// v2: recurring expenses (additive: 8 new endpoints + source_kind/source_id
// on expense responses).
export const APP_PROTOCOL_VERSION: number = 2;

/** Lower bound of the server-protocol range this app supports. */
export const MIN_SERVER_PROTOCOL: number = 1;

/** Upper bound of the server-protocol range this app supports. */
export const MAX_SERVER_PROTOCOL: number = 2;

/** Request header carrying APP_PROTOCOL_VERSION. */
export const PROTOCOL_HEADER = 'X-Chara-App-Protocol';

export type CompatResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'server_too_old' | 'server_too_new' | 'app_too_old' | 'app_too_new';
    };

export interface CompatArgs {
  /** Server's `PROTOCOL_VERSION` (its single advertised protocol). */
  serverProtocol: number;
  /** Server's `MIN_APP_PROTOCOL`. */
  serverMinApp: number;
  /** Server's `MAX_APP_PROTOCOL`. */
  serverMaxApp: number;
  /** Defaults to `APP_PROTOCOL_VERSION`. */
  appProtocol?: number;
  /** Defaults to `MIN_SERVER_PROTOCOL`. */
  appMinServer?: number;
  /** Defaults to `MAX_SERVER_PROTOCOL`. */
  appMaxServer?: number;
}

/**
 * Bidirectional protocol-compat check per spec §9. Returns `ok: true`
 * when both the server-side and app-side ranges accept the other end.
 *
 * On failure, the precedence is **server-side first** (would the server
 * 426 us?) then app-side. Rationale: the server-side check is what the
 * runtime will actually enforce on every request, so when both sides
 * disagree it's the more useful diagnostic to surface.
 */
export function checkProtocolCompat(args: CompatArgs): CompatResult {
  const appProtocol = args.appProtocol ?? APP_PROTOCOL_VERSION;
  const appMinServer = args.appMinServer ?? MIN_SERVER_PROTOCOL;
  const appMaxServer = args.appMaxServer ?? MAX_SERVER_PROTOCOL;

  // Server-side check first: what the runtime middleware would do.
  if (appProtocol < args.serverMinApp) {
    return { ok: false, reason: 'app_too_old' };
  }
  if (appProtocol > args.serverMaxApp) {
    return { ok: false, reason: 'app_too_new' };
  }

  // App-side check: refuse the connection from this end too.
  if (args.serverProtocol < appMinServer) {
    return { ok: false, reason: 'server_too_old' };
  }
  if (args.serverProtocol > appMaxServer) {
    return { ok: false, reason: 'server_too_new' };
  }

  return { ok: true };
}
