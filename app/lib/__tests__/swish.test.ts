import {
  normalizeSwishNumber,
  isSwishEligible,
  buildSwishLink,
  formatSwishDetails,
} from '../swish';

// Helper: URI-decode the data param → JSON. The Swish app expects
// `?data=<encodeURIComponent(JSON.stringify(...))>`; base64 was the wrong
// encoding choice in the original design doc — Swish rejects it.
function decodeSwishLink(link: string): any {
  const url = new URL(link);
  expect(url.protocol).toBe('swish:');
  const data = url.searchParams.get('data');
  if (!data) throw new Error('no data param');
  // URLSearchParams already decoded `data`; just parse the JSON.
  return JSON.parse(data);
}

describe('normalizeSwishNumber', () => {
  it('accepts already-canonical E.164', () => {
    expect(normalizeSwishNumber('+46701234567')).toBe('+46701234567');
  });

  it('converts leading 0 to +46', () => {
    expect(normalizeSwishNumber('0701234567')).toBe('+46701234567');
  });

  it('strips spaces and dashes', () => {
    expect(normalizeSwishNumber('070-123 45 67')).toBe('+46701234567');
  });

  it('returns null for non-mobile prefix', () => {
    expect(normalizeSwishNumber('012-broken')).toBeNull();
  });

  it('returns null for empty', () => {
    expect(normalizeSwishNumber('')).toBeNull();
  });

  it('returns null for non-SE country', () => {
    expect(normalizeSwishNumber('+15551234567')).toBeNull();
  });

  it('returns null for 08 (landline, not mobile)', () => {
    expect(normalizeSwishNumber('+46801234567')).toBeNull();
  });

  it('accepts all valid SE mobile prefixes', () => {
    for (const p of ['70', '72', '73', '76', '79']) {
      expect(normalizeSwishNumber(`+46${p}1234567`)).toBe(`+46${p}1234567`);
    }
  });
});

describe('isSwishEligible', () => {
  const base = {
    currency: 'SEK',
    payeeSwishNumber: '+46701234567',
    platform: 'ios' as const,
    amountMinor: 24000,
  };

  it('true when all conditions met (ios)', () => {
    expect(isSwishEligible(base)).toBe(true);
  });

  it('true on android', () => {
    expect(isSwishEligible({ ...base, platform: 'android' })).toBe(true);
  });

  it('false on web', () => {
    expect(isSwishEligible({ ...base, platform: 'web' })).toBe(false);
  });

  it('false when currency is not SEK', () => {
    expect(isSwishEligible({ ...base, currency: 'EUR' })).toBe(false);
  });

  it('false when payeeSwishNumber is null', () => {
    expect(isSwishEligible({ ...base, payeeSwishNumber: null })).toBe(false);
  });

  it('false when payeeSwishNumber is invalid', () => {
    expect(isSwishEligible({ ...base, payeeSwishNumber: '012-broken' })).toBe(false);
  });

  it('false when amountMinor is 0', () => {
    expect(isSwishEligible({ ...base, amountMinor: 0 })).toBe(false);
  });

  it('false when amountMinor is negative', () => {
    expect(isSwishEligible({ ...base, amountMinor: -100 })).toBe(false);
  });
});

describe('buildSwishLink', () => {
  const baseOpts = {
    payeeSwishNumber: '+46701234567',
    amountMinor: 24000,
    currency: 'SEK' as const,
    groupName: 'Friday dinner',
    pendingId: '01HGZABCDEFGHJKMNPQRSTVWXY',
  };

  it('produces swish:// scheme with data param', () => {
    const link = buildSwishLink(baseOpts);
    expect(link.startsWith('swish://payment?data=')).toBe(true);
  });

  it('encodes payload as URI-encoded JSON (not base64)', () => {
    const link = buildSwishLink(baseOpts);
    const data = link.slice('swish://payment?data='.length);
    // URI-encoded JSON always starts with %7B (encoded `{`).
    expect(data.startsWith('%7B')).toBe(true);
  });

  it('encodes amount 24000 minor → "240.00" (decimal string)', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.amount.value).toBe('240.00');
    expect(typeof payload.amount.value).toBe('string');
  });

  it('encodes amount 100 minor → "1.00"', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, amountMinor: 100 }));
    expect(payload.amount.value).toBe('1.00');
  });

  it('preserves öre exactly (59014 minor → "590.14", no rounding)', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, amountMinor: 59014 }));
    expect(payload.amount.value).toBe('590.14');
  });

  it('preserves öre exactly (22682 minor → "226.82", no rounding up to 227)', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, amountMinor: 22682 }));
    expect(payload.amount.value).toBe('226.82');
  });

  it('pads single-digit öre to 2 fraction digits (2901 minor → "29.01")', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, amountMinor: 2901 }));
    expect(payload.amount.value).toBe('29.01');
  });

  it('encodes payee in national format (0XXXXXXXXX), not E.164', () => {
    // The current Swish iOS/Android apps reject `+46…` deep-links with
    // "incorrect format". Live production pages (italy26 donate.html)
    // send national format successfully.
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.payee.value).toBe('0701234567');
    expect(payload.payee.value).not.toContain('+');
  });

  it('omits editable keys (Swish rejects payloads with editable:false)', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.amount).not.toHaveProperty('editable');
    expect(payload.message).not.toHaveProperty('editable');
    expect(payload.payee).not.toHaveProperty('editable');
  });

  it('does not include callbackurl (merchant-only field, rejected by consumer parser)', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload).not.toHaveProperty('callbackurl');
  });

  it('version is 1', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.version).toBe(1);
  });

  it('truncates message to Swish 50-char limit', () => {
    const longName = 'a'.repeat(60);
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, groupName: longName }));
    expect(payload.message.value.length).toBeLessThanOrEqual(50);
    expect(payload.message.value.startsWith('Chara: ')).toBe(true);
  });

  it('uses "Chara: " (colon, not middle dot) — middle dot is rejected by Swish', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, groupName: 'Friday dinner' }));
    expect(payload.message.value).toBe('Chara: Friday dinner');
    expect(payload.message.value).not.toContain('·');
  });

  it('strips characters outside Swish charset (·, -, *, emoji)', () => {
    const payload = decodeSwishLink(buildSwishLink({
      ...baseOpts,
      groupName: 'My·trip-2024 🇸🇪 *fun*',
    }));
    // Disallowed chars become spaces and collapse; only the allowed set
    // remains. The `·`, `-`, `*`, and emoji must all be gone.
    expect(payload.message.value).not.toMatch(/[·\-*]/);
    expect(payload.message.value).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    expect(payload.message.value).toMatch(/^[a-zA-ZåäöÅÄÖ0-9:;.,?!()" ]+$/);
  });

  it('throws on invalid payeeSwishNumber', () => {
    expect(() => buildSwishLink({ ...baseOpts, payeeSwishNumber: '012-broken' })).toThrow();
  });

  it('accepts E.164-format input and emits national-format in payload', () => {
    const payload = decodeSwishLink(
      buildSwishLink({ ...baseOpts, payeeSwishNumber: '+46701234567' }),
    );
    expect(payload.payee.value).toBe('0701234567');
  });
});

describe('formatSwishDetails', () => {
  const opts = {
    payeeSwishNumber: '+46701234567',
    amountMinor: 24000,
    currency: 'SEK' as const,
    groupName: 'Friday dinner',
  };

  it('formats phone with spaces', () => {
    expect(formatSwishDetails(opts).phone).toBe('070 123 45 67');
  });

  it('formats amount with currency', () => {
    expect(formatSwishDetails(opts).amount).toBe('240.00 SEK');
  });

  it('formats message identically to link payload', () => {
    expect(formatSwishDetails(opts).message).toBe('Chara: Friday dinner');
  });

  it('truncates long group names in message to 50 chars', () => {
    const longName = 'a'.repeat(60);
    const out = formatSwishDetails({ ...opts, groupName: longName });
    expect(out.message.length).toBeLessThanOrEqual(50);
    expect(out.message.startsWith('Chara: ')).toBe(true);
  });
});
