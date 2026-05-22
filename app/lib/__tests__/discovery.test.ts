import { parseInstanceInfo, runDiscoveryHandshake } from '../discovery';
import type { CompatResult } from '../protocol';

const validRaw = {
  mode: 'hosted',
  version: '1.4.2',
  protocol_version: 1,
  min_app_protocol: 1,
  max_app_protocol: 1,
  auth_methods: ['email', 'google'],
  features: { google_auth: true, apple_auth: false, ocr: true },
};

describe('parseInstanceInfo', () => {
  it('returns a typed instance when all required fields are present', () => {
    const parsed = parseInstanceInfo(validRaw);
    expect(parsed).not.toBeNull();
    expect(parsed?.mode).toBe('hosted');
    expect(parsed?.protocol_version).toBe(1);
    expect(parsed?.auth_methods).toEqual(['email', 'google']);
  });

  it('tolerates unknown fields silently', () => {
    const parsed = parseInstanceInfo({ ...validRaw, future_field: 'whatever', another: 123 });
    expect(parsed).not.toBeNull();
  });

  it('returns null when a required field is missing', () => {
    for (const key of [
      'mode',
      'version',
      'protocol_version',
      'min_app_protocol',
      'max_app_protocol',
      'auth_methods',
      'features',
    ]) {
      const clone: Record<string, unknown> = { ...validRaw };
      delete clone[key];
      expect(parseInstanceInfo(clone)).toBeNull();
    }
  });

  it('returns null for invalid mode', () => {
    expect(parseInstanceInfo({ ...validRaw, mode: 'something' })).toBeNull();
  });

  it('returns null for non-string version', () => {
    expect(parseInstanceInfo({ ...validRaw, version: 5 })).toBeNull();
  });

  it('returns null for non-numeric protocol_version', () => {
    expect(parseInstanceInfo({ ...validRaw, protocol_version: '1' })).toBeNull();
  });

  it('returns null when auth_methods has non-string entries', () => {
    expect(parseInstanceInfo({ ...validRaw, auth_methods: ['email', 1] })).toBeNull();
  });

  it('returns null when features has non-boolean entries', () => {
    expect(parseInstanceInfo({ ...validRaw, features: { ocr: 'yes' } })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseInstanceInfo(null)).toBeNull();
    expect(parseInstanceInfo('abc')).toBeNull();
    expect(parseInstanceInfo([validRaw])).toBeNull();
  });
});

describe('runDiscoveryHandshake', () => {
  const okCompat = (): CompatResult => ({ ok: true });

  it('returns ok with the parsed instance on the happy path', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: async () => validRaw,
      checkCompat: okCompat,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instance.mode).toBe('hosted');
  });

  it('returns unreachable on fetch rejection', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: async () => {
        throw new Error('network down');
      },
      checkCompat: okCompat,
    });
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('returns unreachable on timeout', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: () => new Promise(() => {}),
      checkCompat: okCompat,
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('returns not_chara when the response is missing required fields', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: async () => ({ hello: 'world' }),
      checkCompat: okCompat,
    });
    expect(result).toEqual({ ok: false, reason: 'not_chara' });
  });

  it('propagates app_too_old from the compat check', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: async () => validRaw,
      checkCompat: () => ({ ok: false, reason: 'app_too_old' }),
    });
    expect(result).toEqual({ ok: false, reason: 'app_too_old' });
  });

  it('propagates server_too_new from the compat check', async () => {
    const result = await runDiscoveryHandshake({
      fetchInstanceInfo: async () => validRaw,
      checkCompat: () => ({ ok: false, reason: 'server_too_new' }),
    });
    expect(result).toEqual({ ok: false, reason: 'server_too_new' });
  });

  it('passes parsed protocol numbers into the compat check', async () => {
    let captured: { serverProtocol: number; serverMinApp: number; serverMaxApp: number } | null = null;
    await runDiscoveryHandshake({
      fetchInstanceInfo: async () => ({
        ...validRaw,
        protocol_version: 4,
        min_app_protocol: 2,
        max_app_protocol: 7,
      }),
      checkCompat: (args) => {
        captured = args;
        return { ok: true };
      },
    });
    expect(captured).toEqual({ serverProtocol: 4, serverMinApp: 2, serverMaxApp: 7 });
  });
});
