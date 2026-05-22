import { normalizeServerUrl } from '../server-url';

describe('normalizeServerUrl — happy path', () => {
  it('passes through an already-canonical https URL', () => {
    expect(normalizeServerUrl('https://api.chara.app')).toBe('https://api.chara.app');
  });

  it('strips a bare trailing slash silently', () => {
    expect(normalizeServerUrl('https://api.chara.app/')).toBe('https://api.chara.app');
  });

  it('lowercases an uppercase host', () => {
    expect(normalizeServerUrl('https://API.Chara.APP')).toBe('https://api.chara.app');
  });

  it('strips the default https port (:443)', () => {
    expect(normalizeServerUrl('https://api.chara.app:443')).toBe('https://api.chara.app');
  });

  it('keeps a non-default port', () => {
    expect(normalizeServerUrl('https://api.chara.app:8443')).toBe('https://api.chara.app:8443');
  });

  it('converts IDN host to punycode', () => {
    // bücher.example → xn--bcher-kva.example
    expect(normalizeServerUrl('https://bücher.example')).toBe('https://xn--bcher-kva.example');
  });
});

describe('normalizeServerUrl — http (dev) acceptance', () => {
  it('accepts http://localhost', () => {
    expect(normalizeServerUrl('http://localhost')).toBe('http://localhost');
  });

  it('accepts http://localhost with non-default port', () => {
    expect(normalizeServerUrl('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('strips the default http port (:80) on localhost', () => {
    expect(normalizeServerUrl('http://localhost:80')).toBe('http://localhost');
  });

  it('accepts http://127.0.0.1', () => {
    expect(normalizeServerUrl('http://127.0.0.1')).toBe('http://127.0.0.1');
  });

  it('accepts http on 10.x.x.x', () => {
    expect(normalizeServerUrl('http://10.0.0.5:8080')).toBe('http://10.0.0.5:8080');
  });

  it('accepts http on 192.168.x.x', () => {
    expect(normalizeServerUrl('http://192.168.1.42:3000')).toBe('http://192.168.1.42:3000');
  });

  it('accepts http on 172.16.x.x', () => {
    expect(normalizeServerUrl('http://172.16.0.1')).toBe('http://172.16.0.1');
  });

  it('accepts http on 172.31.x.x (upper bound)', () => {
    expect(normalizeServerUrl('http://172.31.255.254')).toBe('http://172.31.255.254');
  });

  it('rejects http on 172.32.x.x (above private range)', () => {
    const r = normalizeServerUrl('http://172.32.0.1');
    expect(typeof r === 'object' && r !== null && (r as any).kind === 'invalid').toBe(true);
  });

  it('rejects http on 172.15.x.x (below private range)', () => {
    const r = normalizeServerUrl('http://172.15.0.1');
    expect(typeof r === 'object' && r !== null && (r as any).kind === 'invalid').toBe(true);
  });

  it('accepts http on ::1 (IPv6 loopback)', () => {
    // URL normalizes IPv6 to bracketed lowercase form
    expect(normalizeServerUrl('http://[::1]')).toBe('http://[::1]');
  });

  it('accepts http on fc00::/7 prefix', () => {
    expect(normalizeServerUrl('http://[fc00::1]')).toBe('http://[fc00::1]');
    expect(normalizeServerUrl('http://[fd12:3456:789a::1]')).toBe('http://[fd12:3456:789a::1]');
  });
});

describe('normalizeServerUrl — rejections', () => {
  it('rejects http for a public host', () => {
    const r = normalizeServerUrl('http://example.com');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects http on a non-private public IP', () => {
    const r = normalizeServerUrl('http://8.8.8.8');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects a non-empty path', () => {
    const r = normalizeServerUrl('https://example.com/chara/');
    expect((r as any).kind).toBe('invalid');
    expect((r as any).reason).toMatch(/path/i);
  });

  it('rejects a query component', () => {
    const r = normalizeServerUrl('https://example.com/?foo=bar');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects a fragment', () => {
    const r = normalizeServerUrl('https://example.com/#top');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects empty input', () => {
    const r = normalizeServerUrl('');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects whitespace-only input', () => {
    const r = normalizeServerUrl('   ');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects garbage', () => {
    const r = normalizeServerUrl('not a url');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects ftp scheme', () => {
    const r = normalizeServerUrl('ftp://example.com');
    expect((r as any).kind).toBe('invalid');
  });

  it('rejects a URL with userinfo', () => {
    const r = normalizeServerUrl('https://user:pass@example.com');
    expect((r as any).kind).toBe('invalid');
  });
});

describe('normalizeServerUrl — input tolerance', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeServerUrl('  https://api.chara.app  ')).toBe('https://api.chara.app');
  });
});
