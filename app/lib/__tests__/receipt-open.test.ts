/**
 * Opening a PDF receipt must not leave the app (data:/presigned URLs punted
 * to the browser). The helper stages the bytes in the app cache and hands
 * the file to the OS viewer via the share sheet; callers fall back on false.
 */

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async (_url: string, uri: string) => ({ uri, status: 200 })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { openPdfExternally, receiptShareFilename } from '../receipt-open';

const fs = FileSystem as jest.Mocked<typeof FileSystem>;
const sharing = Sharing as jest.Mocked<typeof Sharing>;

beforeEach(() => jest.clearAllMocks());

describe('receiptShareFilename', () => {
  it('keeps a plain pdf name', () => {
    expect(receiptShareFilename('kvitto.pdf')).toBe('kvitto.pdf');
  });

  it('appends .pdf when missing', () => {
    expect(receiptShareFilename('kvitto')).toBe('kvitto.pdf');
  });

  it('defaults when name is absent', () => {
    expect(receiptShareFilename(undefined)).toBe('receipt.pdf');
  });

  it('strips path separators and other hostile characters', () => {
    expect(receiptShareFilename('../../etc/passwd')).toBe('etc_passwd.pdf');
    expect(receiptShareFilename('a/b\\c:d.pdf')).toBe('a_b_c_d.pdf');
  });
});

describe('openPdfExternally', () => {
  it('writes base64 to the cache and shares the file', async () => {
    const ok = await openPdfExternally({ kind: 'base64', base64: 'QUJD', name: 'a.pdf' });
    expect(ok).toBe(true);
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/shared-receipts/a.pdf',
      'QUJD',
      { encoding: 'base64' },
    );
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/shared-receipts/a.pdf', {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  });

  it('downloads a url (with headers) then shares', async () => {
    const ok = await openPdfExternally({
      kind: 'url',
      url: 'https://s3.example/x?sig=1',
      headers: { Authorization: 'Bearer t' },
    });
    expect(ok).toBe(true);
    expect(fs.downloadAsync).toHaveBeenCalledWith(
      'https://s3.example/x?sig=1',
      'file:///cache/shared-receipts/receipt.pdf',
      { headers: { Authorization: 'Bearer t' } },
    );
    expect(sharing.shareAsync).toHaveBeenCalled();
  });

  it('returns false without sharing when sharing is unavailable (web)', async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    const ok = await openPdfExternally({ kind: 'base64', base64: 'QUJD' });
    expect(ok).toBe(false);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('returns false when the download fails rather than sharing a broken file', async () => {
    fs.downloadAsync.mockResolvedValueOnce({ uri: 'x', status: 403 } as never);
    const ok = await openPdfExternally({ kind: 'url', url: 'https://s3.example/x' });
    expect(ok).toBe(false);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('returns false when the write throws', async () => {
    fs.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    const ok = await openPdfExternally({ kind: 'base64', base64: 'QUJD' });
    expect(ok).toBe(false);
  });
});
