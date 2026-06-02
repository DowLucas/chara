import {
  layoutForWidth,
  TABLET_BREAKPOINT,
  CONTENT_MAX_WIDTH,
  SHEET_MAX_WIDTH,
} from '../responsive';

describe('layoutForWidth', () => {
  it('treats phone widths as non-tablet and never caps content', () => {
    for (const w of [320, 375, 390, 414, 440]) {
      const l = layoutForWidth(w);
      expect(l.isTablet).toBe(false);
      expect(l.contentMaxWidth).toBeNull();
      expect(l.sheetMaxWidth).toBeNull();
      expect(l.width).toBe(w);
    }
  });

  it('treats iPad widths as tablet and caps content + sheets', () => {
    for (const w of [744, 810, 820, 834, 1024, 1366]) {
      const l = layoutForWidth(w);
      expect(l.isTablet).toBe(true);
      expect(l.contentMaxWidth).toBe(CONTENT_MAX_WIDTH);
      expect(l.sheetMaxWidth).toBe(SHEET_MAX_WIDTH);
    }
  });

  it('switches exactly at the breakpoint (inclusive)', () => {
    expect(layoutForWidth(TABLET_BREAKPOINT - 1).isTablet).toBe(false);
    expect(layoutForWidth(TABLET_BREAKPOINT).isTablet).toBe(true);
  });

  it('keeps the breakpoint equal to the column width for a jump-free transition', () => {
    // At exactly the breakpoint the column equals the viewport (full width);
    // one pixel wider it caps and centers — no visible jump.
    expect(TABLET_BREAKPOINT).toBe(CONTENT_MAX_WIDTH);
  });
});
