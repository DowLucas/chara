import { prorateItemAssignments, ScanItem, ItemAssignment } from '../scan-items';

// Test fixtures -------------------------------------------------------------
const PARTICIPANTS = ['a', 'b', 'c']; // memberIDs sorted alphabetically

function items(...rows: Array<[string, number]>): ScanItem[] {
  return rows.map(([description, total_minor], i) => ({
    id: `i${i}`,
    description,
    qty: 1,
    unit_price_minor: total_minor,
    total_minor,
  }));
}

describe('prorateItemAssignments', () => {
  it('returns empty object for empty inputs', () => {
    expect(
      prorateItemAssignments({
        items: [],
        assignments: {},
        taxMinor: 0,
        tipMinor: 0,
        participants: PARTICIPANTS,
      }),
    ).toEqual({});
  });

  it('assigns 1:1 items correctly', () => {
    const result = prorateItemAssignments({
      items: items(['Burger', 1500], ['Salad', 1200], ['Beer', 800]),
      assignments: { i0: ['a'], i1: ['b'], i2: ['c'] },
      taxMinor: 0,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    expect(result).toEqual({ a: 1500, b: 1200, c: 800 });
  });

  it('splits a shared item equally with deterministic remainder (sorted memberID)', () => {
    // 501 / 2 = 250.5 → a gets 251, b gets 250 (sorted asc).
    const result = prorateItemAssignments({
      items: items(['Pizza', 501]),
      assignments: { i0: ['b', 'a'] }, // intentionally out of order
      taxMinor: 0,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    expect(result.a).toBe(251);
    expect(result.b).toBe(250);
    expect(result.c ?? 0).toBe(0);
  });

  it('prorates tax and tip proportionally across participants', () => {
    // a=1500, b=500 → 75% / 25% of subtotal=2000
    // tax 200, tip 100 → a gets +225, b gets +75 → totals 1725 / 575 → sum=2300
    const result = prorateItemAssignments({
      items: items(['X', 1500], ['Y', 500]),
      assignments: { i0: ['a'], i1: ['b'] },
      taxMinor: 200,
      tipMinor: 100,
      participants: PARTICIPANTS,
    });
    expect(result.a + result.b).toBe(2000 + 200 + 100);
    // 1500/2000 * 300 = 225 → a = 1725
    expect(result.a).toBe(1725);
    expect(result.b).toBe(575);
  });

  it('spreads unassigned items equally among all participants', () => {
    // 300 unassigned → 100/100/100 to a/b/c
    const result = prorateItemAssignments({
      items: items(['Mystery', 300]),
      assignments: { i0: [] },
      taxMinor: 0,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    expect(result).toEqual({ a: 100, b: 100, c: 100 });
  });

  it('sum of outputs equals sum of items + tax + tip exactly', () => {
    const it = items(['A', 333], ['B', 777], ['C', 1001]);
    const result = prorateItemAssignments({
      items: it,
      assignments: { i0: ['a', 'b'], i1: ['b', 'c'], i2: ['a', 'c'] },
      taxMinor: 137,
      tipMinor: 89,
      participants: PARTICIPANTS,
    });
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(333 + 777 + 1001 + 137 + 89);
  });

  it('handles items where assignment includes a member not in participants', () => {
    // Should ignore unknown member IDs gracefully.
    const result = prorateItemAssignments({
      items: items(['X', 200]),
      assignments: { i0: ['a', 'zzz'] },
      taxMinor: 0,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    // Only 'a' is valid → gets full amount
    expect(result.a).toBe(200);
    expect(result.b ?? 0).toBe(0);
    expect(result.c ?? 0).toBe(0);
  });

  it('zero tax+tip with all items assigned exactly equals sum of items', () => {
    const result = prorateItemAssignments({
      items: items(['A', 100], ['B', 200]),
      assignments: { i0: ['a'], i1: ['b'] },
      taxMinor: 0,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    expect(result.a + result.b).toBe(300);
  });

  it('tax+tip with zero subtotal (all items unassigned with zero amounts) does not divide by zero', () => {
    // Edge: items exist but all zero. Tax/tip should distribute equally.
    const result = prorateItemAssignments({
      items: items(['Free', 0]),
      assignments: { i0: [] },
      taxMinor: 30,
      tipMinor: 0,
      participants: PARTICIPANTS,
    });
    const total = Object.values(result).reduce((s, v) => s + v, 0);
    expect(total).toBe(30);
  });
});
