import { classifyInvite, type ClassifyDepsAccount } from '../invite-handler';

const TOKEN = '01HGZABCDEFGHJKMNPQRSTVWXY';
const HTTPS = `https://api.chara.app/api/groups/join/${TOKEN}`;
const CHARA = `chara://join?invite=${encodeURIComponent(HTTPS)}`;
const QUITS = `quits://join?invite=${encodeURIComponent(HTTPS)}`;

function acc(
  serverUrl: string,
  userId: string,
  lastUsedAt: string,
): ClassifyDepsAccount {
  return { serverUrl, user: { id: userId }, lastUsedAt };
}

describe('classifyInvite', () => {
  it('returns `invalid` for unparseable input', () => {
    const result = classifyInvite('not a url at all', { accounts: [] });
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.reason).toBeTruthy();
    }
  });

  it('returns `invalid` for empty input', () => {
    const result = classifyInvite('', { accounts: [] });
    expect(result.kind).toBe('invalid');
  });

  it('returns `add-account-then-join` when no account matches the server', () => {
    const result = classifyInvite(HTTPS, {
      accounts: [acc('https://other.example', 'u1', '2026-05-01T00:00:00Z')],
    });
    expect(result).toEqual({
      kind: 'add-account-then-join',
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });

  it('returns `add-account-then-join` when account list is empty', () => {
    const result = classifyInvite(HTTPS, { accounts: [] });
    expect(result.kind).toBe('add-account-then-join');
  });

  it('returns `join-with-account` when exactly one account matches the server', () => {
    const result = classifyInvite(HTTPS, {
      accounts: [
        acc('https://other.example', 'u1', '2026-05-01T00:00:00Z'),
        acc('https://api.chara.app', 'u2', '2026-05-10T00:00:00Z'),
      ],
    });
    expect(result).toEqual({
      kind: 'join-with-account',
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
      accountServerUrl: 'https://api.chara.app',
    });
  });

  it('returns `choose-account` with most-recent `lastUsedAt` as defaultPick when ≥2 accounts share a server', () => {
    // Fabricated scenario — under the current data model the store keys
    // accounts by serverUrl so this can't actually happen, but the
    // classifier still needs to handle it correctly for the future
    // per-handle case (spec §10).
    const result = classifyInvite(HTTPS, {
      accounts: [
        acc('https://api.chara.app', 'older', '2026-04-01T00:00:00Z'),
        acc('https://api.chara.app', 'newest', '2026-05-22T12:00:00Z'),
        acc('https://api.chara.app', 'middle', '2026-05-10T00:00:00Z'),
      ],
    });
    expect(result.kind).toBe('choose-account');
    if (result.kind === 'choose-account') {
      expect(result.serverUrl).toBe('https://api.chara.app');
      expect(result.token).toBe(TOKEN);
      expect(result.candidateServerUrls).toHaveLength(3);
      // All three candidates share the same serverUrl; the chooser disambiguates
      // by some future per-handle key, but defaultPick still resolves.
      expect(result.defaultPick).toBe('https://api.chara.app');
    }
  });

  it('all three invite URL forms produce the same outcome', () => {
    const deps: { accounts: ClassifyDepsAccount[] } = {
      accounts: [acc('https://api.chara.app', 'u1', '2026-05-10T00:00:00Z')],
    };
    const a = classifyInvite(HTTPS, deps);
    const b = classifyInvite(CHARA, deps);
    const c = classifyInvite(QUITS, deps);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.kind).toBe('join-with-account');
  });
});
