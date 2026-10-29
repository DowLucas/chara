/**
 * `fmtMinor` renders the split editor's per-person shares and totals.
 *
 * The bug it fixes: it formatted with `minimumFractionDigits: 0`, so a share
 * of 2140 minor units read "21.4 USD" next to "21.45 USD" on the line above.
 */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import { fmtMinor } from '../SplitEditor.helpers';

describe('fmtMinor', () => {
  it('keeps a trailing zero', () => {
    expect(fmtMinor(2140, 'USD')).toBe('21.40 USD');
  });

  it('shows two decimals on whole amounts', () => {
    expect(fmtMinor(2100, 'USD')).toBe('21.00 USD');
  });

  it('formats the absolute value', () => {
    expect(fmtMinor(-2145, 'USD')).toBe('21.45 USD');
  });
});
