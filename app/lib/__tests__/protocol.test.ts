import {
  APP_PROTOCOL_VERSION,
  MIN_SERVER_PROTOCOL,
  MAX_SERVER_PROTOCOL,
  PROTOCOL_HEADER,
  checkProtocolCompat,
} from '../protocol';

describe('protocol constants', () => {
  it('APP_PROTOCOL_VERSION is 2', () => {
    expect(APP_PROTOCOL_VERSION).toBe(2);
  });

  it('MIN_SERVER_PROTOCOL is 1', () => {
    expect(MIN_SERVER_PROTOCOL).toBe(1);
  });

  it('MAX_SERVER_PROTOCOL is 2', () => {
    expect(MAX_SERVER_PROTOCOL).toBe(2);
  });

  it('PROTOCOL_HEADER is X-Chara-App-Protocol', () => {
    expect(PROTOCOL_HEADER).toBe('X-Chara-App-Protocol');
  });
});

describe('checkProtocolCompat — success', () => {
  it('returns ok when everything matches', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 2,
        serverMinApp: 1,
        serverMaxApp: 2,
      }),
    ).toEqual({ ok: true });
  });

  it('returns ok at the lower app boundary (app === serverMinApp)', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 1,
        serverMinApp: 1,
        serverMaxApp: 3,
        appProtocol: 1,
        appMinServer: 1,
        appMaxServer: 1,
      }),
    ).toEqual({ ok: true });
  });

  it('returns ok at the upper app boundary (app === serverMaxApp)', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 1,
        serverMinApp: 1,
        serverMaxApp: 3,
        appProtocol: 3,
        appMinServer: 1,
        appMaxServer: 1,
      }),
    ).toEqual({ ok: true });
  });

  it('returns ok at the lower server boundary (server === appMinServer)', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 2,
        serverMinApp: 1,
        serverMaxApp: 5,
        appProtocol: 3,
        appMinServer: 2,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: true });
  });

  it('returns ok at the upper server boundary (server === appMaxServer)', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 5,
        serverMinApp: 1,
        serverMaxApp: 5,
        appProtocol: 3,
        appMinServer: 2,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: true });
  });
});

describe('checkProtocolCompat — failure', () => {
  // Server-side rejection: server demands a newer app than this build.
  it('returns app_too_old when appProtocol < serverMinApp', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 2,
        serverMinApp: 2,
        serverMaxApp: 3,
        appProtocol: 1,
        appMinServer: 1,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: false, reason: 'app_too_old' });
  });

  // Server-side rejection: this app speaks newer than the server understands.
  it('returns app_too_new when appProtocol > serverMaxApp', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 1,
        serverMinApp: 1,
        serverMaxApp: 1,
        appProtocol: 2,
        appMinServer: 1,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: false, reason: 'app_too_new' });
  });

  // App-side rejection: the server is too old for this app.
  it('returns server_too_old when serverProtocol < appMinServer', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 1,
        serverMinApp: 1,
        serverMaxApp: 5,
        appProtocol: 3,
        appMinServer: 2,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: false, reason: 'server_too_old' });
  });

  // App-side rejection: the server is newer than this app understands.
  it('returns server_too_new when serverProtocol > appMaxServer', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: 6,
        serverMinApp: 1,
        serverMaxApp: 10,
        appProtocol: 3,
        appMinServer: 1,
        appMaxServer: 5,
      }),
    ).toEqual({ ok: false, reason: 'server_too_new' });
  });

  // Precedence: when both directions fail, the server-side check (against
  // the app version) wins, because that's what the server would actually
  // return as a 426 in production.
  it('prefers app_too_old over server_too_new when both fail', () => {
    const r = checkProtocolCompat({
      serverProtocol: 10,
      serverMinApp: 5,
      serverMaxApp: 10,
      appProtocol: 1,
      appMinServer: 1,
      appMaxServer: 5,
    });
    expect(r).toEqual({ ok: false, reason: 'app_too_old' });
  });
});

describe('checkProtocolCompat — defaults', () => {
  it('uses APP_PROTOCOL_VERSION / MIN_SERVER_PROTOCOL / MAX_SERVER_PROTOCOL when omitted', () => {
    expect(
      checkProtocolCompat({
        serverProtocol: APP_PROTOCOL_VERSION,
        serverMinApp: APP_PROTOCOL_VERSION,
        serverMaxApp: APP_PROTOCOL_VERSION,
      }),
    ).toEqual({ ok: true });
  });
});
