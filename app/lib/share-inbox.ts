/**
 * Pure logic for files handed to Chara by the OS share sheet.
 *
 * The share handoff is untrusted input: any installed app can fire the URL
 * that opens Chara. With expo-share-intent the URL carries only a lookup key
 * (the module resolves the real path from the App Group's UserDefaults, never
 * from the URL), so no caller-supplied path reaches this code — but the files
 * it copies into the App Group container are never deleted by the library,
 * and that container survives app termination. The sweep below bounds how
 * long a shared receipt can sit there, readable by every target that shares
 * the group. Same posture as lib/deep-link.ts.
 *
 * Kept free of React and I/O so every branch is unit-testable.
 */

import { checkReceiptFile } from './receipt-file';

/** Shared files are transient handoffs, not storage. An hour is far longer
 *  than any real share-to-expense flow and short enough that a forgotten
 *  receipt doesn't linger in a container three targets can read. */
export const SHARE_FILE_TTL_MS = 60 * 60 * 1000;

/** Partition the container's contents into what to keep and what to delete.
 *  A future timestamp counts as expired: a clock change must not pin a file
 *  in the container permanently. */
export function sweepShareFiles(
  files: Array<{ name: string; savedAtMs: number }>,
  nowMs: number,
): { keep: string[]; remove: string[] } {
  const keep: string[] = [];
  const remove: string[] = [];
  for (const f of files) {
    const age = nowMs - f.savedAtMs;
    if (age >= 0 && age <= SHARE_FILE_TTL_MS) keep.push(f.name);
    else remove.push(f.name);
  }
  return { keep, remove };
}

/** The share extension names what it copies `<UUID>.<ext>` (or
 *  `screenshot_<UUID>.png`). The sweep touches nothing else in the container:
 *  the widget's preferences live there too. */
const ARTIFACT_RE = /^(screenshot_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export function isShareArtifact(name: string): boolean {
  return ARTIFACT_RE.test(name);
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

/** The iOS share extension hands the file over by opening the host app at
 *  `<scheme>://dataUrl=<scheme>ShareKey#<type>` (ShareExtensionViewController).
 *  That is a handoff signal, not a route: Expo Router would try to match
 *  `dataUrl=…` and render its built-in "Unmatched Route" screen. `+native-intent`
 *  uses this to swallow the URL and let ShareIntentListener do the navigating —
 *  it alone knows whether the file is even supported.
 *
 *  Scheme-agnostic so the `charadev` variant is covered too; anchored at the
 *  authority so a normal deep link carrying a `dataUrl` query param is not
 *  mistaken for one. */
const SHARE_INTENT_URL_RE = /^[a-z][a-z0-9+.-]*:\/\/dataUrl=/i;

export function isShareIntentUrl(url: string | null | undefined): boolean {
  return !!url && SHARE_INTENT_URL_RE.test(url);
}
