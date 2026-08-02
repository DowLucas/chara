/**
 * Pure validation for a file the user picked or shared as a receipt. Kept
 * free of React and of any I/O so it can be unit-tested directly — the repo
 * has no render-testing setup (see components/__tests__/GroupEmptyState.test.tsx).
 *
 * The checks here run BEFORE the file is base64-encoded and uploaded, so an
 * unsupported or oversized file costs the user nothing: no multi-megabyte
 * encode, and no OCR slot against the hosted free-tier cap.
 */

/** Matches MaxReceiptImageBytes in backend/internal/handler/receipts.go. */
export const MAX_RECEIPT_FILE_BYTES = 6 * 1024 * 1024;

/** What the scanner is currently working on. PDFs can't produce a thumbnail,
 *  so they carry a filename to display instead of an image preview. */
export type ReceiptSource =
  | { kind: 'image'; uri: string }
  | { kind: 'pdf'; uri: string; name: string };

export type ReceiptFileCheck =
  | { ok: true; mimeType: string; kind: 'image' | 'pdf' }
  | { ok: false; reason: 'too_large' | 'unsupported' };

// Mirrors allowedReceiptMIME in backend/internal/handler/receipts.go. Keep
// the two lists in sync.
const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Lowercase, drop any "; charset=…" parameter, and fold the non-standard
 *  image/jpg onto image/jpeg — mirrors normalizeMime on the backend. */
function normalizeMime(raw: string): string {
  let s = raw.trim().toLowerCase();
  const semi = s.indexOf(';');
  if (semi >= 0) s = s.slice(0, semi).trim();
  return s === 'image/jpg' ? 'image/jpeg' : s;
}

function mimeFromName(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return EXTENSION_MIME[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function checkReceiptFile(input: {
  name: string;
  mimeType?: string | null;
  size?: number | null;
}): ReceiptFileCheck {
  const declared = input.mimeType ? normalizeMime(input.mimeType) : null;
  // Prefer the declared type, but fall back to the extension: some pickers
  // and share providers hand back a null or generic mimeType.
  const mimeType =
    declared && (declared === 'application/pdf' || IMAGE_MIME.has(declared))
      ? declared
      : mimeFromName(input.name);

  if (!mimeType) return { ok: false, reason: 'unsupported' };

  const kind = mimeType === 'application/pdf' ? 'pdf' : 'image';

  // Unsupported wins over too_large: telling someone their .docx is too big
  // implies a smaller .docx would work, which is false.
  if (typeof input.size === 'number' && input.size > MAX_RECEIPT_FILE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  return { ok: true, mimeType, kind };
}
