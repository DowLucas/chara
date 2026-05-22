import { parseInviteUrl } from '../invite-url';

const TOKEN = '01HGZABCDEFGHJKMNPQRSTVWXY';
const HTTPS = `https://api.chara.app/api/groups/join/${TOKEN}`;

describe('parseInviteUrl — three accepted forms', () => {
  it('parses the canonical HTTPS form', () => {
    expect(parseInviteUrl(HTTPS)).toEqual({
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });

  it('parses the chara:// app-scheme form', () => {
    const link = `chara://join?invite=${encodeURIComponent(HTTPS)}`;
    expect(parseInviteUrl(link)).toEqual({
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });

  it('parses the legacy quits:// alias identically', () => {
    const link = `quits://join?invite=${encodeURIComponent(HTTPS)}`;
    expect(parseInviteUrl(link)).toEqual({
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });

  it('all three forms produce the same InviteRef', () => {
    const a = parseInviteUrl(HTTPS);
    const b = parseInviteUrl(`chara://join?invite=${encodeURIComponent(HTTPS)}`);
    const c = parseInviteUrl(`quits://join?invite=${encodeURIComponent(HTTPS)}`);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('parseInviteUrl — tolerance', () => {
  it('tolerates a trailing slash on the HTTPS form', () => {
    expect(parseInviteUrl(`${HTTPS}/`)).toEqual({
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });

  it('preserves a non-default port through parse', () => {
    const httpsWithPort = `https://api.chara.app:8443/api/groups/join/${TOKEN}`;
    expect(parseInviteUrl(httpsWithPort)).toEqual({
      serverUrl: 'https://api.chara.app:8443',
      token: TOKEN,
    });
  });

  it('preserves a non-default port through the chara:// form too', () => {
    const httpsWithPort = `https://api.chara.app:8443/api/groups/join/${TOKEN}`;
    const link = `chara://join?invite=${encodeURIComponent(httpsWithPort)}`;
    expect(parseInviteUrl(link)).toEqual({
      serverUrl: 'https://api.chara.app:8443',
      token: TOKEN,
    });
  });

  it('round-trips a URL-encoded token', () => {
    const messyToken = 'abc.def-XYZ_123';
    const httpsUrl = `https://api.chara.app/api/groups/join/${encodeURIComponent(messyToken)}`;
    const result = parseInviteUrl(httpsUrl);
    expect((result as any).token).toBe(messyToken);
  });

  it('lowercases the host in the returned serverUrl', () => {
    const r = parseInviteUrl(`https://API.Chara.App/api/groups/join/${TOKEN}`);
    expect((r as any).serverUrl).toBe('https://api.chara.app');
  });

  it('trims surrounding whitespace', () => {
    expect(parseInviteUrl(`  ${HTTPS}  `)).toEqual({
      serverUrl: 'https://api.chara.app',
      token: TOKEN,
    });
  });
});

describe('parseInviteUrl — rejections', () => {
  function assertInvalid(input: string) {
    const r = parseInviteUrl(input);
    expect((r as any).kind).toBe('invalid');
  }

  it('rejects empty input', () => {
    assertInvalid('');
  });

  it('rejects garbage', () => {
    assertInvalid('not a url');
  });

  it('rejects the wrong path', () => {
    assertInvalid(`https://api.chara.app/api/groups/${TOKEN}`);
    assertInvalid(`https://api.chara.app/other/path/${TOKEN}`);
  });

  it('rejects a missing token segment', () => {
    assertInvalid('https://api.chara.app/api/groups/join/');
    assertInvalid('https://api.chara.app/api/groups/join');
  });

  it('rejects extra path segments after the token', () => {
    assertInvalid(`https://api.chara.app/api/groups/join/${TOKEN}/extra`);
  });

  it('rejects an http (non-https) public HTTPS form', () => {
    assertInvalid(`http://api.chara.app/api/groups/join/${TOKEN}`);
  });

  it('rejects chara:// without ?invite=', () => {
    assertInvalid('chara://join');
    assertInvalid('chara://join?other=foo');
  });

  it('rejects chara://join with empty invite', () => {
    assertInvalid('chara://join?invite=');
  });

  it('rejects chara://join with non-https invite payload', () => {
    const httpForm = `http://api.chara.app/api/groups/join/${TOKEN}`;
    assertInvalid(`chara://join?invite=${encodeURIComponent(httpForm)}`);
  });

  it('rejects chara://join with garbage invite payload', () => {
    assertInvalid(`chara://join?invite=${encodeURIComponent('not a url')}`);
  });

  it('rejects quits://join without invite param', () => {
    assertInvalid('quits://join');
  });

  it('rejects a chara:// link with the wrong host (not "join")', () => {
    assertInvalid(`chara://other?invite=${encodeURIComponent(HTTPS)}`);
  });

  it('rejects an HTTPS URL whose server-url portion fails normalization', () => {
    // A non-empty path other than the join path is caught earlier; this
    // covers e.g. an https URL with a query on the join path itself.
    assertInvalid(`https://api.chara.app/api/groups/join/${TOKEN}?x=1`);
  });
});
