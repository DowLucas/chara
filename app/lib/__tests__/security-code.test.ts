import { isValidSecurityCode, normalizeSecurityCode } from '../security-code';

describe('isValidSecurityCode', () => {
  it('accepts 4 digits', () => {
    expect(isValidSecurityCode('1234')).toBe(true);
  });

  it('accepts 6 digits', () => {
    expect(isValidSecurityCode('123456')).toBe(true);
  });

  it('rejects fewer than 4 digits', () => {
    expect(isValidSecurityCode('123')).toBe(false);
  });

  it('rejects more than 6 digits', () => {
    expect(isValidSecurityCode('1234567')).toBe(false);
  });

  it('rejects 5 digits (must be 4 or 6)', () => {
    expect(isValidSecurityCode('12345')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidSecurityCode('12a4')).toBe(false);
    expect(isValidSecurityCode('1 34')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidSecurityCode('')).toBe(false);
  });
});

describe('normalizeSecurityCode', () => {
  it('strips whitespace', () => {
    expect(normalizeSecurityCode('  1234  ')).toBe('1234');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeSecurityCode(null as unknown as string)).toBe('');
    expect(normalizeSecurityCode(undefined as unknown as string)).toBe('');
  });
});
