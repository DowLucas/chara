/**
 * Tests for resolveSummaryServer — which linked server, if any, has a
 * monthly summary to show.
 *
 * The point of this module is that the answer comes from a LIVE
 * /.well-known/chara-instance read, not from the cached accounts blob.
 * `account.instance` is only ever written at sign-in, so a user who was
 * already signed in when the feature shipped would never see the entry
 * point — and on iOS the blob survives reinstall, so it would stay hidden.
 */

import { resolveSummaryServer } from '../summary-server';

const CLOUD = 'https://cloud.example';
const SELF = 'https://self.host';

function features(monthly_summary?: boolean) {
  return { features: monthly_summary === undefined ? {} : { monthly_summary } };
}

describe('resolveSummaryServer', () => {
  it('picks the server that advertises the feature', async () => {
    const got = await resolveSummaryServer(
      [{ serverUrl: SELF }, { serverUrl: CLOUD }],
      async (url) => (url === CLOUD ? features(true) : features(false)),
    );
    expect(got).toBe(CLOUD);
  });

  it('returns null when no server advertises it', async () => {
    const got = await resolveSummaryServer(
      [{ serverUrl: SELF }],
      async () => features(false),
    );
    expect(got).toBeNull();
  });

  // A backend predating the feature omits the flag entirely. This is the
  // case that matters most: it must read as unsupported, not as truthy.
  it('treats a missing flag as unsupported', async () => {
    const got = await resolveSummaryServer([{ serverUrl: SELF }], async () => features());
    expect(got).toBeNull();
  });

  it('returns null for no accounts', async () => {
    expect(await resolveSummaryServer([], async () => features(true))).toBeNull();
  });

  // One unreachable server must not hide a summary that another server has.
  // CLAUDE.md: never Promise.all across accounts.
  it('tolerates a server that fails to answer', async () => {
    const got = await resolveSummaryServer(
      [{ serverUrl: SELF }, { serverUrl: CLOUD }],
      async (url) => {
        if (url === SELF) throw new Error('offline');
        return features(true);
      },
    );
    expect(got).toBe(CLOUD);
  });

  it('returns null when every server fails', async () => {
    const got = await resolveSummaryServer([{ serverUrl: CLOUD }], async () => {
      throw new Error('offline');
    });
    expect(got).toBeNull();
  });

  // A malformed payload is a definitive negative, not a crash.
  it('survives a junk response', async () => {
    const got = await resolveSummaryServer(
      [{ serverUrl: CLOUD }],
      async () => null as unknown as { features: Record<string, boolean> },
    );
    expect(got).toBeNull();
  });

  // Order follows the account list, so the result is stable rather than
  // whichever server answered first.
  it('is stable when several servers advertise it', async () => {
    const probe = async () => features(true);
    expect(await resolveSummaryServer([{ serverUrl: SELF }, { serverUrl: CLOUD }], probe)).toBe(SELF);
    expect(await resolveSummaryServer([{ serverUrl: CLOUD }, { serverUrl: SELF }], probe)).toBe(CLOUD);
  });
});
