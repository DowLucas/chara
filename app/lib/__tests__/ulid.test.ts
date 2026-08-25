import { newUlid, CROCKFORD32 } from '../ulid';

// Deterministic randomness so the assertions below are stable. Real
// expo-crypto fills the buffer from the platform CSPRNG.
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(0xff),
}));

describe('newUlid', () => {
  it('is 26 Crockford base32 characters', () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
    for (const ch of id) expect(CROCKFORD32).toContain(ch);
  });

  // The backend validates with ulid.ParseStrict, which rejects the
  // ambiguous letters Crockford drops.
  it('never emits the letters Crockford excludes', () => {
    const id = newUlid();
    expect(id).not.toMatch(/[ILOU]/);
  });

  it('encodes the current time in the sortable prefix', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0);
    expect(newUlid().slice(0, 10)).toBe('0000000000');

    // 1 ms later must sort strictly after.
    jest.spyOn(Date, 'now').mockReturnValue(1);
    expect(newUlid().slice(0, 10)).toBe('0000000001');
    jest.restoreAllMocks();
  });

  it('sorts lexicographically by creation time', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const earlier = newUlid();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_001_000);
    const later = newUlid();
    expect(earlier < later).toBe(true);
    jest.restoreAllMocks();
  });
});
