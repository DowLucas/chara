import {
  computeSplits,
  equalSplit,
  exactSplit,
  percentageSplit,
  previewApportion,
} from '../split';

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

describe('previewApportion', () => {
  it('sums exactly to the total when basis points sum to 100% (no phantom remainder)', () => {
    // 0.10 split 33.34/33.33/33.33. Independent Math.round() would give
    // [3,3,3] = 9 öre, showing a phantom "0.01 left". Apportionment gives 10.
    const shares = previewApportion(10, [3334, 3333, 3333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
    expect(shares).toEqual([4, 3, 3]);
  });

  it('matches percentageSplit when basis points sum to 10000', () => {
    const total = 10000;
    const bps = [3333, 3333, 3334];
    const ids = ['a', 'b', 'c'];
    const preview = previewApportion(total, bps);
    const canonical = percentageSplit(
      BigInt(total),
      ids.map((id, i) => ({ memberId: id, basisPoints: bps[i] })),
    ).map((s) => Number(s.amountMinor));
    expect(preview).toEqual(canonical);
  });

  it('distributes the rounding penny to the largest fractional remainder', () => {
    // 101 split 50/50: target 101, floors [50,50], one penny to the first.
    const shares = previewApportion(101, [5000, 5000]);
    expect(shares).toEqual([51, 50]);
  });

  it('reflects a genuine under-allocation when percentages sum below 100%', () => {
    // 50% + 40% of 1.00 → 0.90 assigned, leaving a real 0.10 gap.
    const shares = previewApportion(100, [5000, 4000]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(90);
  });

  it('reflects a genuine over-allocation when percentages exceed 100%', () => {
    const shares = previewApportion(100, [6000, 5000]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(110);
  });

  it('handles zero total', () => {
    expect(previewApportion(0, [5000, 5000])).toEqual([0, 0]);
  });

  it('returns empty for no members', () => {
    expect(previewApportion(100, [])).toEqual([]);
  });

  it('gives the whole total to a sole 100% member', () => {
    expect(previewApportion(9999, [10000])).toEqual([9999]);
  });

  it('absorbs multi-cent drift across many members, summing exactly', () => {
    // Seven members at 1/7 each (1429/1428×6 bp ≈ 100%). Independent rounding
    // would scatter; apportionment must still sum to the exact total.
    const bps = [1429, 1429, 1428, 1429, 1428, 1429, 1428];
    expect(bps.reduce((a, b) => a + b, 0)).toBe(10000);
    const shares = previewApportion(10000, bps); // 100.00
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    // Each member is within a cent of the 1428.57 ideal.
    for (const s of shares) expect([1428, 1429]).toContain(s);
  });

  it('reflects a zero-weight member as a zero share', () => {
    expect(previewApportion(100, [10000, 0])).toEqual([100, 0]);
  });

  it('sums exactly for 10.01 / 3 auto-split (ExpenseWizard Save-gate regression)', () => {
    // The wizard's auto percentage split for 3 members is [3334, 3333, 3333]
    // bp. Independent Math.round per member gives 334+334+334 = 1002 ≠ 1001,
    // which left `offBy` permanently non-zero and Save disabled. The wizard
    // must use this apportionment, whose shares sum to exactly the total.
    const shares = previewApportion(1001, [3334, 3333, 3333]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(shares).toEqual([334, 334, 333]);
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
