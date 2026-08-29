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

export interface VoiceDraftPct {
  member_id: string;
  /** 10000 == 100%, matching the server's internal/split. */
  basis_points: number;
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
  /** Present only for a validated percentage split. Carrying the
   *  proportions — rather than only the amounts they produced — is what
   *  lets the wizard show "25%" instead of pinning 250.00. */
  percentages?: VoiceDraftPct[];
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

/** How the wizard should represent a draft's split. */
export interface WizardSplit {
  method: 'equal' | 'exact' | 'percentage';
  /** Decimal strings keyed by member id, e.g. "180.00". */
  exactByMember?: Record<string, string>;
  /** Percent strings keyed by member id, e.g. "25" or "33.33". */
  pctByMember?: Record<string, string>;
}

/**
 * Decide how a draft's split should appear in the wizard.
 *
 * A percentage split stays proportional. The user who said "Alex owes 25%"
 * asked for a proportion, and showing them 250.00 instead answers a
 * question they did not ask — and silently stops tracking the proportion
 * if the amount later changes.
 *
 * When a percentage split arrives without its percentages (an older
 * server), exact amounts are the right fallback: they keep the money
 * correct, which matters more than keeping the method label honest.
 */
export function toWizardSplit(draft: VoiceDraft): WizardSplit {
  if (draft.split_method === 'percentage' && draft.percentages?.length) {
    const pctByMember: Record<string, string> = {};
    for (const p of draft.percentages) {
      // Trim trailing zeros: 2500 is "25", 3333 is "33.33".
      pctByMember[p.member_id] = String(
        Number((p.basis_points / 100).toFixed(2)),
      );
    }
    return { method: 'percentage', pctByMember };
  }

  if (draft.split_method !== 'equal' && draft.shares?.length) {
    const exactByMember: Record<string, string> = {};
    for (const s of draft.shares) {
      exactByMember[s.member_id] = (s.share_minor / 100).toFixed(2);
    }
    return { method: 'exact', exactByMember };
  }

  return { method: 'equal' };
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
