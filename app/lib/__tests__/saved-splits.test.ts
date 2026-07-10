const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

import {
  clearGroupDefaultSplit,
  loadGroupDefaultSplit,
  resolvePercentageBasisPoints,
  saveGroupDefaultSplit,
  savedSplitToPct,
} from '../saved-splits';

function member(id: string) {
  return { id } as { id: string };
}

beforeEach(() => {
  store.clear();
});

describe('resolvePercentageBasisPoints', () => {
  it('resolves an explicit two-way split to basis points', () => {
    expect(resolvePercentageBasisPoints(['a', 'b'], { a: '60', b: '40' })).toEqual({
      a: 6000,
      b: 4000,
    });
  });

  it('auto-fills the remainder for members with no locked percentage', () => {
    expect(resolvePercentageBasisPoints(['a', 'b'], { a: '60' })).toEqual({
      a: 6000,
      b: 4000,
    });
  });

  it('distributes evenly when nothing is locked (largest remainder first)', () => {
    expect(resolvePercentageBasisPoints(['a', 'b', 'c'], {})).toEqual({
      a: 3334,
      b: 3333,
      c: 3333,
    });
  });

  it('ignores locked values for members not in the included set', () => {
    expect(resolvePercentageBasisPoints(['a'], { a: '100', z: '50' })).toEqual({
      a: 10000,
    });
  });
});

describe('savedSplitToPct', () => {
  it('applies only when the saved member set exactly matches the roster', () => {
    const out = savedSplitToPct({ a: 6000, b: 4000 }, [member('a'), member('b')]);
    expect(out).toEqual({
      included: { a: true, b: true },
      pctByMember: { a: '60', b: '40' },
    });
  });

  it('renders fractional basis points as a decimal percent string', () => {
    const out = savedSplitToPct({ a: 3334, b: 3333, c: 3333 }, [
      member('a'),
      member('b'),
      member('c'),
    ]);
    expect(out?.pctByMember).toEqual({ a: '33.34', b: '33.33', c: '33.33' });
  });

  it('returns null when a member joined (roster grew)', () => {
    expect(
      savedSplitToPct({ a: 6000, b: 4000 }, [member('a'), member('b'), member('c')]),
    ).toBeNull();
  });

  it('returns null when a member left (roster shrank)', () => {
    expect(savedSplitToPct({ a: 6000, b: 4000 }, [member('a')])).toBeNull();
  });
});

describe('storage', () => {
  it('round-trips a saved split per (serverUrl, groupId)', async () => {
    await saveGroupDefaultSplit('https://a.example', 'g1', { a: 6000, b: 4000 });
    expect(await loadGroupDefaultSplit('https://a.example', 'g1')).toEqual({
      a: 6000,
      b: 4000,
    });
  });

  it('keeps splits for different groups/servers separate', async () => {
    await saveGroupDefaultSplit('https://a.example', 'g1', { a: 10000 });
    await saveGroupDefaultSplit('https://b.example', 'g1', { b: 10000 });
    expect(await loadGroupDefaultSplit('https://a.example', 'g1')).toEqual({ a: 10000 });
    expect(await loadGroupDefaultSplit('https://b.example', 'g1')).toEqual({ b: 10000 });
    expect(await loadGroupDefaultSplit('https://a.example', 'g2')).toBeNull();
  });

  it('clear removes a stored split', async () => {
    await saveGroupDefaultSplit('https://a.example', 'g1', { a: 10000 });
    await clearGroupDefaultSplit('https://a.example', 'g1');
    expect(await loadGroupDefaultSplit('https://a.example', 'g1')).toBeNull();
  });

  it('recovers gracefully from malformed stored JSON', async () => {
    store.set('chara.savedSplits', '{not json');
    expect(await loadGroupDefaultSplit('https://a.example', 'g1')).toBeNull();
  });
});
