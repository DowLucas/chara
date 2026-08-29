import {
  makeQueue,
  currentDraft,
  remainingCount,
  advance,
  discardRest,
  changedFields,
  toWizardSplit,
  splitSummary,
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

  it('discardRest drops what is queued behind, keeping the current draft', () => {
    // The button says "discard rest". Dropping the one in the wizard too
    // would contradict the label and lose its generation link on save.
    const q = discardRest(makeQueue([draft({ title: 'A' }), draft(), draft()], 'gen1'));
    expect(currentDraft(q)?.title).toBe('A');
    expect(remainingCount(q)).toBe(0);
  });

  it('discardRest on the last draft changes nothing', () => {
    const q = discardRest(advance(makeQueue([draft({ title: 'A' }), draft({ title: 'B' })], 'gen1')));
    expect(currentDraft(q)?.title).toBe('B');
    expect(remainingCount(q)).toBe(0);
  });

  it('advancing past a discarded queue still exhausts it', () => {
    const q = advance(discardRest(makeQueue([draft(), draft(), draft()], 'gen1')));
    expect(currentDraft(q)).toBeNull();
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

describe('toWizardSplit', () => {
  const base = (over: Partial<VoiceDraft> = {}): VoiceDraft => ({
    source_phrase: 'x',
    title: 'X',
    amount_minor: 100000,
    currency: 'SEK',
    paid_by_id: 'm1',
    split_method: 'equal',
    participants: ['m1', 'm2'],
    ...over,
  });

  it('keeps a percentage split proportional instead of pinning amounts', () => {
    // "Jag betalade 1000 kr och Alex är skyldig 25%" — the user asked for a
    // proportion, so the wizard must show 25%, not 250.00.
    const got = toWizardSplit(
      base({
        split_method: 'percentage',
        shares: [
          { member_id: 'm1', share_minor: 75000 },
          { member_id: 'm2', share_minor: 25000 },
        ],
        percentages: [
          { member_id: 'm1', basis_points: 7500 },
          { member_id: 'm2', basis_points: 2500 },
        ],
      }),
    );
    expect(got.method).toBe('percentage');
    expect(got.pctByMember).toEqual({ m1: '75', m2: '25' });
    expect(got.exactByMember).toBeUndefined();
  });

  it('renders fractional percentages without trailing zeros', () => {
    const got = toWizardSplit(
      base({
        split_method: 'percentage',
        percentages: [
          { member_id: 'm1', basis_points: 3333 },
          { member_id: 'm2', basis_points: 6667 },
        ],
      }),
    );
    expect(got.pctByMember).toEqual({ m1: '33.33', m2: '66.67' });
  });

  it('uses exact amounts for an exact split', () => {
    const got = toWizardSplit(
      base({
        split_method: 'exact',
        shares: [
          { member_id: 'm1', share_minor: 18000 },
          { member_id: 'm2', share_minor: 25000 },
        ],
      }),
    );
    expect(got.method).toBe('exact');
    expect(got.exactByMember).toEqual({ m1: '180.00', m2: '250.00' });
    expect(got.pctByMember).toBeUndefined();
  });

  it('uses equal when there is nothing per-member to carry', () => {
    const got = toWizardSplit(base());
    expect(got.method).toBe('equal');
    expect(got.exactByMember).toBeUndefined();
    expect(got.pctByMember).toBeUndefined();
  });

  it('falls back to exact when a percentage split lost its percentages', () => {
    // An older server sends shares but no percentages; amounts still beat
    // silently splitting evenly and getting the money wrong.
    const got = toWizardSplit(
      base({
        split_method: 'percentage',
        shares: [
          { member_id: 'm1', share_minor: 75000 },
          { member_id: 'm2', share_minor: 25000 },
        ],
      }),
    );
    expect(got.method).toBe('exact');
    expect(got.exactByMember).toEqual({ m1: '750.00', m2: '250.00' });
  });
});

describe('splitSummary', () => {
  const members = [
    { id: 'm1', name: 'Lucas' },
    { id: 'm2', name: 'Anna' },
    { id: 'm3', name: 'Sara' },
  ];
  const d = (over: Partial<VoiceDraft> = {}): VoiceDraft => ({
    source_phrase: 'x',
    title: 'X',
    amount_minor: 100000,
    currency: 'EUR',
    paid_by_id: 'm1',
    split_method: 'equal',
    participants: ['m2', 'm3'],
    ...over,
  });

  it('names who is actually on the split', () => {
    // The reported case: "the rest of the guys" excluded the speaker, and
    // nothing on the card said so.
    const got = splitSummary(d(), members);
    expect(got.memberNames).toEqual(['Anna', 'Sara']);
    expect(got.payerName).toBe('Lucas');
  });

  it('gives a per-person amount for an equal split', () => {
    expect(splitSummary(d(), members).perPersonMinor).toBe(50000);
  });

  it('omits a per-person amount when it would not divide evenly', () => {
    // 1000.01 across two is 500.01 / 500.00 — quoting one number would lie.
    const got = splitSummary(d({ amount_minor: 100001 }), members);
    expect(got.perPersonMinor).toBeUndefined();
  });

  it('has no per-person amount for exact or percentage splits', () => {
    expect(splitSummary(d({ split_method: 'exact' }), members).perPersonMinor).toBeUndefined();
    expect(splitSummary(d({ split_method: 'percentage' }), members).perPersonMinor).toBeUndefined();
  });

  it('keeps roster order rather than the order the model listed people', () => {
    const got = splitSummary(d({ participants: ['m3', 'm2'] }), members);
    expect(got.memberNames).toEqual(['Anna', 'Sara']);
  });

  it('skips ids the roster does not know', () => {
    const got = splitSummary(d({ participants: ['m2', 'm99'] }), members);
    expect(got.memberNames).toEqual(['Anna']);
  });

  it('survives an unknown payer without inventing a name', () => {
    expect(splitSummary(d({ paid_by_id: 'm99' }), members).payerName).toBe('');
  });

  it('handles an empty roster', () => {
    const got = splitSummary(d(), []);
    expect(got.memberNames).toEqual([]);
    expect(got.perPersonMinor).toBeUndefined();
  });
});
