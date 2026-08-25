import { settlementMethodFor } from '../settlement-method';

// The backend's settlements_method_check CHECK constraint (migration 000013)
// accepts exactly manual/swish/vipps/mobilepay. Anything else 400s, so the
// mapper's job is to never hand the API a value the constraint rejects.
describe('settlementMethodFor', () => {
  it('passes through rails the backend knows', () => {
    expect(settlementMethodFor('swish')).toBe('swish');
    expect(settlementMethodFor('vipps')).toBe('vipps');
    expect(settlementMethodFor('mobilepay')).toBe('mobilepay');
    expect(settlementMethodFor('manual')).toBe('manual');
  });

  // paypal/bank exist in the settle screen's MethodId union but have no
  // backend enum value. Sending them raw would 400 and the user would see a
  // failed settle for a payment they already made out-of-band.
  it('falls back to manual for rails the backend has no value for', () => {
    expect(settlementMethodFor('paypal')).toBe('manual');
    expect(settlementMethodFor('bank')).toBe('manual');
  });

  it('falls back to manual for anything unrecognised', () => {
    expect(settlementMethodFor('')).toBe('manual');
    expect(settlementMethodFor('wero')).toBe('manual');
  });
});
