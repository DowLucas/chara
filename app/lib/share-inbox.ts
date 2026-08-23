/**
 * Pure logic for files handed to Chara by the OS share sheet.
 *
 * Security: the share extension writes the incoming file into the App Group
 * container and opens the host app by URL. That URL can be fired by ANY
 * installed app, so the app must never join a caller-supplied string onto a
 * container path — `chara://receipt-inbox?f=../../…` would read outside the
 * container. We accept only an opaque fixed-shape token and resolve it
 * strictly against one directory. Same posture as lib/deep-link.ts.
 *
 * Kept free of React and I/O so every branch is unit-testable.
 */

import { checkReceiptFile } from './receipt-file';

/** Shared files are transient handoffs, not storage. An hour is far longer
 *  than any real share-to-expense flow and short enough that a forgotten
 *  receipt doesn't linger in a container three targets can read. */
export const SHARE_FILE_TTL_MS = 60 * 60 * 1000;

/** Tokens are minted by the share extension: exactly 24 lowercase hex chars.
 *  Anchored, so no separator, traversal sequence, or null byte can pass. */
const TOKEN_RE = /^[0-9a-f]{24}$/;

export function isValidShareToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Resolve a token to its path inside `dir`, or null if the token is not a
 *  well-formed token. Never returns a path for untrusted input. */
export function resolveSharePath(dir: string, token: string): string | null {
  if (!isValidShareToken(token)) return null;
  return dir.endsWith('/') ? `${dir}${token}` : `${dir}/${token}`;
}

/** Partition the container's contents into what to keep and what to delete.
 *  A future timestamp counts as expired: a clock change must not pin a file
 *  in the container permanently. */
export function sweepShareFiles(
  files: Array<{ token: string; savedAtMs: number }>,
  nowMs: number,
): { keep: string[]; remove: string[] } {
  const keep: string[] = [];
  const remove: string[] = [];
  for (const f of files) {
    const age = nowMs - f.savedAtMs;
    if (age >= 0 && age <= SHARE_FILE_TTL_MS) keep.push(f.token);
    else remove.push(f.token);
  }
  return { keep, remove };
}

export type SharedFile = { uri: string; mimeType: string; name: string };

export type ShareIntent =
  | { kind: 'ignore' }
  | { kind: 'unsupported'; reason: 'too_large' | 'unsupported' }
  | { kind: 'file'; file: SharedFile; extraFilesIgnored: number };

function basename(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const slash = clean.lastIndexOf('/');
  return slash >= 0 ? clean.slice(slash + 1) : clean;
}

/** Classify what the OS handed us. v1 processes the first file only; the
 *  count of dropped files is reported so the UI can say so plainly rather
 *  than silently discarding them. */
export function classifyShareIntent(
  files:
    | Array<{
        path?: string | null;
        mimeType?: string | null;
        fileName?: string | null;
        size?: number | null;
      }>
    | null
    | undefined,
): ShareIntent {
  if (!files || files.length === 0) return { kind: 'ignore' };

  const first = files[0];
  if (!first?.path) return { kind: 'ignore' };

  const name = first.fileName ?? basename(first.path);
  const check = checkReceiptFile({ name, mimeType: first.mimeType, size: first.size });
  if (!check.ok) return { kind: 'unsupported', reason: check.reason };

  return {
    kind: 'file',
    file: { uri: first.path, mimeType: check.mimeType, name },
    extraFilesIgnored: files.length - 1,
  };
}
