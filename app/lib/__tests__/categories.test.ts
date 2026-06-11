/**
 * Shared expense-category vocabulary — canonical id list, icon map, and the
 * legacy/unknown-id fallback used by the wizard picker, group expense list,
 * and expense detail screen.
 */

import {
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  categoryIcon,
  normalizeCategory,
} from '../categories';

import en from '../locales/en.json';

describe('categories — canonical vocabulary', () => {
  it('matches the categories.* keys in en.json exactly', () => {
    expect([...EXPENSE_CATEGORIES].sort()).toEqual(
      Object.keys((en as any).categories).sort(),
    );
  });

  it('has an icon for every canonical id', () => {
    for (const id of EXPENSE_CATEGORIES) {
      expect(CATEGORY_ICONS[id]).toBeTruthy();
    }
  });
});

describe('categories — normalizeCategory', () => {
  it('passes canonical ids through', () => {
    expect(normalizeCategory('food')).toBe('food');
    expect(normalizeCategory('rent')).toBe('rent');
  });

  it("collapses the legacy 'general' id to 'other'", () => {
    expect(normalizeCategory('general')).toBe('other');
  });

  it("collapses unknown ids to 'other'", () => {
    expect(normalizeCategory('spaceships')).toBe('other');
  });

  it("collapses missing / empty values to 'other'", () => {
    expect(normalizeCategory(undefined)).toBe('other');
    expect(normalizeCategory(null)).toBe('other');
    expect(normalizeCategory('')).toBe('other');
  });
});

describe('categories — categoryIcon', () => {
  it('returns the mapped icon for canonical ids', () => {
    expect(categoryIcon('food')).toBe(CATEGORY_ICONS.food);
  });

  it("falls back to the 'other' icon for legacy / unknown ids", () => {
    expect(categoryIcon('general')).toBe(CATEGORY_ICONS.other);
    expect(categoryIcon(undefined)).toBe(CATEGORY_ICONS.other);
  });
});
