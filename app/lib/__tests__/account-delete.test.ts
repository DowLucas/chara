// React Native's `__DEV__` global isn't defined in node; api.ts reads it
// at import time inside resolveBaseUrl().
(global as unknown as { __DEV__: boolean }).__DEV__ = false;

// Mock native modules pulled in transitively by api.ts so the import
// resolves under plain node Jest.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiRemove: async () => undefined,
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: {}, manifest: {} },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import {
  AccountDeleteBlockedError,
  aggregateBulkDeleteResults,
  parseDeleteBlockedBody,
} from '../api';

describe('parseDeleteBlockedBody', () => {
  it('parses a well-formed 409 body', () => {
    const body = {
      error: 'balance_not_zero',
      balances: [
        { currency: 'SEK', amount_minor: 12345 },
        { currency: 'EUR', amount_minor: -500 },
      ],
    };
    expect(parseDeleteBlockedBody(body)).toEqual([
      { currency: 'SEK', amount_minor: 12345 },
      { currency: 'EUR', amount_minor: -500 },
    ]);
  });

  it('returns [] for null / non-object / missing balances', () => {
    expect(parseDeleteBlockedBody(null)).toEqual([]);
    expect(parseDeleteBlockedBody('nope')).toEqual([]);
    expect(parseDeleteBlockedBody({})).toEqual([]);
    expect(parseDeleteBlockedBody({ balances: 'oops' })).toEqual([]);
  });

  it('skips malformed entries but keeps valid ones', () => {
    const body = {
      balances: [
        { currency: 'SEK', amount_minor: 100 },
        { currency: 'EUR' }, // missing amount
        { amount_minor: 50 }, // missing currency
        { currency: 'USD', amount_minor: '250' }, // numeric string ok
        null,
      ],
    };
    expect(parseDeleteBlockedBody(body)).toEqual([
      { currency: 'SEK', amount_minor: 100 },
      { currency: 'USD', amount_minor: 250 },
    ]);
  });
});

describe('AccountDeleteBlockedError', () => {
  it('exposes balances and a stable name', () => {
    const balances = [{ currency: 'SEK', amount_minor: 1000 }];
    const e = new AccountDeleteBlockedError(balances);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('AccountDeleteBlockedError');
    expect(e.message).toBe('balance_not_zero');
    expect(e.balances).toBe(balances);
  });
});

describe('aggregateBulkDeleteResults', () => {
  const urls = [
    'https://a.example',
    'https://b.example',
    'https://c.example',
    'https://d.example',
  ];

  it('classifies fulfilled / blocked / failed outcomes per server', () => {
    const settled: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: undefined },
      {
        status: 'rejected',
        reason: new AccountDeleteBlockedError([
          { currency: 'SEK', amount_minor: 7 },
        ]),
      },
      { status: 'rejected', reason: new Error('network down') },
      { status: 'rejected', reason: 'string reason' },
    ];
    const out = aggregateBulkDeleteResults(urls, settled);
    expect(out).toEqual([
      { serverUrl: urls[0], status: 'deleted' },
      {
        serverUrl: urls[1],
        status: 'blocked',
        balances: [{ currency: 'SEK', amount_minor: 7 }],
      },
      { serverUrl: urls[2], status: 'failed', error: 'network down' },
      { serverUrl: urls[3], status: 'failed', error: 'string reason' },
    ]);
  });

  it('marks missing results as failed (defensive)', () => {
    const out = aggregateBulkDeleteResults(['https://x'], []);
    expect(out).toEqual([
      { serverUrl: 'https://x', status: 'failed', error: 'missing_result' },
    ]);
  });
});
