import {
  buildScanItemsState,
  itemizedAmounts,
  prorateItemAssignments,
  ScanItem,
  ItemAssignment,
} from '../scan-items';

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

describe('buildScanItemsState', () => {
  function receiptItems(...rows: Array<[number, number]>) {
    // [unit_price_minor, total_minor]
    return rows.map(([unit_price_minor, total_minor], i) => ({
      id: `r${i}`,
      description: `item ${i}`,
      qty: 1,
      unit_price_minor,
      total_minor,
    }));
  }

  it('returns null when the receipt has no line items', () => {
    const receipt = { currency: 'EUR', total_minor: 5000, items: [] };
    expect(
      buildScanItemsState(receipt, { amount_minor: 5000, currency: 'EUR' }, 'EUR'),
    ).toBeNull();
  });

  it('returns null when the applied amount is not in group currency (FX failed)', () => {
    // Foreign receipt whose conversion failed: applied stays in EUR while the
    // group is SEK. The wizard's own FX section handles it, not the item view.
    const receipt = {
      currency: 'EUR',
      total_minor: 5000,
      items: receiptItems([5000, 5000]),
    };
    expect(
      buildScanItemsState(receipt, { amount_minor: 5000, currency: 'EUR' }, 'SEK'),
    ).toBeNull();
  });

  it('passes same-currency receipts through unchanged (factor 1)', () => {
    const its = receiptItems([3000, 3000], [2000, 2000]);
    const receipt = {
      currency: 'EUR',
      total_minor: 5000,
      tax_minor: 0,
      tip_minor: 0,
      items: its,
    };
    const state = buildScanItemsState(
      receipt,
      { amount_minor: 5000, currency: 'EUR' },
      'EUR',
    );
    expect(state).not.toBeNull();
    expect(state!.items).toBe(its); // identity — no remapping
    expect(state!.totalMinor).toBe(5000);
    expect(state!.currency).toBe('EUR');
  });

  it('scales line items, tax and tip into group currency for a foreign receipt', () => {
    // 50.00 EUR receipt converted to 550.00 SEK → factor 11.
    const receipt = {
      currency: 'EUR',
      total_minor: 5000,
      tax_minor: 500,
      tip_minor: 0,
      items: receiptItems([4500, 4500]),
    };
    const state = buildScanItemsState(
      receipt,
      { amount_minor: 55000, currency: 'SEK' },
      'SEK',
    );
    expect(state).not.toBeNull();
    expect(state!.currency).toBe('SEK');
    expect(state!.totalMinor).toBe(55000);
    expect(state!.items[0].total_minor).toBe(49500); // 4500 * 11
    // Tax is exclusive here (4500 + 500 == 5000 total), so it survives, scaled.
    expect(state!.taxMinor).toBe(5500); // 500 * 11
  });

  it('drops tax already baked into the line items (inclusive receipt)', () => {
    // Items already sum to the total; the separately-reported tax is inclusive.
    const receipt = {
      currency: 'EUR',
      total_minor: 5000,
      tax_minor: 500,
      tip_minor: 0,
      items: receiptItems([5000, 5000]),
    };
    const state = buildScanItemsState(
      receipt,
      { amount_minor: 5000, currency: 'EUR' },
      'EUR',
    );
    expect(state!.taxMinor).toBe(0);
  });
});

// itemizedAmounts ----------------------------------------------------------
// The wizard keeps the itemisation and re-derives amounts on every render, so
// that switching split method (and back) is lossless and toggling a member off
// redistributes rather than leaving a stale snapshot behind.
describe('itemizedAmounts', () => {
  const itemization = {
    items: items(['Beer', 6000], ['Pizza', 3000]),
    assignments: { i0: ['a'], i1: ['b'] } as ItemAssignment,
    taxMinor: 0,
    tipMinor: 0,
  };

  it('derives per-member amounts from the assignments', () => {
    expect(itemizedAmounts(itemization, PARTICIPANTS)).toEqual({
      a: 6000,
      b: 3000,
    });
  });

  it('is deterministic — repeated derivation gives the same result', () => {
    const first = itemizedAmounts(itemization, PARTICIPANTS);
    const second = itemizedAmounts(itemization, PARTICIPANTS);
    expect(second).toEqual(first);
  });

  it('redistributes when a participant is removed', () => {
    // Dropping "a" leaves their beer unassigned, so it is shared by the rest.
    const out = itemizedAmounts(itemization, ['b', 'c']);
    expect(out.a).toBeUndefined();
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(sum).toBe(9000);
  });

  it('still totals the receipt when a participant is added', () => {
    const out = itemizedAmounts(itemization, ['a', 'b', 'c', 'd']);
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(sum).toBe(9000);
    // d was on no items, so they owe nothing from the itemised base.
    expect(out.d).toBeUndefined();
  });

  it('prorates tax and tip alongside the items', () => {
    const withTax = { ...itemization, taxMinor: 900, tipMinor: 0 };
    const out = itemizedAmounts(withTax, PARTICIPANTS);
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(sum).toBe(9900);
  });
});
