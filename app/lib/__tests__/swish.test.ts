import {
  normalizeSwishNumber,
  isSwishEligible,
  buildSwishLink,
  formatSwishDetails,
} from '../swish';

// Helper: decode URL-safe base64 (no padding) → JSON
function decodeSwishLink(link: string): any {
  const url = new URL(link);
  expect(url.protocol).toBe('swish:');
  const data = url.searchParams.get('data');
  if (!data) throw new Error('no data param');
  // restore standard base64
  let b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
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

  it('uses URL-safe base64 with no padding', () => {
    const link = buildSwishLink(baseOpts);
    const data = link.slice('swish://payment?data='.length);
    expect(data).not.toContain('+');
    expect(data).not.toContain('/');
    expect(data).not.toContain('=');
  });

  it('encodes amount 24000 minor → "240.00"', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.amount.value).toBe('240.00');
  });

  it('encodes amount 100 minor → "1.00"', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, amountMinor: 100 }));
    expect(payload.amount.value).toBe('1.00');
  });

  it('encodes payee in national format without +46 or spaces', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.payee.value).toBe('0701234567');
  });

  it('payee.editable and amount.editable are false', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.amount.editable).toBe(false);
    expect(payload.message.editable).toBe(false);
  });

  it('version is 1', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.version).toBe(1);
  });

  it('truncates group name to 40 chars in message', () => {
    const longName = 'a'.repeat(60);
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, groupName: longName }));
    // group portion ≤ 40 chars
    const prefix = 'Chara · ';
    expect(payload.message.value.startsWith(prefix)).toBe(true);
    const groupPortion = payload.message.value.slice(prefix.length);
    expect(groupPortion.length).toBeLessThanOrEqual(40);
    expect(groupPortion).toBe('a'.repeat(40));
  });

  it('preserves short group name with "Chara · " prefix', () => {
    const payload = decodeSwishLink(buildSwishLink({ ...baseOpts, groupName: 'Friday dinner' }));
    expect(payload.message.value).toBe('Chara · Friday dinner');
  });

  it('includes callbackurl with pendingId', () => {
    const payload = decodeSwishLink(buildSwishLink(baseOpts));
    expect(payload.callbackurl).toBe(
      'chara://settle/swish/return?pendingId=01HGZABCDEFGHJKMNPQRSTVWXY',
    );
  });

  it('throws on invalid payeeSwishNumber', () => {
    expect(() => buildSwishLink({ ...baseOpts, payeeSwishNumber: '012-broken' })).toThrow();
  });

  it('accepts national-format number and canonicalizes for payload', () => {
    const payload = decodeSwishLink(
      buildSwishLink({ ...baseOpts, payeeSwishNumber: '0701234567' }),
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
    expect(formatSwishDetails(opts).message).toBe('Chara · Friday dinner');
  });

  it('truncates long group names in message', () => {
    const longName = 'a'.repeat(60);
    const out = formatSwishDetails({ ...opts, groupName: longName });
    expect(out.message).toBe('Chara · ' + 'a'.repeat(40));
  });
});
