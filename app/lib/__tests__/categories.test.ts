const store = new Map<string, string>();
jest.mock('../storage', () => ({
  getFlag: async (k: string) => (store.has(k) ? store.get(k)! : null),
  setFlag: async (k: string, v: string) => {
    store.set(k, v);
  },
  clearFlag: async (k: string) => {
    store.delete(k);
  },
}));
jest.mock('@expo/vector-icons', () => ({ Feather: {} }));

import {
  categoryLabel,
  loadCustomCategories,
  addCustomCategory,
} from '../categories';

beforeEach(() => store.clear());

const t = (k: string) => `T:${k}`;

describe('categoryLabel', () => {
  it('translates built-in categories', () => {
    expect(categoryLabel('food', t)).toBe('T:categories.food');
    expect(categoryLabel(undefined, t)).toBe('T:categories.general');
  });

  it('shows custom categories verbatim (not via i18n)', () => {
    expect(categoryLabel('Souvenirs', t)).toBe('Souvenirs');
  });
});

describe('custom categories', () => {
  it('starts empty', async () => {
    expect(await loadCustomCategories()).toEqual([]);
  });

  it('adds and persists a custom category', async () => {
    await addCustomCategory('Souvenirs');
    expect(await loadCustomCategories()).toEqual(['Souvenirs']);
  });

  it('ignores blank input', async () => {
    await addCustomCategory('   ');
    expect(await loadCustomCategories()).toEqual([]);
  });

  it('de-dupes against existing customs (case-insensitive)', async () => {
    await addCustomCategory('Souvenirs');
    await addCustomCategory('souvenirs');
    expect(await loadCustomCategories()).toEqual(['Souvenirs']);
  });

  it('refuses names that clash with a built-in category', async () => {
    await addCustomCategory('Food');
    expect(await loadCustomCategories()).toEqual([]);
  });

  it('returns the updated list', async () => {
    const list = await addCustomCategory('Gifts');
    expect(list).toEqual(['Gifts']);
  });
});
