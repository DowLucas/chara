import { splitExtraCharge, withExtraCharge } from '../extra-charge';

const PARTICIPANTS = ['a', 'b', 'c'];

describe('splitExtraCharge', () => {
  it('returns {} when there is nothing to split', () => {
    expect(splitExtraCharge(0, PARTICIPANTS)).toEqual({});
    expect(splitExtraCharge(500, [])).toEqual({});
  });

  it('splits evenly when it divides cleanly', () => {
    expect(splitExtraCharge(300, PARTICIPANTS)).toEqual({ a: 100, b: 100, c: 100 });
  });

  it('gives remainder minor units to the lexicographically-first members', () => {
    // 500 / 3 = 166 remainder 2 -> a and b take one extra öre each.
    expect(splitExtraCharge(500, PARTICIPANTS)).toEqual({ a: 167, b: 167, c: 166 });
  });

  it('always sums back to the original amount', () => {
    for (const amount of [1, 2, 7, 99, 101, 1234, 99999]) {
      const shares = splitExtraCharge(amount, PARTICIPANTS);
      const sum = Object.values(shares).reduce((s, v) => s + v, 0);
      expect(sum).toBe(amount);
    }
  });

  it('is independent of participant ordering', () => {
    expect(splitExtraCharge(500, ['c', 'a', 'b'])).toEqual(
      splitExtraCharge(500, ['a', 'b', 'c']),
    );
  });

  it('handles a single participant', () => {
    expect(splitExtraCharge(499, ['solo'])).toEqual({ solo: 499 });
  });
});

describe('withExtraCharge', () => {
  it('adds the even share on top of an existing base split', () => {
    const base = { a: 1000, b: 2000, c: 3000 };
    expect(withExtraCharge(base, 300, PARTICIPANTS)).toEqual({
      a: 1100,
      b: 2100,
      c: 3100,
    });
  });

  it('leaves the base untouched when the charge is zero', () => {
    const base = { a: 1000, b: 2000 };
    expect(withExtraCharge(base, 0, ['a', 'b'])).toEqual(base);
  });

  it('includes a participant who has no base amount', () => {
    // c ordered nothing but still shares the deposit/fee.
    const base = { a: 1000, b: 2000 };
    expect(withExtraCharge(base, 300, PARTICIPANTS)).toEqual({
      a: 1100,
      b: 2100,
      c: 100,
    });
  });

  it('does not mutate the base map', () => {
    const base = { a: 1000 };
    withExtraCharge(base, 300, PARTICIPANTS);
    expect(base).toEqual({ a: 1000 });
  });

  it('preserves the invariant base total + charge == new total', () => {
    const base = { a: 1000, b: 2000, c: 3001 };
    const baseSum = Object.values(base).reduce((s, v) => s + v, 0);
    const out = withExtraCharge(base, 505, PARTICIPANTS);
    const outSum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(outSum).toBe(baseSum + 505);
  });
});
