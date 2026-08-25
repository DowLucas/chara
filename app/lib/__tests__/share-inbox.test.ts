/**
 * Shared files land in an App Group container shared with the widget and
 * share extensions, and the share library never deletes them. The TTL sweep
 * stops receipts from sitting there indefinitely, and only ever touches the
 * extension's own artifacts.
 *
 * Mirrors the threat model in lib/deep-link.ts.
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */

import {
  SHARE_FILE_TTL_MS,
  classifyShareIntent,
  isShareArtifact,
  isShareIntentUrl,
  sweepShareFiles,
} from '../share-inbox';

describe('isShareArtifact', () => {
  it.each([
    '3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf',
    '3F2504E0-4F89-11D3-9A0C-0305E82C3301.jpeg',
    'screenshot_3f2504e0-4f89-11d3-9a0c-0305e82c3301.png',
  ])('recognises %s as something the share extension wrote', (name) => {
    expect(isShareArtifact(name)).toBe(true);
  });

  it.each([
    ['a directory-looking name', 'Library'],
    ['the widget preferences', 'group.app.chara.plist'],
    ['a user-named file', 'kvitto.pdf'],
    ['a traversal', '../3f2504e0-4f89-11d3-9a0c-0305e82c3301.pdf'],
  ])('leaves %s alone', (_label, name) => {
    expect(isShareArtifact(name)).toBe(false);
  });
});

describe('sweepShareFiles', () => {
  const now = 1_800_000_000_000;

  it('removes files older than the TTL and keeps fresh ones', () => {
    const result = sweepShareFiles(
      [
        { name: 'fresh', savedAtMs: now - 1000 },
        { name: 'stale', savedAtMs: now - SHARE_FILE_TTL_MS - 1 },
      ],
      now,
    );
    expect(result).toEqual({ keep: ['fresh'], remove: ['stale'] });
  });

  it('keeps a file exactly at the TTL boundary', () => {
    expect(sweepShareFiles([{ name: 'edge', savedAtMs: now - SHARE_FILE_TTL_MS }], now))
      .toEqual({ keep: ['edge'], remove: [] });
  });

  it('removes a file with a future timestamp — a clock change is not a reason to keep it forever', () => {
    expect(sweepShareFiles([{ name: 'future', savedAtMs: now + SHARE_FILE_TTL_MS * 2 }], now))
      .toEqual({ keep: [], remove: ['future'] });
  });

  it('handles an empty container', () => {
    expect(sweepShareFiles([], now)).toEqual({ keep: [], remove: [] });
  });
});

describe('classifyShareIntent', () => {
  const pdf = { path: 'file:///tmp/a.pdf', mimeType: 'application/pdf', fileName: 'a.pdf', size: 1000 };

  it('ignores a null intent', () => {
    expect(classifyShareIntent(null)).toEqual({ kind: 'ignore' });
  });

  it('ignores an empty file list', () => {
    expect(classifyShareIntent([])).toEqual({ kind: 'ignore' });
  });

  it('accepts a single PDF', () => {
    expect(classifyShareIntent([pdf])).toEqual({
      kind: 'file',
      file: { uri: 'file:///tmp/a.pdf', mimeType: 'application/pdf', name: 'a.pdf' },
      extraFilesIgnored: 0,
    });
  });

  it('accepts a shared image', () => {
    expect(classifyShareIntent([
      { path: 'file:///tmp/p.jpg', mimeType: 'image/jpeg', fileName: 'p.jpg', size: 2000 },
    ])).toEqual({
      kind: 'file',
      file: { uri: 'file:///tmp/p.jpg', mimeType: 'image/jpeg', name: 'p.jpg' },
      extraFilesIgnored: 0,
    });
  });

  it('takes the first of several files and reports how many were dropped', () => {
    expect(classifyShareIntent([pdf, pdf, pdf])).toEqual({
      kind: 'file',
      file: { uri: 'file:///tmp/a.pdf', mimeType: 'application/pdf', name: 'a.pdf' },
      extraFilesIgnored: 2,
    });
  });

  it('rejects an unsupported type', () => {
    expect(classifyShareIntent([
      { path: 'file:///tmp/a.docx', mimeType: 'application/msword', fileName: 'a.docx', size: 10 },
    ])).toEqual({ kind: 'unsupported', reason: 'unsupported' });
  });

  it('rejects an oversized file', () => {
    expect(classifyShareIntent([{ ...pdf, size: 7 * 1024 * 1024 }]))
      .toEqual({ kind: 'unsupported', reason: 'too_large' });
  });

  it('ignores an entry with no path', () => {
    expect(classifyShareIntent([{ path: null, mimeType: 'application/pdf', fileName: 'a.pdf' }]))
      .toEqual({ kind: 'ignore' });
  });

  it('falls back to the basename when the provider omits fileName', () => {
    expect(classifyShareIntent([
      { path: 'file:///tmp/kvitto.pdf', mimeType: null, fileName: null, size: 10 },
    ])).toEqual({
      kind: 'file',
      file: { uri: 'file:///tmp/kvitto.pdf', mimeType: 'application/pdf', name: 'kvitto.pdf' },
      extraFilesIgnored: 0,
    });
  });
});

describe('isShareIntentUrl', () => {
  // iOS ShareExtensionViewController opens the host app with
  // `<scheme>://dataUrl=<scheme>ShareKey#<type>`. Expo Router tries to match
  // `dataUrl=…` as a route and lands on its built-in "Unmatched Route" screen,
  // so +native-intent has to recognise and swallow these.
  it.each([
    'chara://dataUrl=charaShareKey#file',
    'chara://dataUrl=charaShareKey#media',
    'charadev://dataUrl=charadevShareKey#file',
    'CHARA://dataUrl=charaShareKey#weburl',
  ])('recognises the share handoff URL %s', (url) => {
    expect(isShareIntentUrl(url)).toBe(true);
  });

  it.each([
    'chara://join?invite=abc',
    'chara://verify?token=abc&server=https%3A%2F%2Fx',
    'chara://groups/https%3A%2F%2Fx/42',
    'https://chara.app/i/abc',
    '/receipt-inbox',
    '',
  ])('leaves the normal deep link %s alone', (url) => {
    expect(isShareIntentUrl(url)).toBe(false);
  });

  it('does not match a route that merely mentions dataUrl', () => {
    expect(isShareIntentUrl('chara://groups/x/1?dataUrl=charaShareKey')).toBe(false);
  });

  it('tolerates a null or undefined path', () => {
    expect(isShareIntentUrl(null)).toBe(false);
    expect(isShareIntentUrl(undefined)).toBe(false);
  });
});
