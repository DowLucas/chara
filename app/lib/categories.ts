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
  utilities: 'zap',
  entertainment: 'film',
  travel: 'compass',
  shopping: 'shopping-bag',
  health: 'heart',
  kids: 'smile',
  pets: 'feather',
  gifts: 'gift',
  subscriptions: 'repeat',
  insurance: 'shield',
  home: 'tool',
  sports: 'award',
  personal_care: 'scissors',
  electronics: 'cpu',
  charity: 'life-buoy',
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

export function isBuiltinCategory(category: string): boolean {
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

/**
 * Resolves a group's enabled category catalog from its stored
 * `category_slugs` (see `Group.category_slugs` in lib/api.ts). Falls back to
 * the full default catalog when unset/empty (matches the backend's
 * `resolveCategorySlugs`), and drops any slug this client build doesn't
 * recognise so an older app talking to a newer server never renders a
 * category it can't label or icon.
 */
export function resolveGroupCategorySlugs(
  slugs: string[] | null | undefined,
): ExpenseCategory[] {
  if (!slugs || slugs.length === 0) return [...EXPENSE_CATEGORIES];
  return slugs.filter((s): s is ExpenseCategory => isBuiltinCategory(s));
}

/**
 * Builtin category options to render in the category picker: the group's
 * enabled catalog, plus the expense's current category if it's a builtin
 * slug the group has since disabled. Without this, editing an expense whose
 * category a group owner later disabled would silently drop that category
 * from the picker with no way to re-select it. A non-builtin (custom,
 * free-text) current category is left out — those are rendered from the
 * separate per-device custom-categories list.
 */
export function categoryPickerOptions(
  enabled: readonly ExpenseCategory[],
  currentCategory: string | undefined,
): ExpenseCategory[] {
  if (
    currentCategory &&
    isBuiltinCategory(currentCategory) &&
    !enabled.includes(currentCategory as ExpenseCategory)
  ) {
    return [...enabled, currentCategory as ExpenseCategory];
  }
  return [...enabled];
}

// ── Local category inference ──────────────────────────────────────────────────
// Pure, offline, keyword-based suggestion for the manual "what was this for"
// title field — no network/AI dependency, so it works identically on
// self-host instances without a Gemini key. Only ever a *suggestion*: callers
// must stop applying it the moment the user picks a category explicitly (see
// ExpenseWizard's `categoryTouched` guard).
const CATEGORY_KEYWORDS: Partial<Record<Exclude<ExpenseCategory, 'general' | 'other'>, string[]>> = {
  food: ['pizza', 'lunch', 'dinner', 'breakfast', 'brunch', 'restaurant', 'cafe', 'café', 'takeaway', 'takeout', 'burger', 'sushi', 'kebab'],
  drinks: ['beer', 'beers', 'wine', 'bar', 'pub', 'cocktail', 'cocktails', 'systembolaget'],
  groceries: ['groceries', 'grocery', 'ica', 'coop', 'willys', 'lidl', 'hemköp', 'supermarket'],
  transport: ['taxi', 'uber', 'bolt', 'train', 'bus', 'flight', 'flights', 'parking', 'fuel', 'gas', 'bensin', 'sl', 'sj'],
  rent: ['rent', 'hyra'],
  utilities: ['electricity', 'internet', 'wifi', 'water bill', 'heating'],
  entertainment: ['movie', 'cinema', 'concert', 'festival', 'theatre', 'theater'],
  travel: ['hotel', 'airbnb', 'flight', 'flights', 'vacation', 'trip'],
  shopping: ['clothes', 'clothing', 'shoes', 'mall'],
  health: ['pharmacy', 'apoteket', 'doctor', 'dentist', 'clinic'],
  kids: ['daycare', 'babysitter', 'toys'],
  pets: ['vet', 'pet food', 'dog', 'cat'],
  gifts: ['gift', 'present', 'birthday present'],
  subscriptions: ['netflix', 'spotify', 'subscription'],
  electronics: ['electronics', 'phone case', 'charger'],
  sports: ['gym', 'gym membership', 'padel', 'football', 'yoga'],
};

/**
 * Normalizes a title for whole-word keyword matching: lowercases, replaces
 * any non-letter/non-digit character (punctuation, hyphens, …) with a space,
 * then pads with a leading/trailing space so every word — including the
 * first and last — has a space on both sides to match against.
 */
function padForWordMatch(s: string): string {
  const cleaned = s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
  return cleaned ? ` ${cleaned} ` : '';
}

/**
 * Suggests a category from a free-text expense title via a whole-word
 * keyword match (not a plain substring search — short keywords like "gas"
 * or "ica" would otherwise false-positive inside unrelated words like
 * "Vegas" or "Magical"). Multi-word keywords (e.g. "gym membership") match
 * as an exact space-separated phrase. Returns `null` when nothing matches
 * confidently — callers should leave the category untouched (already
 * defaults to `general`) rather than force it.
 */
export function inferCategoryFromTitle(title: string): ExpenseCategory | null {
  const padded = padForWordMatch(title);
  if (!padded) return null;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => padded.includes(` ${kw} `))) {
      return category as ExpenseCategory;
    }
  }
  return null;
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
