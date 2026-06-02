/**
 * Responsive layout tokens for adapting the phone-first UI to tablets
 * (primarily iPad) and the web build.
 *
 * The whole approach is a **centered max-width content column**: on phones
 * the column is uncapped (full width) so the shipped iPhone layout is
 * unchanged; at tablet widths the content is capped and centered so it
 * reads like a comfortable single column instead of stretching edge to edge.
 *
 * `TABLET_BREAKPOINT === CONTENT_MAX_WIDTH` on purpose: at exactly the
 * breakpoint the column equals the viewport, and one pixel wider it caps and
 * centers — so the transition is continuous with no visible jump. Phone
 * portrait widths top out around 440pt, so no phone ever crosses 600; every
 * iPad in portrait (744pt and up) does.
 *
 * This module is intentionally free of `react-native` imports so the pure
 * `layoutForWidth` resolver is unit-testable under ts-jest. The live hook
 * lives in `use-responsive.ts`.
 */
export const TABLET_BREAKPOINT = 600;
export const CONTENT_MAX_WIDTH = 600;
/** Centered dialogs / sheets sit narrower than the content column on tablet. */
export const SHEET_MAX_WIDTH = 480;

export interface ResponsiveLayout {
  /** Current viewport width. */
  width: number;
  isTablet: boolean;
  /** Max width for the centered content column; `null` on phones (fill). */
  contentMaxWidth: number | null;
  /** Max width for centered modals/sheets; `null` on phones (full width). */
  sheetMaxWidth: number | null;
}

/** Pure layout resolver — unit-testable without a renderer. */
export function layoutForWidth(width: number): ResponsiveLayout {
  const isTablet = width >= TABLET_BREAKPOINT;
  return {
    width,
    isTablet,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : null,
    sheetMaxWidth: isTablet ? SHEET_MAX_WIDTH : null,
  };
}
