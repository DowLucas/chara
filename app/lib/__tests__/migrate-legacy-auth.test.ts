import {
  ACCOUNTS_KEY,
  LEGACY_TOKEN_KEY,
  migrateLegacyAuth,
  type MigrationDeps,
  type MigrationStorage,
} from '../migrate-legacy-auth';

const LEGACY_URL = 'https://api.chara.app';
const FIXED_NOW = '2026-05-22T10:00:00Z';

/**
 * In-memory MigrationStorage for tests.
 * `failNextSetItem` lets us simulate a crash mid-write.
 */
function makeStorage(initial: Record<string, string> = {}): MigrationStorage & {
  inspect(): Record<string, string>;
  failNextSetItem(): void;
} {
  const store = new Map<string, string>(Object.entries(initial));
  let failNext = false;
  return {
    async getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async setItem(key, value) {
      if (failNext) {
        failNext = false;
        throw new Error('simulated write failure');
      }
      store.set(key, value);
    },
    async deleteItem(key) {
      store.delete(key);
    },
    inspect() {
      return Object.fromEntries(store.entries());
    },
    failNextSetItem() {
      failNext = true;
    },
  };
}

function makeDeps(storage: MigrationStorage): MigrationDeps {
  return {
    storage,
    legacyHostedUrl: () => LEGACY_URL,
    nowIso: () => FIXED_NOW,
  };
}

describe('migrateLegacyAuth — no legacy token', () => {
  it('returns no_legacy_token when neither key exists', async () => {
    const storage = makeStorage();
    const result = await migrateLegacyAuth(makeDeps(storage));
    expect(result).toEqual({ kind: 'no_legacy_token' });
    expect(storage.inspect()).toEqual({});
  });
});

describe('migrateLegacyAuth — happy path migration', () => {
  it('migrates a legacy token into a one-entry accounts blob and deletes the legacy key', async () => {
    const storage = makeStorage({ [LEGACY_TOKEN_KEY]: 'legacy-jwt' });
    const result = await migrateLegacyAuth(makeDeps(storage));
    expect(result).toEqual({ kind: 'migrated', serverUrl: LEGACY_URL });

    const snap = storage.inspect();
    expect(snap[LEGACY_TOKEN_KEY]).toBeUndefined();
    expect(snap[ACCOUNTS_KEY]).toBeDefined();

    const blob = JSON.parse(snap[ACCOUNTS_KEY]);
    expect(blob.version).toBe(1);
    expect(blob.accounts).toHaveLength(1);
    expect(blob.defaultServerUrl).toBe(LEGACY_URL);
    expect(blob.lastUsedCreateServerUrl).toBe(LEGACY_URL);

    const acct = blob.accounts[0];
    expect(acct.serverUrl).toBe(LEGACY_URL);
    expect(acct.token).toBe('legacy-jwt');
    expect(acct.instance).toBeNull();
    expect(acct.addedAt).toBe(FIXED_NOW);
    expect(acct.lastUsedAt).toBe(FIXED_NOW);
    expect(acct.user).toEqual({
      id: '',
      email: '',
      name: '',
      phone: '',
      avatar_url: null,
    });
  });
});

describe('migrateLegacyAuth — already_migrated', () => {
  it('returns already_migrated when blob exists and no legacy key present', async () => {
    const existingBlob = JSON.stringify({
      version: 1,
      accounts: [{ serverUrl: 'https://other.example', token: 'x' }],
      defaultServerUrl: 'https://other.example',
      lastUsedCreateServerUrl: 'https://other.example',
    });
    const storage = makeStorage({ [ACCOUNTS_KEY]: existingBlob });

    const result = await migrateLegacyAuth(makeDeps(storage));
    expect(result).toEqual({ kind: 'already_migrated' });

    // Blob must be untouched.
    expect(storage.inspect()[ACCOUNTS_KEY]).toBe(existingBlob);
  });

  it('cleans up a leftover legacy token if blob already exists (partial prior run)', async () => {
    const existingBlob = JSON.stringify({
      version: 1,
      accounts: [{ serverUrl: 'https://other.example', token: 'x' }],
      defaultServerUrl: 'https://other.example',
      lastUsedCreateServerUrl: 'https://other.example',
    });
    const storage = makeStorage({
      [ACCOUNTS_KEY]: existingBlob,
      [LEGACY_TOKEN_KEY]: 'leftover-jwt',
    });

    const result = await migrateLegacyAuth(makeDeps(storage));
    expect(result).toEqual({ kind: 'already_migrated' });

    const snap = storage.inspect();
    expect(snap[LEGACY_TOKEN_KEY]).toBeUndefined();
    expect(snap[ACCOUNTS_KEY]).toBe(existingBlob);
  });
});

describe('migrateLegacyAuth — idempotency', () => {
  it('two consecutive calls yield migrated then already_migrated, and storage settles', async () => {
    const storage = makeStorage({ [LEGACY_TOKEN_KEY]: 'legacy-jwt' });
    const deps = makeDeps(storage);

    const first = await migrateLegacyAuth(deps);
    expect(first).toEqual({ kind: 'migrated', serverUrl: LEGACY_URL });

    const blobAfterFirst = storage.inspect()[ACCOUNTS_KEY];

    const second = await migrateLegacyAuth(deps);
    expect(second).toEqual({ kind: 'already_migrated' });

    // Blob unchanged between calls; legacy key still absent.
    const snap = storage.inspect();
    expect(snap[ACCOUNTS_KEY]).toBe(blobAfterFirst);
    expect(snap[LEGACY_TOKEN_KEY]).toBeUndefined();
  });
});

describe('migrateLegacyAuth — crash safety: write succeeded, delete crashed', () => {
  it('short-circuits on second boot when blob exists; even if legacy key were left over it gets cleaned', async () => {
    const storage = makeStorage({ [LEGACY_TOKEN_KEY]: 'legacy-jwt' });
    const deps = makeDeps(storage);

    // First boot: full migration succeeds.
    await migrateLegacyAuth(deps);
    const blobAfterMigration = storage.inspect()[ACCOUNTS_KEY];

    // Manually re-introduce a stray legacy key to simulate a prior crash
    // between "blob written" and "legacy key deleted".
    await storage.setItem(LEGACY_TOKEN_KEY, 'legacy-jwt');

    // Next boot: step 1 short-circuits and cleans up the stray key.
    const result = await migrateLegacyAuth(deps);
    expect(result).toEqual({ kind: 'already_migrated' });

    const snap = storage.inspect();
    expect(snap[LEGACY_TOKEN_KEY]).toBeUndefined();
    expect(snap[ACCOUNTS_KEY]).toBe(blobAfterMigration);
  });
});

describe('migrateLegacyAuth — crash safety: write itself crashed', () => {
  it('retries on next call and leaves the legacy token untouched until the successful write completes', async () => {
    const storage = makeStorage({ [LEGACY_TOKEN_KEY]: 'legacy-jwt' });
    storage.failNextSetItem();
    const deps = makeDeps(storage);

    // First attempt: setItem throws, helper propagates, legacy key untouched.
    await expect(migrateLegacyAuth(deps)).rejects.toThrow('simulated write failure');

    let snap = storage.inspect();
    expect(snap[LEGACY_TOKEN_KEY]).toBe('legacy-jwt');
    expect(snap[ACCOUNTS_KEY]).toBeUndefined();

    // Next boot: no chara.accounts written, so step 1 falls through to step 2/3.
    const result = await migrateLegacyAuth(deps);
    expect(result).toEqual({ kind: 'migrated', serverUrl: LEGACY_URL });

    snap = storage.inspect();
    expect(snap[LEGACY_TOKEN_KEY]).toBeUndefined();
    expect(snap[ACCOUNTS_KEY]).toBeDefined();
  });
});

describe('migrateLegacyAuth — blob structure assertions', () => {
  it('produces a blob matching the spec §5 shape with placeholder user fields', async () => {
    const storage = makeStorage({ [LEGACY_TOKEN_KEY]: 'tok' });
    await migrateLegacyAuth(makeDeps(storage));
    const blob = JSON.parse(storage.inspect()[ACCOUNTS_KEY]);

    expect(blob.version).toBe(1);
    expect(blob.accounts).toHaveLength(1);
    expect(blob.defaultServerUrl).toBe(blob.lastUsedCreateServerUrl);
    expect(blob.defaultServerUrl).toBe(blob.accounts[0].serverUrl);

    const u = blob.accounts[0].user;
    expect(u.id).toBe('');
    expect(u.email).toBe('');
    expect(u.name).toBe('');
    expect(u.phone).toBe('');
    expect(u.avatar_url).toBeNull();

    expect(blob.accounts[0].instance).toBeNull();
  });
});
