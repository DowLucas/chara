// Per-(server, group) auto-saved draft of an in-progress add-expense form, so
// accidentally leaving the wizard doesn't lose what the user typed. Best-effort
// and non-secret: stored via the same getFlag/setFlag KV as other device flags.
//
// Only the create flow uses this (edit already has the real expense to fall
// back on). Drafts expire after a week and are cleared on a successful save.

import { getFlag, setFlag, clearFlag } from './storage';

const PREFIX = 'expense_draft_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ExpenseDraft {
  savedAt: number;
  amount?: string;
  title?: string;
  dateMs?: number;
  currency?: string;
  payerMemberId?: string;
  category?: string;
  method?: 'equal' | 'exact' | 'percentage' | 'itemized';
  included?: Record<string, boolean>;
  exactByMember?: Record<string, string>;
  pctByMember?: Record<string, string>;
  /** Receipt itemisation behind the `itemized` method. Persisted so a
   *  restored draft can still re-derive the split — without it a draft saved
   *  in `itemized` mode would come back with no amounts. Shape mirrors
   *  lib/scan-items Itemization; typed loosely to keep this module free of a
   *  dependency on the scan types. */
  itemization?: {
    items: Array<{
      id: string;
      description: string;
      qty: number;
      unit_price_minor: number;
      total_minor: number;
    }>;
    assignments: Record<string, string[]>;
    taxMinor: number;
    tipMinor: number;
  };
  /** Evenly-shared deposit ("pant") from the scan, kept alongside the
   *  itemisation so a restored draft can re-open the items screen with the
   *  same unassigned remainder rather than losing the deposit. */
  depositMinor?: number;
}

export type DraftFields = Omit<ExpenseDraft, 'savedAt'>;

// SecureStore keys are restricted to [A-Za-z0-9._-]; serverUrl carries
// "https://" + host, so squash anything else to '_'. Collisions are harmless
// (worst case two servers share a draft slot — both best-effort).
export function draftKey(serverUrl: string, groupId: string): string {
  return PREFIX + `${serverUrl}_${groupId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Worth persisting? Skip empty forms so merely opening + leaving the wizard
 *  doesn't leave a phantom draft to restore next time. */
export function draftHasContent(d: DraftFields): boolean {
  const amountTyped = !!d.amount && d.amount !== '' && d.amount !== '0';
  const titleTyped = !!d.title && d.title.trim() !== '';
  return amountTyped || titleTyped;
}

export async function loadDraft(key: string, nowMs: number): Promise<ExpenseDraft | null> {
  try {
    const raw = await getFlag(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as ExpenseDraft;
    if (!d || typeof d.savedAt !== 'number') return null;
    if (nowMs - d.savedAt > MAX_AGE_MS) return null;
    return d;
  } catch {
    return null;
  }
}

export async function saveDraft(key: string, fields: DraftFields, nowMs: number): Promise<void> {
  try {
    if (!draftHasContent(fields)) return;
    await setFlag(key, JSON.stringify({ ...fields, savedAt: nowMs }));
  } catch {
    /* best-effort */
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await clearFlag(key);
  } catch {
    /* best-effort */
  }
}
