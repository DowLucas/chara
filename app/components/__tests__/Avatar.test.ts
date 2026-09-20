/**
 * `avatarSourceKey` decides when <Avatar> retries a previously-failed image.
 *
 * The bug it fixes: <Avatar> latched `failed = true` on any onError and only
 * cleared it when `source.uri` changed. Avatar URIs are stable (member
 * payloads carry no `avatar_updated_at` cache-buster), so a load that failed
 * because the bearer token was missing or expired — the token is baked into
 * `source.headers` at render time, and the native image loader has no 401
 * refresh-and-replay path like `request()` does — showed initials forever,
 * even after the account store hydrated or the token was refreshed.
 *
 * Keying the reset on the Authorization header as well as the URI means a
 * token arriving (cold-launch hydration) or rotating (silent refresh) counts
 * as a new attempt.
 *
 * Repo convention: @testing-library/react-native is intentionally absent, so
 * the decision logic is tested as a pure helper (see DeleteGroupModal.test).
 */

import { avatarSourceKey } from '../Avatar.helpers';

const URI = 'https://api.example.com/api/users/u1/avatar';

describe('avatarSourceKey', () => {
  it('is null when there is nothing to load', () => {
    expect(avatarSourceKey(null)).toBeNull();
    expect(avatarSourceKey(undefined)).toBeNull();
    expect(avatarSourceKey({})).toBeNull();
  });

  it('is stable across re-renders of the same authenticated source', () => {
    const a = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t1' } });
    const b = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t1' } });
    expect(a).toBe(b);
  });

  it('changes when the URI changes', () => {
    expect(avatarSourceKey({ uri: URI })).not.toBe(
      avatarSourceKey({ uri: 'https://api.example.com/api/users/u2/avatar' }),
    );
  });

  it('changes when a token arrives for the same URI (cold-launch hydration)', () => {
    const before = avatarSourceKey({ uri: URI });
    const after = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t1' } });
    expect(after).not.toBe(before);
  });

  it('changes when the token rotates for the same URI (silent refresh)', () => {
    const before = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t1' } });
    const after = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t2' } });
    expect(after).not.toBe(before);
  });

  it('ignores headers other than Authorization — they do not affect the load', () => {
    const a = avatarSourceKey({ uri: URI, headers: { Authorization: 'Bearer t1' } });
    const b = avatarSourceKey({
      uri: URI,
      headers: { Authorization: 'Bearer t1', 'X-Trace': 'abc' },
    });
    expect(a).toBe(b);
  });

  it('does not let two distinct sources fold into the same key', () => {
    // Guards a naive `uri + token` concatenation.
    expect(avatarSourceKey({ uri: 'https://x/a', headers: { Authorization: 'b' } })).not.toBe(
      avatarSourceKey({ uri: 'https://x/a\u0000b' }),
    );
  });
});
