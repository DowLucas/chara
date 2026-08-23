/**
 * The share handoff is untrusted input. The app is opened by a URL that any
 * installed app can fire, and shared files land in an App Group container
 * shared with the widget and share extensions. Token validation stops a
 * caller-supplied path from walking out of that container; the TTL sweep
 * stops receipts from sitting in it indefinitely.
 *
 * Mirrors the threat model in lib/deep-link.ts.
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */

import {
  SHARE_FILE_TTL_MS,
  classifyShareIntent,
  isValidShareToken,
  resolveSharePath,
  sweepShareFiles,
} from '../share-inbox';

const DIR = 'file:///app-group/shared-receipts/';

describe('isValidShareToken', () => {
  it('accepts a 24-char lowercase hex token', () => {
    expect(isValidShareToken('0123456789abcdef01234567')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
    ['too short', '0123456789abcdef0123456'],
    ['too long', '0123456789abcdef012345678'],
    ['uppercase hex', '0123456789ABCDEF01234567'],
    ['non-hex', '0123456789abcdefg1234567'],
    ['relative traversal', '../../../etc/passwd'],
    ['encoded traversal', '%2e%2e%2f%2e%2e%2fetc'],
    ['absolute path', '/etc/passwd'],
    ['embedded separator', '0123456789ab/def01234567'],
    ['null byte', '0123456789abcdef0123456\0'],
  ])('rejects %s', (_label, token) => {
    expect(isValidShareToken(token as string)).toBe(false);
  });
});

describe('resolveSharePath', () => {
  it('joins a valid token onto the container directory', () => {
    expect(resolveSharePath(DIR, '0123456789abcdef01234567'))
      .toBe('file:///app-group/shared-receipts/0123456789abcdef01234567');
  });

  it('returns null for a traversal attempt rather than a joined path', () => {
    expect(resolveSharePath(DIR, '../../../etc/passwd')).toBeNull();
  });

  it('returns null for an absolute path', () => {
    expect(resolveSharePath(DIR, '/etc/passwd')).toBeNull();
  });

  it('tolerates a directory without a trailing slash', () => {
    expect(resolveSharePath('file:///app-group/shared-receipts', '0123456789abcdef01234567'))
      .toBe('file:///app-group/shared-receipts/0123456789abcdef01234567');
  });
});

describe('sweepShareFiles', () => {
  const now = 1_800_000_000_000;

  it('removes files older than the TTL and keeps fresh ones', () => {
    const result = sweepShareFiles(
      [
        { token: 'fresh', savedAtMs: now - 1000 },
        { token: 'stale', savedAtMs: now - SHARE_FILE_TTL_MS - 1 },
      ],
      now,
    );
    expect(result).toEqual({ keep: ['fresh'], remove: ['stale'] });
  });

  it('keeps a file exactly at the TTL boundary', () => {
    expect(sweepShareFiles([{ token: 'edge', savedAtMs: now - SHARE_FILE_TTL_MS }], now))
      .toEqual({ keep: ['edge'], remove: [] });
  });

  it('removes a file with a future timestamp — a clock change is not a reason to keep it forever', () => {
    expect(sweepShareFiles([{ token: 'future', savedAtMs: now + SHARE_FILE_TTL_MS * 2 }], now))
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
