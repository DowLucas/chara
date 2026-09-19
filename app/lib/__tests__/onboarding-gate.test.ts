import { decideSignedOutEntry, needsNameStep } from '../onboarding-gate';

describe('decideSignedOutEntry', () => {
  it('holds while the flag is still being read', () => {
    expect(decideSignedOutEntry(null)).toBe('pending');
  });

  it('sends a device that never finished onboarding to the welcome flow', () => {
    expect(decideSignedOutEntry(false)).toBe('welcome');
  });

  it('sends a device that already onboarded (e.g. after sign-out) to sign-in', () => {
    expect(decideSignedOutEntry(true)).toBe('sign-in');
  });
});

describe('needsNameStep', () => {
  it('requires the name step when name is missing', () => {
    expect(needsNameStep({ name: '', phone: '' })).toBe(true);
    expect(needsNameStep({ name: '   ', phone: '' })).toBe(true);
    expect(needsNameStep({})).toBe(true);
  });

  it('clears the gate once a name is set — phone is optional', () => {
    // Regression: a user who entered only a name (no phone) and skipped
    // group creation must NOT be bounced back to the name step forever.
    expect(needsNameStep({ name: 'Lucas', phone: '' })).toBe(false);
    expect(needsNameStep({ name: 'Lucas' })).toBe(false);
    expect(needsNameStep({ name: 'Lucas', phone: '+46...' })).toBe(false);
  });
});
