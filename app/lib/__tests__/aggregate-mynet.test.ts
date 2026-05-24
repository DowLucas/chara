import { aggregateMyNetReads, type MyNetRead } from '../aggregate-mynet';
import type { MyNetResponse } from '../api';

function read(
  serverUrl: string,
  data: Partial<MyNetResponse> | null,
): MyNetRead {
  if (data === null) return { serverUrl, data: null };
  return {
    serverUrl,
    data: {
      home_currency: 'EUR',
      net_minor: '0',
      total_legs: 0,
      converted_legs: 0,
      estimated_legs: 0,
      contributing_groups: 0,
      ...data,
    },
  };
}

describe('aggregateMyNetReads', () => {
  it('returns null when reads array is empty', () => {
    expect(aggregateMyNetReads([], 0)).toBeNull();
  });

  it('returns null when every read is null', () => {
    const reads = [read('https://a', null), read('https://b', null)];
    expect(aggregateMyNetReads(reads, 2)).toBeNull();
  });

  it('sums net_minor across accounts that contributed', () => {
    const reads = [
      read('https://a', { net_minor: '12.40' }),
      read('https://b', { net_minor: '0.10' }),
    ];
    const r = aggregateMyNetReads(reads, 2);
    expect(r).toEqual({
      minor: 1250,
      estimatedLegs: 0,
      okAccounts: 2,
      totalAccounts: 2,
      skippedAccounts: 0,
    });
  });

  it('preserves signs (negative net_minor)', () => {
    const reads = [
      read('https://a', { net_minor: '-12.40' }),
      read('https://b', { net_minor: '5.00' }),
    ];
    const r = aggregateMyNetReads(reads, 2);
    expect(r?.minor).toBe(-740);
  });

  it('skips accounts whose read errored (data === null)', () => {
    const reads = [
      read('https://a', { net_minor: '10.00' }),
      read('https://b', null),
    ];
    const r = aggregateMyNetReads(reads, 2);
    expect(r).toEqual({
      minor: 1000,
      estimatedLegs: 0,
      okAccounts: 1,
      totalAccounts: 2,
      skippedAccounts: 1,
    });
  });

  it('sums estimated_legs across accounts', () => {
    const reads = [
      read('https://a', { net_minor: '0', estimated_legs: 3 }),
      read('https://b', { net_minor: '0', estimated_legs: 4 }),
    ];
    const r = aggregateMyNetReads(reads, 2);
    expect(r?.estimatedLegs).toBe(7);
  });

  it('mixed: 3 of 4 ok, one with estimated_legs > 0', () => {
    const reads = [
      read('https://a', { net_minor: '1.00', estimated_legs: 0 }),
      read('https://b', { net_minor: '2.00', estimated_legs: 2 }),
      read('https://c', { net_minor: '3.00', estimated_legs: 0 }),
      read('https://d', null),
    ];
    const r = aggregateMyNetReads(reads, 4);
    expect(r).toEqual({
      minor: 600,
      estimatedLegs: 2,
      okAccounts: 3,
      totalAccounts: 4,
      skippedAccounts: 1,
    });
  });

  it('honors totalAccounts > reads.length (extra missing accounts count as skipped)', () => {
    const reads = [read('https://a', { net_minor: '1.00' })];
    const r = aggregateMyNetReads(reads, 3);
    expect(r).toEqual({
      minor: 100,
      estimatedLegs: 0,
      okAccounts: 1,
      totalAccounts: 3,
      skippedAccounts: 2,
    });
  });

  it('zero net across all accounts still aggregates', () => {
    const reads = [
      read('https://a', { net_minor: '0.00' }),
      read('https://b', { net_minor: '0' }),
    ];
    const r = aggregateMyNetReads(reads, 2);
    expect(r).toEqual({
      minor: 0,
      estimatedLegs: 0,
      okAccounts: 2,
      totalAccounts: 2,
      skippedAccounts: 0,
    });
  });
});
