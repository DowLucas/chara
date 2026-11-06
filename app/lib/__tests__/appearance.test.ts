const store = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItem: (k: string) => store.get(k) ?? null,
  getItemAsync: async (k: string) => store.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    store.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    store.delete(k);
  },
}));

import { readAppearancePreference, setAppearancePreference } from '../preferences';
import { resolveScheme } from '../appearance';

beforeEach(() => store.clear());

describe('resolveScheme', () => {
  it('follows the phone on System, including an unknown phone setting', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
  });

  it('lets Light and Dark override the phone', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('appearance preference', () => {
  it('defaults to System and reads synchronously', () => {
    expect(readAppearancePreference()).toBe('system');
  });

  it('round-trips a choice', async () => {
    await setAppearancePreference('dark');
    expect(readAppearancePreference()).toBe('dark');
    await setAppearancePreference('system');
    expect(readAppearancePreference()).toBe('system');
  });

  it('treats a corrupt stored value as System', () => {
    store.set('chara.appearance', 'sepia');
    expect(readAppearancePreference()).toBe('system');
  });
});
