import {
  HTTP_NOT_PRIVATE_REASON,
  displayHostFor,
  isMainHostedServer,
  normalizeServerUrl,
} from '../server-url';

describe('normalizeServerUrl — happy path', () => {
  it('passes through an already-canonical https URL', () => {
    expect(normalizeServerUrl('https://api.example.com')).toBe('https://api.example.com');
  });

  it('strips a bare trailing slash silently', () => {
    expect(normalizeServerUrl('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('lowercases an uppercase host', () => {
    expect(normalizeServerUrl('https://API.Example.COM')).toBe('https://api.example.com');
  });

  it('strips the default https port (:443)', () => {
    expect(normalizeServerUrl('https://api.example.com:443')).toBe('https://api.example.com');
  });

  it('keeps a non-default port', () => {
    expect(normalizeServerUrl('https://api.example.com:8443')).toBe('https://api.example.com:8443');
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

  it('reports the http-not-private rejection with a stable reason', () => {
    const r = normalizeServerUrl('http://chara.example.com');
    expect(r).toEqual({ kind: 'invalid', reason: HTTP_NOT_PRIVATE_REASON });
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
    expect(normalizeServerUrl('  https://api.example.com  ')).toBe('https://api.example.com');
  });
});

describe('isMainHostedServer', () => {
  it('matches the canonical hosted URL exactly', () => {
    expect(isMainHostedServer('https://api.example.com')).toBe(true);
  });
  it('matches with a trailing slash', () => {
    expect(isMainHostedServer('https://api.example.com/')).toBe(true);
  });
  it('matches case-insensitively', () => {
    expect(isMainHostedServer('https://API.EXAMPLE.COM')).toBe(true);
  });
  it('rejects self-hosted URLs', () => {
    expect(isMainHostedServer('https://chara.example.com')).toBe(false);
    expect(isMainHostedServer('http://localhost:8080')).toBe(false);
  });
  it('rejects empty / nullish input', () => {
    expect(isMainHostedServer('')).toBe(false);
    expect(isMainHostedServer(undefined as unknown as string)).toBe(false);
  });
});

describe('displayHostFor', () => {
  it('returns the brand label for the main hosted server', () => {
    expect(displayHostFor('https://api.example.com', 'Chara Server')).toBe(
      'Chara Server',
    );
  });
  it('strips scheme + trailing slash for self-hosted URLs', () => {
    expect(displayHostFor('https://chara.example.com/', 'Chara Server')).toBe(
      'chara.example.com',
    );
    expect(displayHostFor('http://10.0.0.5:8080', 'Chara Server')).toBe('10.0.0.5:8080');
  });
});

// Regression guard: an unset EXPO_PUBLIC_HOSTED_API_URL once shipped a release
// build aimed at a dead placeholder host, breaking magic-link login and hiding
// the Apple/Google buttons. A production build with the var unset must now
// throw at module load rather than fall back to any host.
describe('MAIN_HOSTED_SERVER_URL resolution', () => {
  const realEnv = process.env.EXPO_PUBLIC_HOSTED_API_URL;
  const g = global as unknown as { __DEV__?: boolean };
  const realDev = g.__DEV__;

  afterEach(() => {
    if (realEnv === undefined) delete process.env.EXPO_PUBLIC_HOSTED_API_URL;
    else process.env.EXPO_PUBLIC_HOSTED_API_URL = realEnv;
    g.__DEV__ = realDev;
    jest.resetModules();
  });

  it('uses the injected env var when set', () => {
    process.env.EXPO_PUBLIC_HOSTED_API_URL = 'https://hosted.example.org';
    g.__DEV__ = false;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(require('../server-url').MAIN_HOSTED_SERVER_URL).toBe('https://hosted.example.org');
    });
  });

  it('throws in a production build when the env var is unset', () => {
    delete process.env.EXPO_PUBLIC_HOSTED_API_URL;
    g.__DEV__ = false;
    expect(() =>
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../server-url');
      }),
    ).toThrow(/EXPO_PUBLIC_HOSTED_API_URL/);
  });

  it('falls back to localhost in dev/test when unset (no dead placeholder)', () => {
    delete process.env.EXPO_PUBLIC_HOSTED_API_URL;
    g.__DEV__ = true;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(require('../server-url').MAIN_HOSTED_SERVER_URL).toBe('http://localhost:8080');
    });
  });
});
