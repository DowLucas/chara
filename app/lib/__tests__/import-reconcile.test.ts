import { reconcile, resolvedMemberId } from '../import-reconcile';

const members = [
  { id: 'm1', name: 'Lucas' },
  { id: 'm2', name: 'Anna' },
];

describe('import reconcile — auto matching', () => {
  it('auto-matches names to members case-insensitively', () => {
    const s = reconcile(['lucas', 'ANNA'], members);
    expect(s.entries).toEqual([
      { name: 'lucas', memberId: 'm1', auto: true },
      { name: 'ANNA', memberId: 'm2', auto: true },
    ]);
    expect(s.newMembers).toEqual([]);
  });

  it('marks unmatched names as new placeholders', () => {
    const s = reconcile(['Lucas', 'Björn'], members);
    expect(s.entries[1]).toEqual({ name: 'Björn', memberId: null, auto: false });
    expect(s.newMembers).toEqual(['Björn']);
  });

  it('dedupes names that differ only by case/whitespace', () => {
    const s = reconcile(['Anna', ' anna ', 'ANNA'], members);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].memberId).toBe('m2');
  });

  it('skips blank names', () => {
    const s = reconcile(['Lucas', '  ', ''], members);
    expect(s.entries.map((e) => e.name)).toEqual(['Lucas']);
  });
});

describe('import reconcile — overrides and confirm', () => {
  it('applies an override that re-maps a name to a chosen member', () => {
    const s = reconcile(['Björn'], members, { 'Björn': 'm1' });
    expect(s.entries[0]).toEqual({ name: 'Björn', memberId: 'm1', auto: false });
    expect(s.newMembers).toEqual([]);
  });

  it('applies an override that forces a matched name into a placeholder', () => {
    const s = reconcile(['Lucas'], members, { Lucas: null });
    expect(s.entries[0].memberId).toBeNull();
    expect(s.newMembers).toEqual(['Lucas']);
  });

  it('confirm is enabled with at least one person, disabled with none', () => {
    expect(reconcile(['Lucas'], members).canConfirm).toBe(true);
    expect(reconcile([], members).canConfirm).toBe(false);
  });
});

describe('resolvedMemberId', () => {
  it('looks up the resolved id by name, case-insensitively', () => {
    const s = reconcile(['Lucas', 'Björn'], members);
    expect(resolvedMemberId(s, 'lucas')).toBe('m1');
    expect(resolvedMemberId(s, 'Björn')).toBeNull();
    expect(resolvedMemberId(s, 'nobody')).toBeNull();
  });
});
