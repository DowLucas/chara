/** Identity of an avatar image load: the URI *and* the credential it is
 *  fetched with.
 *
 *  <Avatar> falls back to initials once a load errors and only re-attempts
 *  when this key changes. The Authorization header belongs in the key
 *  because the bearer token is baked into the `<Image>` source at render
 *  time and the native image loader — unlike `request()` — has no
 *  refresh-and-replay on 401. A token that arrives after the account store
 *  hydrates, or one rotated by a silent refresh, is a genuinely new attempt;
 *  the URI alone never changes, so keying on it would strand the avatar on
 *  initials for the lifetime of the screen.
 *
 *  Returns null when there is nothing to load. */
export function avatarSourceKey(
  source: { uri?: string; headers?: Record<string, string> } | null | undefined,
): string | null {
  if (!source?.uri) return null;
  // JSON-encoded tuple rather than concatenation: a URI is free-form, so no
  // delimiter is safe from collision.
  return JSON.stringify([source.uri, source.headers?.Authorization ?? null]);
}
