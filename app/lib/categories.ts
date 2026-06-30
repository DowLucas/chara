import { Feather } from '@expo/vector-icons';

import { getFlag, setFlag } from './storage';

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

function isBuiltinCategory(category: string): boolean {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Display label for a category: built-ins go through i18n, user-defined
 * categories are shown verbatim (they were entered as free text and aren't in
 * the translation catalog).
 */
export function categoryLabel(
  category: string | undefined,
  t: (k: string) => string,
): string {
  const c = category ?? DEFAULT_CATEGORY;
  return isBuiltinCategory(c) ? t(categoryLabelKey(c)) : c;
}

// ── User-defined categories ───────────────────────────────────────────────────
// Stored per-device (categories are just labels, not server data). The picker
// offers them so the user reuses the same string each time, keeping per-category
// stats consistent.

const CUSTOM_CATEGORIES_KEY = 'expense_custom_categories';

export async function loadCustomCategories(): Promise<string[]> {
  try {
    const raw = await getFlag(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Add a custom category. No-ops (and returns the unchanged list) for blank
 * input or a name that already exists as a built-in or custom category
 * (case-insensitive), so the picker never shows duplicates. Returns the
 * updated list.
 */
export async function addCustomCategory(name: string): Promise<string[]> {
  const clean = name.trim();
  const existing = await loadCustomCategories();
  if (!clean) return existing;
  const lower = clean.toLowerCase();
  const builtinClash = (EXPENSE_CATEGORIES as readonly string[]).some(
    (c) => c.toLowerCase() === lower,
  );
  const customClash = existing.some((c) => c.toLowerCase() === lower);
  if (builtinClash || customClash) return existing;
  const next = [...existing, clean];
  try {
    await setFlag(CUSTOM_CATEGORIES_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}
