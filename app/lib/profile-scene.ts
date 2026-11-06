/**
 * Pure helpers for the You tab's night-print header
 * (components/profile/SceneHeader.tsx).
 */
import { APPEARANCE_PREFERENCES, type AppearancePreference } from './appearance';

/** Tapping the Appearance tile steps System → Light → Dark → System. */
export function nextAppearance(p: AppearancePreference): AppearancePreference {
  const i = APPEARANCE_PREFERENCES.indexOf(p);
  return APPEARANCE_PREFERENCES[(i + 1) % APPEARANCE_PREFERENCES.length];
}

const MAX_PER_LINE = 3;

/** The first name carved as a two-line seal, the way a print carries its
 *  artist's seal: "Maja" → MA / JA. Grapheme-safe for non-Latin names;
 *  "?" when there is no name yet. */
export function sealLines(name: string | null | undefined): string[] {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const chars = Array.from(first.toLocaleUpperCase());
  if (chars.length === 0) return ['?'];
  if (chars.length <= 2) return [chars.join('')];
  const top = Math.min(MAX_PER_LINE, Math.ceil(chars.length / 2));
  return [chars.slice(0, top).join(''), chars.slice(top, top + MAX_PER_LINE).join('')];
}

/** Quick-setting tiles truncate values at large Dynamic Type sizes, so they
 *  become full-width rows above 1.3× font scale. */
export function tileLayoutFor(fontScale: number): 'tiles' | 'rows' {
  return fontScale > 1.3 ? 'rows' : 'tiles';
}
