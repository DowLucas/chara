/**
 * Expo Router's web HTML shell. Wraps every statically-rendered page; it runs
 * in Node at build time only, so no browser globals here.
 *
 * Reason this file exists: on web the accounts blob — including a long-lived
 * refresh token — is persisted in `localStorage` (see `lib/blob-storage.ts`),
 * which any injected script can read. A Content-Security-Policy is the
 * mitigation that keeps a third-party or injected script from running (and
 * from exfiltrating what it reads) in the first place.
 *
 * The dev policy is deliberately looser: Metro's web runtime evaluates bundled
 * code and talks to the dev server over websockets, both of which the
 * production policy forbids.
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  // Metro serves the dev bundle through eval-based module wrappers and injects
  // inline bootstrap scripts.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Dev server + HMR websocket, on whatever host/port Metro picked.
  "connect-src 'self' https: http: ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const CSP = process.env.NODE_ENV === 'production' ? PRODUCTION_CSP : DEVELOPMENT_CSP;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        {/*
          Disables body scrolling on web so ScrollView components behave the
          way they do on native. Remove if the page should scroll natively.
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
