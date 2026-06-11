/**
 * Expense-category vocabulary — shared by the wizard's category picker, the
 * group expense list, and the expense detail screen.
 *
 * Keep `EXPENSE_CATEGORIES` in sync with the `categories.*` keys in
 * lib/locales/en.json: ids are wire data, display names come from i18n.
 * Legacy / unknown ids (e.g. the pre-v1 'general') collapse to 'other'.
 */

import type { Feather } from '@expo/vector-icons';

export type FeatherIconName = keyof typeof Feather.glyphMap;

export const EXPENSE_CATEGORIES = [
  'food',
  'drinks',
  'groceries',
  'transport',
  'rent',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Map expense category → Feather icon name. Unknown categories fall back to
// the generic tag glyph so we never render a missing icon.
export const CATEGORY_ICONS: Record<ExpenseCategory, FeatherIconName> = {
  food: 'coffee',
  rent: 'home',
  transport: 'navigation',
  groceries: 'shopping-cart',
  drinks: 'droplet',
  other: 'tag',
};

/** Collapse legacy / unknown ids to 'other'. */
export function normalizeCategory(category?: string | null): ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category ?? '')
    ? (category as ExpenseCategory)
    : 'other';
}

export function categoryIcon(category?: string | null): FeatherIconName {
  return CATEGORY_ICONS[normalizeCategory(category)];
}
