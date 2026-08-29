/**
 * Queue logic for multi-expense voice results.
 *
 * One recording routinely yields several expenses. The first fills the
 * ExpenseWizard; the rest wait behind a banner and are handed over one at
 * a time as the user saves.
 *
 * Every transition lives here as a pure function so the edge cases — a
 * save failing mid-queue, the user backing out, advancing past the end —
 * are testable without React or a native audio module.
 *
 * Spec: docs/superpowers/specs/2026-08-29-voice-expenses-design.md
 */

export interface VoiceDraftShare {
  member_id: string;
  share_minor: number;
}

export interface VoiceDraft {
  /** The words from the transcript that produced this draft. Shown to the
   *  user against the draft — that traceability is what makes accepting a
   *  multi-expense result reasonable without re-checking every field. */
  source_phrase: string;
  title: string;
  amount_minor: number;
  currency: string;
  category?: string;
  date?: string;
  paid_by_id: string;
  split_method: 'equal' | 'exact' | 'percentage';
  participants: string[];
  shares?: VoiceDraftShare[];
  /** Field names the server's resolver had to guess at, for the UI to flag. */
  low_confidence?: string[];
}

export interface VoiceQueue {
  drafts: VoiceDraft[];
  index: number;
  /** Links saved expenses back to the generation, for acceptance tracking. */
  generationId: string;
}

/** The subset of wizard output that changedFields compares against. */
export interface SavedExpenseShape {
  title: string;
  amountMinor: number;
  currency: string;
  paidById: string;
  splitMethod: string;
  participants: string[];
}

export function makeQueue(drafts: VoiceDraft[], generationId: string): VoiceQueue {
  return { drafts, index: 0, generationId };
}

export function currentDraft(q: VoiceQueue): VoiceDraft | null {
  return q.drafts[q.index] ?? null;
}

/** How many drafts wait BEHIND the current one. */
export function remainingCount(q: VoiceQueue): number {
  return Math.max(0, q.drafts.length - q.index - 1);
}

/** Move to the next draft. Clamped, so advancing an exhausted queue is a
 *  no-op rather than an out-of-range index. */
export function advance(q: VoiceQueue): VoiceQueue {
  return { ...q, index: Math.min(q.index + 1, q.drafts.length) };
}

export function discardRest(q: VoiceQueue): VoiceQueue {
  return { ...q, index: q.drafts.length };
}

/**
 * Which draft fields the user changed before saving. Sent back with the
 * expense so the server can compute per-field acceptance rates.
 *
 * Participants compare as SETS: the wizard does not preserve order, and a
 * reorder is not a correction.
 */
export function changedFields(draft: VoiceDraft, saved: SavedExpenseShape): string[] {
  const changed: string[] = [];
  if (draft.title !== saved.title) changed.push('title');
  if (draft.amount_minor !== saved.amountMinor) changed.push('amount');
  if (draft.currency !== saved.currency) changed.push('currency');
  if (draft.paid_by_id !== saved.paidById) changed.push('paid_by');
  if (draft.split_method !== saved.splitMethod) changed.push('split_method');

  const a = [...draft.participants].sort().join(',');
  const b = [...saved.participants].sort().join(',');
  if (a !== b) changed.push('participants');

  return changed;
}
