/**
 * `formatMinorUnits` formats in the currency's *home* locale (Wise/Revolut
 * convention), not the app's UI language. SEK reads "kr" in Swedish style,
 * USD in American style, EUR in continental-European style — regardless of
 * what `i18next` is set to.
 *
 * `expo-localization` reaches into native modules that don't exist in the
 * Node jest env, so we stub it before importing the i18n module.
 */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import i18n, { formatMinorUnits } from '../i18n';

/** Strip every flavour of horizontal whitespace so we compare digits +
 *  grouping chars only — Node's ICU sometimes emits NBSP (U+00A0) where a
 *  device emits narrow NBSP (U+202F) and the difference isn't material. */
function normalize(s: string): string {
  return s.replace(/[\s    ]+/g, ' ').trim();
}

describe('formatMinorUnits — currency home locale', () => {
  for (const lng of ['en', 'sv', 'de', 'ja']) {
    describe(`app language = ${lng}`, () => {
      beforeAll(async () => {
        await i18n.changeLanguage(lng);
      });

      it('SEK renders in Swedish style (trailing kr, comma decimal)', () => {
        const out = normalize(formatMinorUnits(37500, 'SEK'));
        // sv-SE → "375,00 kr"
        expect(out).toMatch(/^375,00 ?kr$/);
      });

      it('USD renders in American style (leading $, dot decimal)', () => {
        const out = normalize(formatMinorUnits(500, 'USD'));
        expect(out).toBe('$5.00');
      });

      it('EUR renders in continental-European style (trailing €, comma decimal)', () => {
        const out = normalize(formatMinorUnits(500, 'EUR'));
        // de-DE → "5,00 €"
        expect(out).toMatch(/^5,00 ?€$/);
      });

      it('JPY renders in Japanese style (leading ¥, no decimals)', () => {
        // Note: formatMinorUnits currently assumes 2 decimals everywhere, so
        // 500 minor → ¥5, not ¥500. That's a pre-existing quirk; this test
        // pins behaviour against the locale-style change, not that quirk.
        const out = normalize(formatMinorUnits(500, 'JPY'));
        // ja-JP renders the yen sign as fullwidth ￥ (U+FFE5); other
        // locales use the halfwidth ¥ (U+00A5).
        expect(out).toMatch(/^[¥￥]5$/);
      });
    });
  }

  it('falls back to the app locale for currencies without a home mapping', async () => {
    await i18n.changeLanguage('en');
    // XTS is the ISO 4217 test code; not in our map, valid for Intl.
    const out = normalize(formatMinorUnits(500, 'XTS'));
    // en-US fallback would render the code itself; we just assert it ran.
    expect(out).toMatch(/5\.00/);
  });
});
