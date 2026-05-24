import { resolveHomeCurrency } from '../resolve-home-currency';

describe('resolveHomeCurrency', () => {
  it('returns explicit when set (isExplicit: true)', () => {
    const r = resolveHomeCurrency({
      explicit: 'SEK',
      localeCurrency: 'USD',
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r).toEqual({ homeCurrency: 'SEK', isExplicit: true });
  });

  it('uses locale currency when no explicit', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: 'USD',
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r).toEqual({ homeCurrency: 'USD', isExplicit: false });
  });

  it('uses first-group currency when no explicit and no locale', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: null,
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r).toEqual({ homeCurrency: 'JPY', isExplicit: false });
  });

  it('falls back to EUR when all null', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: null,
      defaultAccountFirstGroupCurrency: null,
    });
    expect(r).toEqual({ homeCurrency: 'EUR', isExplicit: false });
  });

  it('skips invalid locale currency and falls through to first-group', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: 'x',
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r.homeCurrency).toBe('JPY');
  });

  it('skips invalid first-group currency and falls through to EUR', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: null,
      defaultAccountFirstGroupCurrency: 'usd',
    });
    expect(r.homeCurrency).toBe('EUR');
  });

  it('rejects lowercase ISO at locale level', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: 'usd',
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r.homeCurrency).toBe('JPY');
  });

  it('does not validate the explicit value (trusted)', () => {
    // The explicit value flows from a controlled setter; the resolver should
    // surface whatever was stored rather than silently falling back.
    const r = resolveHomeCurrency({
      explicit: 'SEK',
      localeCurrency: null,
      defaultAccountFirstGroupCurrency: null,
    });
    expect(r).toEqual({ homeCurrency: 'SEK', isExplicit: true });
  });

  it('empty string locale is treated as invalid', () => {
    const r = resolveHomeCurrency({
      explicit: null,
      localeCurrency: '',
      defaultAccountFirstGroupCurrency: 'JPY',
    });
    expect(r.homeCurrency).toBe('JPY');
  });
});
