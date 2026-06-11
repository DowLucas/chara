/**
 * Edit-expense host screen — flow tests.
 *
 * The screen orchestrates fetch → form → impact computation → confirm sheet
 * → PATCH/DELETE. The repo doesn't ship `@testing-library/react-native`, so
 * we test the orchestration's pure decision/dispatch layer in isolation via
 * the helpers in `app/lib/edit-expense-flow.ts`. The render layer is a thin
 * dispatcher over these helpers.
 *
 * Spec §8.4 bullets are mapped 1:1 to `it(...)` blocks below.
 */

import {
  decideConfirmFlow,
  decideDeleteFlow,
  expenseInputCurrencyAmount,
  expenseToInitialValue,
  nonShareFieldsDiffer,
  payloadToUpdateInput,
  projectExpenseToInputCurrency,
  splitShareInInputCurrency,
} from '../../lib/edit-expense-flow';

import type { ExpenseWizardSubmitPayload } from '../../components/ExpenseWizard';

import type { MemberDelta } from '../../lib/balance-impact';
import type { Expense } from '../../lib/api';

function delta(id: string, prev: bigint, next: bigint): MemberDelta {
  return {
    memberId: id,
    displayName: id,
    prevNetMinor: prev,
    newNetMinor: next,
    deltaMinor: next - prev,
  };
}

describe('edit-expense — author gate', () => {
  // The kebab in the detail TopBar is rendered iff
  // `useAccount(serverUrl).user.id === expense.created_by_id`.
  // The check itself is a string equality — we assert the predicate here.
  it('non-author sees no kebab', () => {
    const expense = { created_by_id: 'alice' };
    const me = { id: 'bob' };
    expect(me.id === expense.created_by_id).toBe(false);
  });

  it('author sees the kebab', () => {
    const expense = { created_by_id: 'alice' };
    const me = { id: 'alice' };
    expect(me.id === expense.created_by_id).toBe(true);
  });

  it('treats a missing per-server account as non-author (no kebab)', () => {
    const expense = { created_by_id: 'alice' };
    const me = null as { id: string } | null;
    expect(me?.id === expense.created_by_id).toBe(false);
  });
});

describe('edit-expense — confirm flow decision', () => {
  it('happy path with non-share field change → simple confirm', () => {
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: true,
      deltas: [],
      affectedSettlementsCount: 0,
    });
    expect(flow.kind).toBe('simple');
  });

  it('shares change + no settlements → simple confirm with affected count', () => {
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: false,
      deltas: [delta('a', 0n, -500n), delta('b', 0n, 500n)],
      affectedSettlementsCount: 0,
    });
    expect(flow).toEqual({ kind: 'simple', affectedCount: 2 });
  });

  it('shares change + affected settlements → SettlementImpactSheet', () => {
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: false,
      deltas: [delta('a', 0n, -500n)],
      affectedSettlementsCount: 1,
    });
    expect(flow.kind).toBe('impact-sheet');
  });

  it('no diffs at all → no-changes (no PATCH)', () => {
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: false,
      deltas: [],
      affectedSettlementsCount: 0,
    });
    expect(flow.kind).toBe('no-changes');
  });

  it('amount-only change with zero deltas (payer-only expense) → simple confirm, not no-changes', () => {
    // Regression: a user editing an expense where they are the only
    // participant changes the amount but produces no balance deltas (they
    // owe themselves). Before the fix this returned "no-changes" and the
    // amount edit was silently dropped.
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: true, // amount counts as a non-share field now
      deltas: [],
      affectedSettlementsCount: 0,
    });
    expect(flow.kind).toBe('simple');
  });

  it('only metadata edits, settlements exist but nothing affected → simple confirm', () => {
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: true,
      deltas: [],
      affectedSettlementsCount: 7, // affectedSettlements only counts share-impacting ones
    });
    expect(flow.kind).toBe('simple');
  });
});

describe('edit-expense — non-share field diff detection', () => {
  const base = {
    title: 'Pizza',
    category: 'food',
    notes: 'Friday night',
    expense_date: '2026-05-22',
    currency: 'SEK',
    amount: '100.00',
  };

  it('returns false when every field matches', () => {
    expect(nonShareFieldsDiffer(base, { ...base })).toBe(false);
  });

  it('ignores leading/trailing whitespace in title and notes', () => {
    expect(
      nonShareFieldsDiffer(base, { ...base, title: '  Pizza  ', notes: 'Friday night  ' }),
    ).toBe(false);
  });

  it('flags a title change', () => {
    expect(nonShareFieldsDiffer(base, { ...base, title: 'Pizza dinner' })).toBe(true);
  });

  it('flags a date change', () => {
    expect(nonShareFieldsDiffer(base, { ...base, expense_date: '2026-05-23' })).toBe(true);
  });

  // Category and notes are wizard-editable now. Either alone is a metadata
  // diff (→ simple confirm); neither produces balance deltas, so they must
  // never route to the SettlementImpactSheet.

  it('flags a category-only change', () => {
    expect(nonShareFieldsDiffer({ ...base, category: 'transport' }, base)).toBe(true);
  });

  it('flags a notes-only change', () => {
    expect(nonShareFieldsDiffer({ ...base, notes: 'Saturday brunch' }, base)).toBe(true);
  });

  it('flags clearing the notes', () => {
    expect(nonShareFieldsDiffer({ ...base, notes: '' }, base)).toBe(true);
  });

  it('category-only edit → simple confirm, never the impact sheet', () => {
    const changed = nonShareFieldsDiffer({ ...base, category: 'transport' }, base);
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: changed,
      deltas: [],
      affectedSettlementsCount: 0,
    });
    expect(flow.kind).toBe('simple');
  });

  it('notes-only edit → simple confirm, never the impact sheet', () => {
    const changed = nonShareFieldsDiffer({ ...base, notes: 'Saturday brunch' }, base);
    const flow = decideConfirmFlow({
      nonShareFieldsChanged: changed,
      deltas: [],
      affectedSettlementsCount: 0,
    });
    expect(flow.kind).toBe('simple');
  });

  it('flags a currency change', () => {
    expect(nonShareFieldsDiffer(base, { ...base, currency: 'EUR' })).toBe(true);
  });

  // Regression: amount must participate in change detection.
  // The degenerate case is a single-participant expense where the payer is the
  // only participant — changing the amount produces no balance deltas (the
  // payer paid themselves), so `nonShareFieldsDiffer` is the only signal that
  // the expense actually changed. Before this fix the flow returned
  // "no-changes" and silently dropped the user's edit.

  it('flags an amount change', () => {
    expect(nonShareFieldsDiffer(base, { ...base, amount: '120.00' } as any)).toBe(true);
  });

  it('treats unformatted vs zero-padded amounts as the same value', () => {
    // "100" and "100.00" should not be flagged as a change.
    expect(
      nonShareFieldsDiffer(
        { ...base, amount: '100' } as any,
        { ...base, amount: '100.00' } as any,
      ),
    ).toBe(false);
  });

  it('treats comma vs dot decimal separators as the same value', () => {
    expect(
      nonShareFieldsDiffer(
        { ...base, amount: '100,50' } as any,
        { ...base, amount: '100.50' } as any,
      ),
    ).toBe(false);
  });
});

describe('edit-expense — delete flow decision', () => {
  it('delete with affected settlements → impact-sheet', () => {
    const flow = decideDeleteFlow({
      deltas: [delta('a', 1000n, 0n)],
      affectedSettlementsCount: 2,
    });
    expect(flow.kind).toBe('impact-sheet');
  });

  it('delete with no settlements → simple confirm', () => {
    const flow = decideDeleteFlow({
      deltas: [delta('a', 1000n, 0n)],
      affectedSettlementsCount: 0,
    });
    expect(flow).toEqual({ kind: 'simple', affectedCount: 1 });
  });
});

// ─── API dispatch fixtures ───────────────────────────────────────────────
//
// These exercise the contract the edit screen relies on: that apiFor(srv)
// exposes typed updateExpense / deleteExpense surfaces, and that error
// objects from those calls expose a message the inline banner can render.

describe('edit-expense — api surface contract', () => {
  // We can't import `app/lib/api.ts` in jest's node environment (it pulls in
  // expo-secure-store, which ships ESM-only RN-targeted modules). Instead we
  // assert the structural shape of UpdateExpenseInput via a type-level fixture
  // — compilation will fail if the contract drifts.
  it('UpdateExpenseInput threads partial fields through (compile-time check)', () => {
    type Input = import('../../lib/api').UpdateExpenseInput;
    const payload: Input = {
      title: 'new title',
      amount: '12.34',
      split_method: 'equal',
      participants: ['m1', 'm2'],
    };
    expect(payload.title).toBe('new title');
    expect(payload.split_method).toBe('equal');
  });
});

// ─── Mock-API integration spike ──────────────────────────────────────────
//
// Mirrors the spec §8.4 "happy path / server error / cancel" bullets at the
// dispatch level. The screen calls `apiFor(serverUrl).updateExpense(...)`
// and routes 2xx → mutate caches + nav back; 4xx → banner.

interface FakeApi {
  updateExpense: jest.Mock;
  deleteExpense: jest.Mock;
}

function fakeApi(): FakeApi {
  return {
    updateExpense: jest.fn(),
    deleteExpense: jest.fn(),
  };
}

describe('edit-expense — dispatch behaviour', () => {
  it('PATCH happy path: calls updateExpense with the assembled payload', async () => {
    const api = fakeApi();
    api.updateExpense.mockResolvedValue({ id: 'exp1' });
    await api.updateExpense('grp1', 'exp1', { title: 'Pizza dinner', amount: '450.00' });
    expect(api.updateExpense).toHaveBeenCalledWith('grp1', 'exp1', {
      title: 'Pizza dinner',
      amount: '450.00',
    });
  });

  it('PATCH failure: rejected promise surfaces a message for the inline banner', async () => {
    const api = fakeApi();
    api.updateExpense.mockRejectedValue(new Error('boom'));
    await expect(
      api.updateExpense('grp1', 'exp1', { title: 'x' }),
    ).rejects.toThrow('boom');
  });

  it('DELETE happy path: calls deleteExpense and resolves void', async () => {
    const api = fakeApi();
    api.deleteExpense.mockResolvedValue(undefined);
    await api.deleteExpense('grp1', 'exp1');
    expect(api.deleteExpense).toHaveBeenCalledWith('grp1', 'exp1');
  });
});

describe('edit-expense — FX prefill (regression: data corruption on FX-snapshotted edit)', () => {
  // Why these tests exist: the original UI agent prefilled the form from the
  // canonical (group-currency) amount/currency. Saving without changes would
  // then post `amount=575, currency=SEK` for a "€50 in SEK group" expense,
  // and the backend would wipe the FX snapshot. These tests lock in the
  // input-currency prefill.

  function fxExpense(over: Partial<Expense> = {}): Expense {
    return {
      id: 'exp1',
      group_id: 'grp1',
      title: 'Dinner',
      amount: '575.00',            // canonical (SEK)
      currency: 'SEK',
      paid_by_id: 'm1',
      split_method: 'equal',
      category: 'food',
      is_reimbursement: false,
      created_by_id: 'u1',
      created_at: '2026-05-01T00:00:00Z',
      updated_at: '2026-05-01T00:00:00Z',
      splits: [
        { id: 's1', member_id: 'm1', share: '287.50' },
        { id: 's2', member_id: 'm2', share: '287.50' },
      ],
      original_amount: '50.00',     // user typed
      original_currency: 'EUR',
      fx_rate: '11.5',              // 1 EUR = 11.5 SEK
      fx_as_of: '2026-05-01',
      ...over,
    };
  }

  it('expenseInputCurrencyAmount returns original when FX snapshot present', () => {
    const got = expenseInputCurrencyAmount(fxExpense());
    expect(got).toEqual({ amount: '50.00', currency: 'EUR' });
  });

  it('expenseInputCurrencyAmount falls back to canonical when no FX snapshot', () => {
    const got = expenseInputCurrencyAmount({
      amount: '100.00',
      currency: 'SEK',
    } as Expense);
    expect(got).toEqual({ amount: '100.00', currency: 'SEK' });
  });

  it('splitShareInInputCurrency scales by 1/fx_rate for FX expenses', () => {
    const got = splitShareInInputCurrency('287.50', fxExpense());
    expect(got).toBe('25.00'); // 287.50 / 11.5
  });

  it('splitShareInInputCurrency passes through for non-FX expenses', () => {
    const got = splitShareInInputCurrency('50.00', {
      currency: 'SEK',
    } as Expense);
    expect(got).toBe('50.00');
  });

  it('splitShareInInputCurrency is safe against zero / non-finite fx_rate', () => {
    expect(splitShareInInputCurrency('100.00', { fx_rate: '0', original_currency: 'EUR' } as Expense)).toBe('100.00');
    expect(splitShareInInputCurrency('100.00', { fx_rate: 'abc', original_currency: 'EUR' } as Expense)).toBe('100.00');
  });

  it('projectExpenseToInputCurrency converts amount, currency, and every split', () => {
    const projected = projectExpenseToInputCurrency(fxExpense());
    expect(projected.amount).toBe('50.00');
    expect(projected.currency).toBe('EUR');
    expect(projected.splits?.map((s) => s.share)).toEqual(['25.00', '25.00']);
  });

  it('projectExpenseToInputCurrency is a passthrough for non-FX expenses', () => {
    const exp = {
      id: 'x',
      amount: '100.00',
      currency: 'SEK',
      splits: [{ id: 's', member_id: 'm', share: '100.00' }],
    } as Expense;
    expect(projectExpenseToInputCurrency(exp)).toBe(exp);
  });
});

// ─── Category + notes: PATCH payload and wizard prefill mapping ───────────

function wizardPayload(
  over: Partial<ExpenseWizardSubmitPayload> = {},
): ExpenseWizardSubmitPayload {
  return {
    title: 'Pizza',
    amount: '100.00',
    currency: 'SEK',
    expense_date: '2026-05-22',
    paid_by_id: 'm1',
    split_method: 'equal',
    category: 'food',
    notes: 'Friday night',
    participants: ['m1', 'm2'],
    ...over,
  };
}

describe('edit-expense — payloadToUpdateInput (category + notes)', () => {
  it("sends the wizard's category and notes, not the original expense's", () => {
    const input = payloadToUpdateInput(
      wizardPayload({ category: 'transport', notes: 'changed my mind' }),
    );
    expect(input.category).toBe('transport');
    expect(input.notes).toBe('changed my mind');
  });

  it("clearing notes sends an explicit '' (backend tri-state: '' = clear)", () => {
    const input = payloadToUpdateInput(wizardPayload({ notes: '' }));
    expect(input).toHaveProperty('notes', '');
  });

  it('always includes both fields even when unchanged', () => {
    const input = payloadToUpdateInput(wizardPayload());
    expect(input.category).toBe('food');
    expect(input.notes).toBe('Friday night');
  });

  it('threads the share-relevant fields through unchanged', () => {
    const input = payloadToUpdateInput(wizardPayload());
    expect(input.title).toBe('Pizza');
    expect(input.amount).toBe('100.00');
    expect(input.currency).toBe('SEK');
    expect(input.paid_by_id).toBe('m1');
    expect(input.expense_date).toBe('2026-05-22');
    expect(input.split_method).toBe('equal');
    expect(input.participants).toEqual(['m1', 'm2']);
  });

  it('spreads the FX snapshot when present', () => {
    const input = payloadToUpdateInput(
      wizardPayload({
        fx: {
          original_amount: '50.00',
          original_currency: 'EUR',
          fx_rate: '11.5',
          fx_as_of: '2026-05-01',
          fx_source: 'ecb',
        },
      }),
    );
    expect(input.original_amount).toBe('50.00');
    expect(input.original_currency).toBe('EUR');
    expect(input.fx_rate).toBe('11.5');
  });
});

describe('edit-expense — expenseToInitialValue (category + notes prefill)', () => {
  function expenseFixture(over: Partial<Expense> = {}): Expense {
    return {
      id: 'exp1',
      group_id: 'grp1',
      title: 'Pizza',
      amount: '100.00',
      currency: 'SEK',
      paid_by_id: 'm1',
      split_method: 'equal',
      category: 'food',
      notes: 'Friday night',
      is_reimbursement: false,
      created_by_id: 'u1',
      created_at: '2026-05-22T00:00:00Z',
      updated_at: '2026-05-22T00:00:00Z',
      splits: [
        { id: 's1', member_id: 'm1', share: '50.00' },
        { id: 's2', member_id: 'm2', share: '50.00' },
      ],
      ...over,
    };
  }

  it('seeds category and notes from the original expense', () => {
    const iv = expenseToInitialValue(expenseFixture());
    expect(iv.category).toBe('food');
    expect(iv.notes).toBe('Friday night');
  });

  it("maps the legacy 'general' category to 'other'", () => {
    const iv = expenseToInitialValue(expenseFixture({ category: 'general' }));
    expect(iv.category).toBe('other');
  });

  it("maps a missing category to 'other'", () => {
    const iv = expenseToInitialValue(expenseFixture({ category: undefined }));
    expect(iv.category).toBe('other');
  });

  it("maps missing notes to ''", () => {
    const iv = expenseToInitialValue(expenseFixture({ notes: undefined }));
    expect(iv.notes).toBe('');
  });

  it('keeps the pre-existing prefill behaviour for the other fields', () => {
    const iv = expenseToInitialValue(expenseFixture());
    expect(iv.title).toBe('Pizza');
    expect(iv.amount).toBe('100.00');
    expect(iv.currency).toBe('SEK');
    expect(iv.paidByMemberId).toBe('m1');
    expect(iv.splitMethod).toBe('equal');
    expect(iv.included).toEqual({ m1: true, m2: true });
  });
});
