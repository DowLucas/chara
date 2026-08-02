/**
 * Receipt file validation runs before we spend an OCR slot (hosted free tier
 * is 3/month) and before a multi-megabyte base64 encode, so it has to be
 * exact about what it accepts.
 *
 * Spec: docs/superpowers/specs/2026-08-02-document-receipt-extraction-design.md
 */

import {
  MAX_RECEIPT_FILE_BYTES,
  checkReceiptFile,
} from '../receipt-file';

describe('checkReceiptFile', () => {
  it('accepts a PDF by declared mime type', () => {
    expect(checkReceiptFile({ name: 'kvitto.pdf', mimeType: 'application/pdf', size: 120_000 }))
      .toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('accepts a JPEG', () => {
    expect(checkReceiptFile({ name: 'photo.jpg', mimeType: 'image/jpeg', size: 900_000 }))
      .toEqual({ ok: true, mimeType: 'image/jpeg', kind: 'image' });
  });

  it('infers the mime type from the extension when the picker omits it', () => {
    expect(checkReceiptFile({ name: 'receipt.pdf', mimeType: null, size: 1000 }))
      .toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('is case-insensitive about the extension', () => {
    expect(checkReceiptFile({ name: 'RECEIPT.PDF', mimeType: null, size: 1000 }))
      .toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('normalises image/jpg to image/jpeg', () => {
    expect(checkReceiptFile({ name: 'a.jpg', mimeType: 'image/jpg', size: 1000 }))
      .toEqual({ ok: true, mimeType: 'image/jpeg', kind: 'image' });
  });

  it('strips charset parameters from the mime type', () => {
    expect(checkReceiptFile({ name: 'a.pdf', mimeType: 'application/pdf; charset=binary', size: 1000 }))
      .toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('rejects a Word document', () => {
    expect(checkReceiptFile({
      name: 'invoice.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 1000,
    })).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('rejects an unknown extension with no mime type', () => {
    expect(checkReceiptFile({ name: 'receipt', mimeType: null, size: 1000 }))
      .toEqual({ ok: false, reason: 'unsupported' });
  });

  it('rejects a file over the 6 MB cap', () => {
    expect(checkReceiptFile({
      name: 'huge.pdf',
      mimeType: 'application/pdf',
      size: MAX_RECEIPT_FILE_BYTES + 1,
    })).toEqual({ ok: false, reason: 'too_large' });
  });

  it('accepts a file exactly at the cap', () => {
    expect(checkReceiptFile({
      name: 'exact.pdf',
      mimeType: 'application/pdf',
      size: MAX_RECEIPT_FILE_BYTES,
    })).toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('accepts when the size is unknown — the server still enforces the cap', () => {
    expect(checkReceiptFile({ name: 'a.pdf', mimeType: 'application/pdf', size: null }))
      .toEqual({ ok: true, mimeType: 'application/pdf', kind: 'pdf' });
  });

  it('reports unsupported before too_large for an oversized unsupported file', () => {
    expect(checkReceiptFile({
      name: 'huge.docx',
      mimeType: 'application/msword',
      size: MAX_RECEIPT_FILE_BYTES + 1,
    })).toEqual({ ok: false, reason: 'unsupported' });
  });
});
