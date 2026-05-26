/**
 * The auth/accounts blob is JWT-bearing. Persisting it with the default
 * keychainAccessible (AFTER_FIRST_UNLOCK) lets it ride iCloud backups and
 * be restored onto a different device. blob-storage must pin every write
 * to WHEN_UNLOCKED_THIS_DEVICE_ONLY on native, and pass nothing extra on
 * web (the option is iOS-only and the web path uses localStorage).
 */

const setItemAsync = jest.fn(async (_k: string, _v: string, _opts?: unknown) => {});
const getItemAsync = jest.fn(async (_k: string) => null);
const deleteItemAsync = jest.fn(async (_k: string) => {});

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
  setItemAsync: (...args: unknown[]) => (setItemAsync as any)(...args),
  getItemAsync: (...args: unknown[]) => (getItemAsync as any)(...args),
  deleteItemAsync: (...args: unknown[]) => (deleteItemAsync as any)(...args),
}));

describe('blobStorage (native)', () => {
  beforeEach(() => {
    jest.resetModules();
    setItemAsync.mockClear();
    getItemAsync.mockClear();
    deleteItemAsync.mockClear();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
  });

  afterEach(() => {
    jest.dontMock('react-native');
  });

  it('writes with WHEN_UNLOCKED_THIS_DEVICE_ONLY so JWTs cannot ride iCloud backups', async () => {
    const { blobStorage } = await import('../blob-storage');
    await blobStorage.setItem('chara.accounts', '{"some":"blob"}');
    expect(setItemAsync).toHaveBeenCalledTimes(1);
    expect(setItemAsync).toHaveBeenCalledWith(
      'chara.accounts',
      '{"some":"blob"}',
      { keychainAccessible: 'when-unlocked-this-device-only' },
    );
  });
});

describe('blobStorage (web)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    jest.resetModules();
    setItemAsync.mockClear();
    store = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
  });

  afterEach(() => {
    jest.dontMock('react-native');
    delete (globalThis as any).localStorage;
  });

  it('never calls SecureStore on web (option is iOS-only)', async () => {
    const { blobStorage } = await import('../blob-storage');
    await blobStorage.setItem('chara.accounts', 'v');
    expect(setItemAsync).not.toHaveBeenCalled();
    expect(store['chara.accounts']).toBe('v');
  });
});
