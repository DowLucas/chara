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
  getPinnedGroupKeys,
  groupKey,
  isGroupPinned,
  pinGroup,
  togglePinnedGroup,
  unpinGroup,
} from '../pinned-groups';

const KEY_PINNED_GROUPS = 'chara.pinnedGroups';

beforeEach(() => {
  store.clear();
});

describe('pinned-groups', () => {
  it('groupKey builds the same composite-key shape used for row keys elsewhere', () => {
    expect(groupKey('https://a.example', 'grp_1')).toBe('https://a.example::grp_1');
  });

  it('getPinnedGroupKeys returns an empty array when nothing is stored', async () => {
    expect(await getPinnedGroupKeys()).toEqual([]);
  });

  it('pinGroup adds the composite key and isGroupPinned reflects it', async () => {
    await pinGroup('https://a.example', 'grp_1');

    expect(await getPinnedGroupKeys()).toEqual(['https://a.example::grp_1']);
    expect(await isGroupPinned('https://a.example', 'grp_1')).toBe(true);
    expect(await isGroupPinned('https://a.example', 'grp_2')).toBe(false);
  });

  it('pinGroup is idempotent — pinning twice does not duplicate the key', async () => {
    await pinGroup('https://a.example', 'grp_1');
    await pinGroup('https://a.example', 'grp_1');

    expect(await getPinnedGroupKeys()).toEqual(['https://a.example::grp_1']);
  });

  it('pinning groups on different servers keeps both, keyed separately', async () => {
    await pinGroup('https://a.example', 'grp_1');
    await pinGroup('https://b.example', 'grp_1');

    const keys = await getPinnedGroupKeys();
    expect(keys.sort()).toEqual(['https://a.example::grp_1', 'https://b.example::grp_1'].sort());
  });

  it('unpinGroup removes the key', async () => {
    await pinGroup('https://a.example', 'grp_1');
    await pinGroup('https://a.example', 'grp_2');

    await unpinGroup('https://a.example', 'grp_1');

    expect(await getPinnedGroupKeys()).toEqual(['https://a.example::grp_2']);
    expect(await isGroupPinned('https://a.example', 'grp_1')).toBe(false);
  });

  it('unpinGroup on a group that was never pinned is a harmless no-op', async () => {
    await pinGroup('https://a.example', 'grp_1');

    await unpinGroup('https://a.example', 'grp_never_pinned');

    expect(await getPinnedGroupKeys()).toEqual(['https://a.example::grp_1']);
  });

  it('togglePinnedGroup pins when unpinned and returns true', async () => {
    const result = await togglePinnedGroup('https://a.example', 'grp_1');
    expect(result).toBe(true);
    expect(await isGroupPinned('https://a.example', 'grp_1')).toBe(true);
  });

  it('togglePinnedGroup unpins when pinned and returns false', async () => {
    await pinGroup('https://a.example', 'grp_1');

    const result = await togglePinnedGroup('https://a.example', 'grp_1');
    expect(result).toBe(false);
    expect(await isGroupPinned('https://a.example', 'grp_1')).toBe(false);
  });

  it('recovers gracefully from malformed stored JSON', async () => {
    store.set(KEY_PINNED_GROUPS, '{not valid json');
    expect(await getPinnedGroupKeys()).toEqual([]);
  });

  it('recovers gracefully from a stored value that is not an array', async () => {
    store.set(KEY_PINNED_GROUPS, JSON.stringify({ oops: true }));
    expect(await getPinnedGroupKeys()).toEqual([]);
  });
});
