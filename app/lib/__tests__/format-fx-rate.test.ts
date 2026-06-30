/**
 * `formatFxRate` always shows exactly two decimal places, regardless of how
 * many the API sent. The underlying rate keeps full precision elsewhere — this
 * is display only.
 *
 * `expo-localization` reaches into native modules absent in the Node jest env,
 * so we stub it before importing the i18n module.
 */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import i18n, { formatFxRate } from '../i18n';

function normalize(s: string): string {
  return s.replace(/[\s    ]+/g, ' ').trim();
}

describe('formatFxRate', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('trims an 8-decimal API rate to 2 decimals', () => {
    expect(normalize(formatFxRate('11.23559500'))).toBe('11.24');
  });

  it('pads a short rate to 2 decimals', () => {
    expect(normalize(formatFxRate('11.2'))).toBe('11.20');
  });

  it('pads an integer rate to 2 decimals', () => {
    expect(normalize(formatFxRate('12'))).toBe('12.00');
  });

  it('accepts a number', () => {
    expect(normalize(formatFxRate(0.0277))).toBe('0.03');
  });

  it('returns the input unchanged when not a finite number', () => {
    expect(formatFxRate('not-a-rate')).toBe('not-a-rate');
  });
});
