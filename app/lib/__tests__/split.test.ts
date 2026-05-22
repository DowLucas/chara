import { computeSplits, equalSplit, exactSplit, percentageSplit } from '../split';

describe('equalSplit', () => {
  it('splits evenly when divisible', () => {
    const result = equalSplit(100n, ['a', 'b']);
    expect(result).toEqual([
      { memberId: 'a', amountMinor: 50n },
      { memberId: 'b', amountMinor: 50n },
    ]);
  });

  it('distributes remainder pennies to lexicographically first member IDs (matches Go)', () => {
    // 100 / 3 = 33 base, remainder 1 → goes to first sorted member
    const result = equalSplit(100n, ['user_b', 'user_a', 'user_c']);
    // result must be sorted by member id
    expect(result.map((s) => s.memberId)).toEqual(['user_a', 'user_b', 'user_c']);
    expect(result.find((s) => s.memberId === 'user_a')!.amountMinor).toBe(34n);
    expect(result.find((s) => s.memberId === 'user_b')!.amountMinor).toBe(33n);
    expect(result.find((s) => s.memberId === 'user_c')!.amountMinor).toBe(33n);
    const sum = result.reduce((acc, s) => acc + s.amountMinor, 0n);
    expect(sum).toBe(100n);
  });

  it('handles two-penny remainder by giving to the first two sorted members', () => {
    // 101 / 3 = 33 base, remainder 2 → first two
    const result = equalSplit(101n, ['c', 'a', 'b']);
    expect(result.find((s) => s.memberId === 'a')!.amountMinor).toBe(34n);
    expect(result.find((s) => s.memberId === 'b')!.amountMinor).toBe(34n);
    expect(result.find((s) => s.memberId === 'c')!.amountMinor).toBe(33n);
  });

  it('throws for empty members', () => {
    expect(() => equalSplit(100n, [])).toThrow();
  });

  it('handles zero amount', () => {
    const result = equalSplit(0n, ['a', 'b']);
    expect(result).toEqual([
      { memberId: 'a', amountMinor: 0n },
      { memberId: 'b', amountMinor: 0n },
    ]);
  });
});

describe('exactSplit', () => {
  it('validates shares that sum to total', () => {
    const result = exactSplit(100n, [
      { memberId: 'a', amountMinor: 50n },
      { memberId: 'b', amountMinor: 30n },
      { memberId: 'c', amountMinor: 20n },
    ]);
    expect(result).toEqual([
      { memberId: 'a', amountMinor: 50n },
      { memberId: 'b', amountMinor: 30n },
      { memberId: 'c', amountMinor: 20n },
    ]);
  });

  it('throws when shares do not sum to total', () => {
    expect(() =>
      exactSplit(100n, [
        { memberId: 'a', amountMinor: 50n },
        { memberId: 'b', amountMinor: 40n },
      ]),
    ).toThrow();
  });

  it('throws on negative share', () => {
    expect(() =>
      exactSplit(100n, [
        { memberId: 'a', amountMinor: 110n },
        { memberId: 'b', amountMinor: -10n },
      ]),
    ).toThrow();
  });
});

describe('percentageSplit', () => {
  it('splits 50/50', () => {
    const result = percentageSplit(100n, [
      { memberId: 'a', basisPoints: 5000 },
      { memberId: 'b', basisPoints: 5000 },
    ]);
    expect(result[0]).toEqual({ memberId: 'a', amountMinor: 50n });
    expect(result[1]).toEqual({ memberId: 'b', amountMinor: 50n });
  });

  it('distributes remainder to largest fractional remainders', () => {
    const result = percentageSplit(100n, [
      { memberId: 'a', basisPoints: 3334 },
      { memberId: 'b', basisPoints: 3333 },
      { memberId: 'c', basisPoints: 3333 },
    ]);
    const sum = result.reduce((acc, s) => acc + s.amountMinor, 0n);
    expect(sum).toBe(100n);
  });

  it('throws when basis points do not sum to 10000', () => {
    expect(() =>
      percentageSplit(100n, [
        { memberId: 'a', basisPoints: 5000 },
        { memberId: 'b', basisPoints: 4000 },
      ]),
    ).toThrow();
  });

  it('throws on empty pcts', () => {
    expect(() => percentageSplit(100n, [])).toThrow();
  });
});

describe('computeSplits', () => {
  it('routes equal method to equalSplit', () => {
    const result = computeSplits(100n, 'equal', ['b', 'a']);
    expect(result).toHaveLength(2);
    const sum = result.reduce((acc, s) => acc + s.amountMinor, 0n);
    expect(sum).toBe(100n);
  });

  it('routes exact method with provided shares', () => {
    const result = computeSplits(100n, 'exact', ['a', 'b'], [
      { memberId: 'a', amountMinor: 60n },
      { memberId: 'b', amountMinor: 40n },
    ]);
    expect(result).toEqual([
      { memberId: 'a', amountMinor: 60n },
      { memberId: 'b', amountMinor: 40n },
    ]);
  });

  it('routes percentage method with provided shares', () => {
    const result = computeSplits(100n, 'percentage', ['a', 'b'], [
      { memberId: 'a', percentage: 50 },
      { memberId: 'b', percentage: 50 },
    ]);
    const sum = result.reduce((acc, s) => acc + s.amountMinor, 0n);
    expect(sum).toBe(100n);
  });

  it('accepts fractional percentages as basis points implicitly (33.34%)', () => {
    const result = computeSplits(100n, 'percentage', ['a', 'b', 'c'], [
      { memberId: 'a', percentage: 33.34 },
      { memberId: 'b', percentage: 33.33 },
      { memberId: 'c', percentage: 33.33 },
    ]);
    const sum = result.reduce((acc, s) => acc + s.amountMinor, 0n);
    expect(sum).toBe(100n);
  });

  it('throws on unknown method', () => {
    expect(() => computeSplits(100n, 'bogus' as any, ['a'])).toThrow();
  });

  it('throws when exact method missing splits', () => {
    expect(() => computeSplits(100n, 'exact', ['a', 'b'])).toThrow();
  });

  it('throws when percentage method missing splits', () => {
    expect(() => computeSplits(100n, 'percentage', ['a', 'b'])).toThrow();
  });
});
