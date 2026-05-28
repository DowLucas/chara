import { reviewRowValidity, reviewState, ReviewRow } from '../import-review';

function row(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    key: 'k',
    name: 'Anna',
    direction: 'owes_you',
    amount: '340.00',
    confidence: 0.9,
    ...overrides,
  };
}

describe('reviewRowValidity', () => {
  it('passes a complete row', () => {
    expect(reviewRowValidity(row()).ok).toBe(true);
  });

  it('rejects a non-positive or unparseable amount', () => {
    expect(reviewRowValidity(row({ amount: '0' })).amountValid).toBe(false);
    expect(reviewRowValidity(row({ amount: '' })).amountValid).toBe(false);
    expect(reviewRowValidity(row({ amount: 'abc' })).amountValid).toBe(false);
    expect(reviewRowValidity(row({ amount: '-5.00' })).amountValid).toBe(false);
  });

  it('requires a valid direction', () => {
    expect(reviewRowValidity(row({ direction: 'owes_you' })).directionValid).toBe(true);
    expect(reviewRowValidity(row({ direction: 'you_owe' })).directionValid).toBe(true);
    // @ts-expect-error testing an invalid runtime value
    expect(reviewRowValidity(row({ direction: 'sideways' })).directionValid).toBe(false);
    expect(reviewRowValidity(row({ direction: undefined })).directionValid).toBe(false);
  });
});

describe('reviewState', () => {
  it('sorts rows low-confidence first, stable for ties', () => {
    const s = reviewState({
      rows: [
        row({ key: 'a', confidence: 0.9 }),
        row({ key: 'b', confidence: 0.2 }),
        row({ key: 'c', confidence: 0.9 }),
      ],
      groupCurrency: 'SEK',
      extractedCurrency: 'SEK',
    });
    expect(s.sortedRows.map((r) => r.key)).toEqual(['b', 'a', 'c']);
  });

  it('blocks the whole import on currency mismatch', () => {
    const s = reviewState({
      rows: [row()],
      groupCurrency: 'SEK',
      extractedCurrency: 'EUR',
    });
    expect(s.currencyMismatch).toBe(true);
    expect(s.canConfirm).toBe(false);
  });

  it('ignores currency case when comparing', () => {
    const s = reviewState({
      rows: [row()],
      groupCurrency: 'sek',
      extractedCurrency: 'SEK',
    });
    expect(s.currencyMismatch).toBe(false);
  });

  it('totals owed-to-you and you-owe separately, in minor units', () => {
    const s = reviewState({
      rows: [
        row({ direction: 'owes_you', amount: '340.00' }),
        row({ direction: 'owes_you', amount: '10.50' }),
        row({ direction: 'you_owe', amount: '90.00' }),
        row({ direction: 'owes_you', amount: 'bad' }),
      ],
      groupCurrency: 'SEK',
      extractedCurrency: 'SEK',
    });
    expect(s.owedToYouMinor).toBe(34000 + 1050);
    expect(s.youOweMinor).toBe(9000);
  });

  it('disables confirm when any row is invalid', () => {
    const s = reviewState({
      rows: [row(), row({ amount: '0' })],
      groupCurrency: 'SEK',
      extractedCurrency: 'SEK',
    });
    expect(s.canConfirm).toBe(false);
  });

  it('disables confirm with no rows', () => {
    const s = reviewState({ rows: [], groupCurrency: 'SEK', extractedCurrency: 'SEK' });
    expect(s.canConfirm).toBe(false);
  });

  it('enables confirm when currency matches and every row is valid', () => {
    const s = reviewState({
      rows: [row(), row({ key: 'k2', direction: 'you_owe', amount: '90.00' })],
      groupCurrency: 'SEK',
      extractedCurrency: 'SEK',
    });
    expect(s.canConfirm).toBe(true);
  });
});
