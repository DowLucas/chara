// Mock expo-secure-store with an in-memory map so the module can be exercised
// without touching the device keychain. `failNextWrite` lets tests simulate
// a Keychain/Keystore write failure (e.g. storage full, per-item size cap).
const store = new Map<string, string>();
let failNextWrite = false;
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    if (failNextWrite) {
      failNextWrite = false;
      throw new Error('SecureStore write failed');
    }
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

import { groupAccentSwatches } from '../theme';
import {
  GROUP_COLORS_KEY,
  __resetForTests,
  clearOverride,
  fnv1a32,
  groupColorFor,
  hasOverride,
  hashSwatch,
  loadOverrides,
  overrideKey,
  setOverride,
  validateHex,
} from '../group-color';

beforeEach(async () => {
  store.clear();
  failNextWrite = false;
  __resetForTests();
});

describe('fnv1a32', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
  });

  it('produces different hashes for distinct inputs', () => {
    expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = fnv1a32('01KS8T2H44RKDCCGX58RR8PJ22');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('hashSwatch', () => {
  it('returns one of the 8 swatches', () => {
    const c = hashSwatch('any-group-id');
    expect(groupAccentSwatches).toContain(c);
  });

  it('is stable across calls', () => {
    expect(hashSwatch('grp-1')).toBe(hashSwatch('grp-1'));
  });

  it('distributes — at least 6 of the 8 swatches show up over 100 ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(hashSwatch(`group-${i}`));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

describe('overrideKey', () => {
  it('joins serverUrl and groupId with ::', () => {
    expect(overrideKey('https://srv', 'g1')).toBe('https://srv::g1');
  });
});

describe('validateHex', () => {
  it.each(['#000', '#FFFFFF', '#abc123', '#ABC', '#aBc1F0'])(
    'accepts %s',
    (v) => {
      expect(validateHex(v)).toBe(true);
    },
  );

  it.each(['', '#', '#GGG', '#12', '#1234567', 'red', 'FFFFFF'])(
    'rejects %s',
    (v) => {
      expect(validateHex(v)).toBe(false);
    },
  );
});

describe('groupColorFor', () => {
  it('returns the hash default when no override exists', async () => {
    await loadOverrides();
    const c = groupColorFor('https://srv', 'grp-x');
    expect(c).toBe(hashSwatch('grp-x'));
  });

  it('returns the override when one is set', async () => {
    await setOverride('https://srv', 'grp-x', '#123456');
    expect(groupColorFor('https://srv', 'grp-x')).toBe('#123456');
  });

  it('falls back to hash default after clearOverride', async () => {
    await setOverride('https://srv', 'grp-x', '#123456');
    await clearOverride('https://srv', 'grp-x');
    expect(groupColorFor('https://srv', 'grp-x')).toBe(hashSwatch('grp-x'));
  });

  it('keys overrides by both serverUrl and groupId', async () => {
    await setOverride('https://a', 'shared-id', '#aa0000');
    await setOverride('https://b', 'shared-id', '#00bb00');
    expect(groupColorFor('https://a', 'shared-id')).toBe('#aa0000');
    expect(groupColorFor('https://b', 'shared-id')).toBe('#00bb00');
  });
});

describe('persistence', () => {
  it('writes overrides into the SecureStore blob', async () => {
    await setOverride('https://srv', 'g', '#abcdef');
    const raw = store.get(GROUP_COLORS_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toEqual({ 'https://srv::g': '#abcdef' });
  });

  it('loads overrides from a pre-populated blob', async () => {
    store.set(
      GROUP_COLORS_KEY,
      JSON.stringify({ 'https://srv::g': '#feedab' }),
    );
    await loadOverrides();
    expect(groupColorFor('https://srv', 'g')).toBe('#feedab');
  });

  it('ignores a corrupt blob and falls back to defaults', async () => {
    store.set(GROUP_COLORS_KEY, 'not-json');
    await loadOverrides();
    expect(groupColorFor('https://srv', 'g')).toBe(hashSwatch('g'));
  });

  it('clearOverride deletes the key from the blob; deleting the last entry leaves the file consistent', async () => {
    await setOverride('https://srv', 'g', '#abcdef');
    await clearOverride('https://srv', 'g');
    const raw = store.get(GROUP_COLORS_KEY);
    if (raw) {
      expect(JSON.parse(raw)).toEqual({});
    }
  });
});

// A failed SecureStore write must not leave in-memory state ahead of disk —
// otherwise the picked color "sticks" for the rest of this session (the
// tap looked like it worked) but silently reverts on the next cold launch
// when loadOverrides() re-reads the stale blob. This is the mechanism
// behind "I picked a color but it's not there" reports.
describe('write-failure rollback', () => {
  it('setOverride rethrows and leaves no in-memory trace when persist fails', async () => {
    await loadOverrides();
    failNextWrite = true;

    await expect(setOverride('https://srv', 'g', '#abcdef')).rejects.toThrow();

    expect(groupColorFor('https://srv', 'g')).toBe(hashSwatch('g'));
    expect(hasOverride('https://srv', 'g')).toBe(false);
  });

  it('setOverride rolls back to the previous override when persist fails on an update', async () => {
    await setOverride('https://srv', 'g', '#111111');
    failNextWrite = true;

    await expect(setOverride('https://srv', 'g', '#222222')).rejects.toThrow();

    expect(groupColorFor('https://srv', 'g')).toBe('#111111');
  });

  it('clearOverride rolls back when persist fails, leaving the override intact', async () => {
    await setOverride('https://srv', 'g', '#abcdef');
    failNextWrite = true;

    await expect(clearOverride('https://srv', 'g')).rejects.toThrow();

    expect(groupColorFor('https://srv', 'g')).toBe('#abcdef');
  });

  it('a subsequent successful write after a failed one persists correctly', async () => {
    failNextWrite = true;
    await expect(setOverride('https://srv', 'g', '#111111')).rejects.toThrow();

    await setOverride('https://srv', 'g', '#222222');

    expect(groupColorFor('https://srv', 'g')).toBe('#222222');
    const raw = store.get(GROUP_COLORS_KEY);
    expect(JSON.parse(raw!)).toEqual({ 'https://srv::g': '#222222' });
  });
});
