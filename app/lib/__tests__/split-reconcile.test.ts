import { splitBalance } from '../split-reconcile';

// `offBy = totalSplit − amountPaid`. The mapping below is the exact thing that
// shipped inverted: a split that falls short of the paid amount (offBy < 0)
// read as "over by" instead of "left to assign".
describe('splitBalance', () => {
  it('reports a matched split', () => {
    expect(splitBalance(0)).toBe('matched');
  });

  it('reports an under-assigned split (split < paid) as under', () => {
    // 216.22 assigned against 228.22 paid → 12.00 still unassigned.
    expect(splitBalance(-1200)).toBe('under');
  });

  it('reports an over-assigned split (split > paid) as over', () => {
    expect(splitBalance(1200)).toBe('over');
  });
});
