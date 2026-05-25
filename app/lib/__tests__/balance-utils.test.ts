import {
  hasOpenBalance,
  isNonZeroDecimal,
  partitionBulkBalanceCheck,
} from '../balance-utils';

describe('isNonZeroDecimal', () => {
  it('treats "0" as zero', () => {
    expect(isNonZeroDecimal('0')).toBe(false);
  });

  it('treats "0.00" as zero', () => {
    expect(isNonZeroDecimal('0.00')).toBe(false);
  });

  it('treats "-0" as zero', () => {
    expect(isNonZeroDecimal('-0')).toBe(false);
  });

  it('treats "+0.00" as zero', () => {
    expect(isNonZeroDecimal('+0.00')).toBe(false);
  });

  it('treats whitespace-padded "0" as zero', () => {
    expect(isNonZeroDecimal('  0  ')).toBe(false);
  });

  it('treats "0.0000" as zero', () => {
    expect(isNonZeroDecimal('0.0000')).toBe(false);
  });

  it('treats "12.50" as non-zero', () => {
    expect(isNonZeroDecimal('12.50')).toBe(true);
  });

  it('treats "-3.25" as non-zero', () => {
    expect(isNonZeroDecimal('-3.25')).toBe(true);
  });

  it('treats "0.01" as non-zero', () => {
    expect(isNonZeroDecimal('0.01')).toBe(true);
  });

  it('treats "1" as non-zero', () => {
    expect(isNonZeroDecimal('1')).toBe(true);
  });

  it('treats garbage as non-zero (better to block removal)', () => {
    expect(isNonZeroDecimal('abc')).toBe(true);
    expect(isNonZeroDecimal('12,50')).toBe(true);
  });

  it('treats empty string as zero', () => {
    expect(isNonZeroDecimal('')).toBe(false);
  });
});

describe('hasOpenBalance', () => {
  it('returns false on empty list', () => {
    expect(hasOpenBalance([])).toBe(false);
  });

  it('returns false when every balance is zero', () => {
    expect(
      hasOpenBalance([
        { net_balance: '0' },
        { net_balance: '0.00' },
        { net_balance: '-0' },
      ]),
    ).toBe(false);
  });

  it('returns true when any balance is non-zero (positive)', () => {
    expect(
      hasOpenBalance([{ net_balance: '0' }, { net_balance: '0.01' }, { net_balance: '0' }]),
    ).toBe(true);
  });

  it('returns true when any balance is non-zero (negative)', () => {
    expect(
      hasOpenBalance([{ net_balance: '-50.00' }, { net_balance: '0' }]),
    ).toBe(true);
  });
});

describe('partitionBulkBalanceCheck', () => {
  const urls = [
    'https://a.example',
    'https://b.example',
    'https://c.example',
    'https://d.example',
  ];

  it('classifies clear / blocked / errored servers, preserving order', () => {
    const results: PromiseSettledResult<Array<{ net_balance: string }>>[] = [
      { status: 'fulfilled', value: [{ net_balance: '0' }] },
      { status: 'fulfilled', value: [{ net_balance: '12.50' }] },
      { status: 'rejected', reason: new Error('network down') },
      { status: 'fulfilled', value: [] },
    ];
    expect(partitionBulkBalanceCheck(urls, results)).toEqual({
      blockedUrls: ['https://b.example'],
      erroredUrls: ['https://c.example'],
    });
  });

  it('treats missing result slots as errored (fail-safe)', () => {
    expect(partitionBulkBalanceCheck(['https://x'], [])).toEqual({
      blockedUrls: [],
      erroredUrls: ['https://x'],
    });
  });

  it('returns empty arrays when every server is clear', () => {
    const results: PromiseSettledResult<Array<{ net_balance: string }>>[] = [
      { status: 'fulfilled', value: [{ net_balance: '0' }] },
      { status: 'fulfilled', value: [] },
    ];
    expect(
      partitionBulkBalanceCheck(['https://a.example', 'https://b.example'], results),
    ).toEqual({ blockedUrls: [], erroredUrls: [] });
  });
});
