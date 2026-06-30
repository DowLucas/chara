import { Feather } from '@expo/vector-icons';

/**
 * Ordered list of selectable expense categories. Keys match the
 * `categories.*` i18n namespace (labels) and `CATEGORY_ICONS` below.
 * `general` is the default for un-categorised expenses.
 *
 * Display labels go through `t('categories.' + key)` — keep this list and the
 * `categories` block in `lib/locales/en.json` in sync.
 */
export const EXPENSE_CATEGORIES = [
  'general',
  'food',
  'drinks',
  'groceries',
  'transport',
  'rent',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DEFAULT_CATEGORY: ExpenseCategory = 'general';

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  general: 'tag',
  food: 'coffee',
  drinks: 'droplet',
  groceries: 'shopping-cart',
  transport: 'navigation',
  rent: 'home',
  other: 'tag',
};

/** Feather icon for a category; falls back to the generic tag glyph so we
 *  never render a missing icon for an unknown/legacy category string. */
export function categoryIcon(category?: string): keyof typeof Feather.glyphMap {
  return CATEGORY_ICONS[category ?? 'general'] ?? 'tag';
}

/** i18n key for a category's display label. */
export function categoryLabelKey(category?: string): string {
  return `categories.${category ?? 'general'}`;
}
