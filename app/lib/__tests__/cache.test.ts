import {
  cacheKey,
  parseCacheKey,
  readCache,
  writeCache,
  deleteCache,
  evictServer,
} from '../cache';

// In-memory AsyncStorage mock. The real module ships an `__esModule: true`
// default export, but our cache module imports the default, so we mirror
// that shape.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      getAllKeys: jest.fn(async () => Array.from(store.keys())),
      multiRemove: jest.fn(async (keys: string[]) => {
        for (const k of keys) store.delete(k);
      }),
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

beforeEach(() => {
  (AsyncStorage.__store as Map<string, string>).clear();
  jest.clearAllMocks();
});

describe('cacheKey / parseCacheKey', () => {
  it('produces a deterministic string for the same input', () => {
    const k = { serverUrl: 'https://api.chara.app', userId: 'u1', endpoint: 'groups' };
    expect(cacheKey(k)).toBe(cacheKey(k));
  });

  it('embeds the v1 prefix', () => {
    const s = cacheKey({ serverUrl: 'https://x', userId: 'u', endpoint: 'e' });
    expect(s.startsWith('chara.cache.v1::')).toBe(true);
  });

  it('round-trips through parseCacheKey', () => {
    const original = {
      serverUrl: 'https://api.chara.app',
      userId: 'user-123',
      endpoint: 'balances',
    };
    const parsed = parseCacheKey(cacheKey(original));
    expect(parsed).toEqual(original);
  });

  it('round-trips serverUrls with special chars (port, colons)', () => {
    const original = {
      serverUrl: 'http://localhost:8080',
      userId: 'u',
      endpoint: 'groups',
    };
    expect(parseCacheKey(cacheKey(original))).toEqual(original);
  });

  it('round-trips userIds containing colons and slashes', () => {
    const original = {
      serverUrl: 'https://api.chara.app',
      userId: 'weird::id/with:bits',
      endpoint: 'groups',
    };
    expect(parseCacheKey(cacheKey(original))).toEqual(original);
  });

  it('returns null for a string that is not a cache key', () => {
    expect(parseCacheKey('totally unrelated')).toBeNull();
    expect(parseCacheKey('chara.cache.v1::only-one-part')).toBeNull();
    expect(parseCacheKey('')).toBeNull();
  });

  it('returns null for a future cache version', () => {
    expect(parseCacheKey('chara.cache.v2::a::b::c')).toBeNull();
  });
});

describe('readCache', () => {
  it('returns null for a never-written key', async () => {
    const r = await readCache({
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    });
    expect(r).toBeNull();
  });

  it('returns null and self-heals when stored JSON is corrupt', async () => {
    const k = {
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    };
    await AsyncStorage.setItem(cacheKey(k), '{not valid json');

    const r = await readCache(k);
    expect(r).toBeNull();
    expect(AsyncStorage.__store.has(cacheKey(k))).toBe(false);
  });
});

describe('writeCache + readCache', () => {
  it('round-trips a value with a storedAt timestamp', async () => {
    const k = {
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    };
    const value = { groups: [{ id: 'g1', name: 'Trip' }] };
    await writeCache(k, value);

    const r = await readCache<typeof value>(k);
    expect(r).not.toBeNull();
    expect(r!.value).toEqual(value);
    expect(typeof r!.storedAt).toBe('string');
    // ISO 8601 sanity check
    expect(Number.isNaN(Date.parse(r!.storedAt))).toBe(false);
  });

  it('overwrites a previous entry', async () => {
    const k = {
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    };
    await writeCache(k, { v: 1 });
    await writeCache(k, { v: 2 });

    const r = await readCache<{ v: number }>(k);
    expect(r!.value).toEqual({ v: 2 });
  });
});

describe('deleteCache', () => {
  it('removes a specific entry without affecting siblings', async () => {
    const a = {
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    };
    const b = {
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'balances',
    };
    await writeCache(a, { name: 'a' });
    await writeCache(b, { name: 'b' });

    await deleteCache(a);

    expect(await readCache(a)).toBeNull();
    const rb = await readCache<{ name: string }>(b);
    expect(rb!.value).toEqual({ name: 'b' });
  });

  it('is a no-op for a missing key', async () => {
    await expect(
      deleteCache({
        serverUrl: 'https://api.chara.app',
        userId: 'u',
        endpoint: 'nope',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('evictServer', () => {
  it('removes only entries matching the given serverUrl', async () => {
    const serverA = 'https://api.chara.app';
    const serverB = 'https://other.example';

    await writeCache({ serverUrl: serverA, userId: 'u1', endpoint: 'groups' }, { a: 1 });
    await writeCache({ serverUrl: serverA, userId: 'u2', endpoint: 'balances' }, { a: 2 });
    await writeCache({ serverUrl: serverB, userId: 'u1', endpoint: 'groups' }, { b: 1 });

    await evictServer(serverA);

    expect(
      await readCache({ serverUrl: serverA, userId: 'u1', endpoint: 'groups' }),
    ).toBeNull();
    expect(
      await readCache({ serverUrl: serverA, userId: 'u2', endpoint: 'balances' }),
    ).toBeNull();

    const survivor = await readCache<{ b: number }>({
      serverUrl: serverB,
      userId: 'u1',
      endpoint: 'groups',
    });
    expect(survivor!.value).toEqual({ b: 1 });
  });

  it('does not touch unrelated AsyncStorage keys', async () => {
    await AsyncStorage.setItem('some.other.app.key', 'preserve me');
    await writeCache(
      { serverUrl: 'https://api.chara.app', userId: 'u', endpoint: 'groups' },
      { v: 1 },
    );

    await evictServer('https://api.chara.app');

    expect(await AsyncStorage.getItem('some.other.app.key')).toBe('preserve me');
  });

  it('is a no-op when nothing matches', async () => {
    await writeCache(
      { serverUrl: 'https://api.chara.app', userId: 'u', endpoint: 'groups' },
      { v: 1 },
    );

    await expect(evictServer('https://nothing.here')).resolves.toBeUndefined();

    // Existing entry still intact.
    const r = await readCache<{ v: number }>({
      serverUrl: 'https://api.chara.app',
      userId: 'u',
      endpoint: 'groups',
    });
    expect(r!.value).toEqual({ v: 1 });
  });

  it('is a no-op when the cache is empty', async () => {
    await expect(evictServer('https://api.chara.app')).resolves.toBeUndefined();
  });

  it('distinguishes servers that share a URL prefix', async () => {
    // Without urlencoding the serverUrl, "https://api.chara.app" would be a
    // prefix of "https://api.chara.app.evil.example" and naive
    // string-startsWith eviction would over-delete.
    const target = 'https://api.chara.app';
    const lookalike = 'https://api.chara.app.evil.example';

    await writeCache({ serverUrl: target, userId: 'u', endpoint: 'groups' }, { v: 1 });
    await writeCache(
      { serverUrl: lookalike, userId: 'u', endpoint: 'groups' },
      { v: 2 },
    );

    await evictServer(target);

    expect(
      await readCache({ serverUrl: target, userId: 'u', endpoint: 'groups' }),
    ).toBeNull();
    const survivor = await readCache<{ v: number }>({
      serverUrl: lookalike,
      userId: 'u',
      endpoint: 'groups',
    });
    expect(survivor!.value).toEqual({ v: 2 });
  });
});
