import {
  makeQueue,
  currentDraft,
  remainingCount,
  advance,
  discardRest,
  changedFields,
  type VoiceDraft,
} from '../voice-drafts';

const draft = (over: Partial<VoiceDraft> = {}): VoiceDraft => ({
  source_phrase: 'I paid 480 for dinner',
  title: 'Dinner',
  amount_minor: 48000,
  currency: 'SEK',
  paid_by_id: 'm1',
  split_method: 'equal',
  participants: ['m1', 'm2'],
  ...over,
});

describe('voice draft queue', () => {
  it('starts on the first draft', () => {
    const q = makeQueue([draft({ title: 'A' }), draft({ title: 'B' })], 'gen1');
    expect(currentDraft(q)?.title).toBe('A');
    expect(remainingCount(q)).toBe(1);
  });

  it('advances to the next draft', () => {
    const q = advance(makeQueue([draft({ title: 'A' }), draft({ title: 'B' })], 'gen1'));
    expect(currentDraft(q)?.title).toBe('B');
    expect(remainingCount(q)).toBe(0);
  });

  it('returns null once exhausted', () => {
    const q = advance(advance(makeQueue([draft()], 'gen1')));
    expect(currentDraft(q)).toBeNull();
    expect(remainingCount(q)).toBe(0);
  });

  it('never advances past the end', () => {
    let q = makeQueue([draft()], 'gen1');
    for (let i = 0; i < 5; i++) q = advance(q);
    expect(currentDraft(q)).toBeNull();
    expect(remainingCount(q)).toBe(0);
  });

  it('discardRest empties the queue', () => {
    const q = discardRest(makeQueue([draft(), draft(), draft()], 'gen1'));
    expect(currentDraft(q)).toBeNull();
    expect(remainingCount(q)).toBe(0);
  });

  it('handles an empty draft list', () => {
    const q = makeQueue([], 'gen1');
    expect(currentDraft(q)).toBeNull();
    expect(remainingCount(q)).toBe(0);
  });

  it('does not mutate the queue it is given', () => {
    const q = makeQueue([draft(), draft()], 'gen1');
    advance(q);
    discardRest(q);
    expect(q.index).toBe(0);
  });

  it('keeps the generation id across transitions', () => {
    const q = advance(makeQueue([draft(), draft()], 'gen1'));
    expect(q.generationId).toBe('gen1');
  });
});

describe('changedFields', () => {
  const saved = {
    title: 'Dinner',
    amountMinor: 48000,
    currency: 'SEK',
    paidById: 'm1',
    splitMethod: 'equal',
    participants: ['m1', 'm2'],
  };

  it('reports nothing when the user saved the draft untouched', () => {
    expect(changedFields(draft(), saved)).toEqual([]);
  });

  it('reports each field the user altered', () => {
    const got = changedFields(draft(), {
      ...saved,
      title: 'Dinner at Husaren',
      amountMinor: 50000,
      paidById: 'm2',
    });
    expect(got.sort()).toEqual(['amount', 'paid_by', 'title']);
  });

  it('treats a reordered participant list as unchanged', () => {
    expect(changedFields(draft(), { ...saved, participants: ['m2', 'm1'] })).toEqual([]);
  });

  it('detects a changed participant set', () => {
    expect(changedFields(draft(), { ...saved, participants: ['m1'] })).toEqual(['participants']);
  });

  it('detects a changed split method', () => {
    expect(changedFields(draft(), { ...saved, splitMethod: 'exact' })).toEqual(['split_method']);
  });

  it('detects a changed currency', () => {
    expect(changedFields(draft(), { ...saved, currency: 'EUR' })).toEqual(['currency']);
  });
});
