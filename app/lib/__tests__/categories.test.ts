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
  categoryIcon,
  categoryLabel,
  categoryPickerOptions,
  EXPENSE_CATEGORIES,
  inferCategoryFromTitle,
  loadCustomCategories,
  addCustomCategory,
  resolveGroupCategorySlugs,
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
    const list = await addCustomCategory('Woodworking');
    expect(list).toEqual(['Woodworking']);
  });
});

describe('EXPENSE_CATEGORIES catalog (mirrors backend internal/category)', () => {
  it('starts with general and ends with other', () => {
    expect(EXPENSE_CATEGORIES[0]).toBe('general');
    expect(EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]).toBe('other');
  });

  it('has no duplicate slugs', () => {
    expect(new Set(EXPENSE_CATEGORIES).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it('every category has an icon', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(categoryIcon(c)).toBeTruthy();
    }
  });

  it('matches the backend catalog exactly, in order', () => {
    // Keep in lockstep with backend/internal/category/category.go
    // defaultOrder — the two lists must be identical.
    expect(EXPENSE_CATEGORIES).toEqual([
      'general',
      'food',
      'drinks',
      'groceries',
      'transport',
      'rent',
      'utilities',
      'entertainment',
      'travel',
      'shopping',
      'health',
      'kids',
      'pets',
      'gifts',
      'subscriptions',
      'insurance',
      'home',
      'sports',
      'personal_care',
      'electronics',
      'charity',
      'other',
    ]);
  });
});

describe('resolveGroupCategorySlugs', () => {
  it('returns the full default catalog when undefined', () => {
    expect(resolveGroupCategorySlugs(undefined)).toEqual(EXPENSE_CATEGORIES);
  });

  it('returns the full default catalog when null or empty', () => {
    expect(resolveGroupCategorySlugs(null)).toEqual(EXPENSE_CATEGORIES);
    expect(resolveGroupCategorySlugs([])).toEqual(EXPENSE_CATEGORIES);
  });

  it('returns the group-configured subset, preserving order', () => {
    expect(resolveGroupCategorySlugs(['rent', 'food'])).toEqual(['rent', 'food']);
  });

  it('drops any slug the client catalog does not recognise', () => {
    // Forward-compat: an older client talking to a newer server that added
    // a category it doesn't know about yet shouldn't crash the picker.
    expect(resolveGroupCategorySlugs(['food', 'not-a-real-category'])).toEqual(['food']);
  });
});

describe('categoryPickerOptions', () => {
  it('returns the enabled catalog unchanged when the current category is already enabled', () => {
    expect(categoryPickerOptions(['food', 'rent'], 'food')).toEqual(['food', 'rent']);
  });

  it('appends the current category when it is a disabled builtin', () => {
    // Regression: a group owner disables "rent" after an expense was
    // already saved with that category — editing that expense must still
    // let the user re-select (or at least see) its current category.
    expect(categoryPickerOptions(['food'], 'rent')).toEqual(['food', 'rent']);
  });

  it('does not duplicate when the current category is already the sole enabled one', () => {
    expect(categoryPickerOptions(['food'], 'food')).toEqual(['food']);
  });

  it('leaves a non-builtin (custom) current category out — those are listed separately', () => {
    expect(categoryPickerOptions(['food', 'rent'], 'Souvenirs')).toEqual(['food', 'rent']);
  });
});

describe('inferCategoryFromTitle', () => {
  it('matches a food keyword', () => {
    expect(inferCategoryFromTitle('Pizza with Anna')).toBe('food');
    expect(inferCategoryFromTitle('Lunch at the office')).toBe('food');
  });

  it('matches a drinks keyword', () => {
    expect(inferCategoryFromTitle('Beers at the pub')).toBe('drinks');
  });

  it('matches a groceries keyword', () => {
    expect(inferCategoryFromTitle('ICA run')).toBe('groceries');
    expect(inferCategoryFromTitle('Weekly groceries')).toBe('groceries');
  });

  it('matches a transport keyword', () => {
    expect(inferCategoryFromTitle('Taxi to the airport')).toBe('transport');
    expect(inferCategoryFromTitle('Uber home')).toBe('transport');
  });

  it('matches a rent keyword', () => {
    expect(inferCategoryFromTitle('Rent for May')).toBe('rent');
  });

  it('is case-insensitive', () => {
    expect(inferCategoryFromTitle('PIZZA NIGHT')).toBe('food');
  });

  it('returns null for an empty or unmatched title', () => {
    expect(inferCategoryFromTitle('')).toBeNull();
    expect(inferCategoryFromTitle('   ')).toBeNull();
    expect(inferCategoryFromTitle('Settling up with Bob')).toBeNull();
  });

  it('matches a keyword embedded in a longer title', () => {
    expect(inferCategoryFromTitle('Late-night taxi ride home')).toBe('transport');
  });

  it('does not match a keyword that only appears as a substring of an unrelated word', () => {
    // Regression: 'gas'/'sl'/'ica' are real keywords but plain substring
    // search matched them inside "Vegas", "Island", "Magical" etc.
    expect(inferCategoryFromTitle('Vegas weekend')).toBeNull();
    expect(inferCategoryFromTitle('Island getaway')).toBeNull();
    expect(inferCategoryFromTitle('Magical evening')).toBeNull();
  });

  it('still matches a multi-word keyword phrase as whole words', () => {
    expect(inferCategoryFromTitle('Gym membership renewal')).toBe('sports');
    expect(inferCategoryFromTitle('Water bill for June')).toBe('utilities');
  });

  it('matches a keyword adjacent to punctuation', () => {
    expect(inferCategoryFromTitle('Taxi, home late')).toBe('transport');
  });
});
