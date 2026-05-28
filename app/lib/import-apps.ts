/**
 * Registry of bill-splitting apps a user can import expense history *from*.
 *
 * Adding a new app = one entry here + one extraction-prompt entry on the
 * backend (keyed by `source`) + the matching i18n keys
 * (`import.apps.<source>.label`, `import.guidance.<source>.*`). Everything
 * downstream of capture (reconcile, review, commit) is source-agnostic.
 *
 * Pure data + lookup; no React, no i18n import (the screen resolves the
 * `*Key` fields through `t()` at render time). Unit-tested by
 * lib/__tests__/import-apps.test.ts.
 *
 * Spec: docs/superpowers/specs/2026-05-28-import-from-another-app-design.md
 */

export type ImportSource =
  | 'splitwise'
  | 'tricount'
  | 'settleup'
  | 'splid'
  | 'steven'
  | 'other';

export interface ImportApp {
  /** Stable `source` string sent to the backend `extract` endpoint. */
  source: ImportSource;
  /** i18n key for the picker card label. */
  labelKey: string;
  /** i18n key for the capture-guidance heading on `[source].tsx`. */
  guidanceTitleKey: string;
  /** i18n key for the capture-guidance body copy. */
  guidanceBodyKey: string;
}

/** Display order on the picker grid. `other` is intentionally last. */
export const IMPORT_APPS: ImportApp[] = [
  'splitwise',
  'tricount',
  'settleup',
  'splid',
  'steven',
  'other',
].map((source) => ({
  source: source as ImportSource,
  labelKey: `import.apps.${source}.label`,
  guidanceTitleKey: `import.guidance.${source}.title`,
  guidanceBodyKey: `import.guidance.${source}.body`,
}));

/** Resolve a raw route param to a known app, or `null` if unrecognized. */
export function importAppForSource(source: string | undefined): ImportApp | null {
  if (!source) return null;
  return IMPORT_APPS.find((a) => a.source === source) ?? null;
}
