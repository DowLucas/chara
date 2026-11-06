/**
 * Pure helpers for the You tab ((tabs)/you.tsx).
 */
import { spacing } from './theme';

// Widest tile label at its smallest size: "Appearance" in SNPro SemiBold at
// 15pt shrunk to 85% (SettingTile's label style). Re-measure when the
// you.appearance / you.language / you.currencyTile copy changes.
const TILE_LABEL_MIN_WIDTH = 70;
const TILE_COUNT = 3;

/** Width of the text inside one tile: the You tab's body padding, the gaps
 *  between tiles, and the tile's own padding come off the content width. */
function tileTextWidth(contentWidth: number): number {
  const tileWidth = (contentWidth - 2 * spacing.s5 - (TILE_COUNT - 1) * spacing.s2) / TILE_COUNT;
  return tileWidth - 2 * spacing.s3;
}

/** Quick-setting tiles sit three across. They become full-width rows when a
 *  tile is too narrow for its label (small screens, larger text), or above
 *  1.3× font scale, where the value line would truncate. */
export function tileLayoutFor(fontScale: number, contentWidth: number): 'tiles' | 'rows' {
  if (fontScale > 1.3) return 'rows';
  return tileTextWidth(contentWidth) >= TILE_LABEL_MIN_WIDTH * fontScale ? 'tiles' : 'rows';
}

const NBSP = ' ';
const NON_BREAKING_HYPHEN = '‑';

/** The You tab's caption line, "email · phone". The spaces and hyphens inside
 *  the phone number and the space before the dot are non-breaking, so on a
 *  narrow screen the line only wraps after the dot and each part stays whole.
 *  Returns null when neither is set. */
export function contactLine(
  email: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const parts = [
    email?.trim(),
    phone?.trim().replace(/ /g, NBSP).replace(/-/g, NON_BREAKING_HYPHEN),
  ].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(`${NBSP}· `) : null;
}
