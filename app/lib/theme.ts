import type { TextStyle } from 'react-native';

export const colors = {
  // Brand anchors
  sandDune: '#F0E5CC',
  darkCoffee: '#2D1F1A',
  tomatoJam: '#B83D3D',
  palmLeaf: '#8FA055',
  honeyBronze: '#E0A040',

  // Semantic aliases
  paper: '#F0E5CC',
  bone: '#E6D9BB',
  graphite: '#2D1F1A',
  lead: '#6B5A4E',
  vermillion: '#B83D3D',
  // moss reads "you're owed / settled / positive". The pale brand olive
  // (#8FA055) fails WCAG AA on the cream paper background when used as text,
  // so the semantic token is a darker olive that hits ~4.6:1. The brand
  // anchor `palmLeaf` keeps the pale shade for surfaces that aren't text.
  moss: '#586D2A',
  brick: '#8A2A2A',
  citrine: '#E0A040',

  ruleSoft: 'rgba(45, 31, 26, 0.07)',
  fgOnAccent: '#F4F1E6',
} as const;

// Per-group accent palette: 8 Edo-period pigments tuned to sit on `paper`
// without colliding with the semantic moss/brick/vermillion signals. Used
// only on the home dashboard group avatar; never on amounts or status.
// Index is meaningful (hash %8 picks here), so do not reorder casually —
// reordering changes every existing group's default color.
export const groupAccentSwatches = [
  '#1F3A6E', // Ai — deep indigo
  '#3E6FA8', // Hanada — mid blue
  '#5E908A', // Asagi — pale teal
  '#6B4B7E', // Murasaki — imperial purple
  '#C26A7F', // Beni — safflower pink
  '#C99A2E', // Yamabuki — gold ochre
  '#7A4F2E', // Cha — tea brown
  '#1F1A18', // Sumi — ink black
] as const;

// On Android, fontWeight is ignored for custom fonts.
// Use explicit named font files per weight instead.
export const fonts = {
  regular: 'SNPro-Regular',      // weight 400
  medium: 'SNPro-Medium',        // weight 500
  semiBold: 'SNPro-SemiBold',    // weight 600
  mono: 'JetBrainsMono',         // weight 400
  monoMedium: 'JetBrainsMono-Medium', // weight 500
} as const;

// Semantic aliases matching design usage
export const fontDisplay = fonts.semiBold;   // group names, headers, hero amounts
export const fontBody = fonts.regular;       // body copy
export const fontBodyMedium = fonts.medium;  // emphasized body (button labels, row titles)
export const fontMono = fonts.mono;          // amounts, dates, captions
export const fontMonoMedium = fonts.monoMedium; // emphasized mono amounts

export const spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
  s8: 64,
  s9: 96,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  displayXl: 60,
  displayL: 44,
  displayM: 32,
  displayS: 22,
  bodyL: 19,
  body: 17,
  bodyS: 15,
  caption: 13,
} as const;

// --- Typography tokens ---------------------------------------------------
// Centralized text styles. Each token bundles fontFamily + fontSize +
// fontWeight so that screens never wire those primitives together by hand.
// Add a new token here instead of inlining family/size pairs in a StyleSheet.
//
// Accessibility (OS-level font scaling) is handled in `components/Text.tsx`,
// which is the single surface every screen should render text through.
// ------------------------------------------------------------------------

type TypographyToken = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'fontWeight' | 'letterSpacing' | 'lineHeight'
>;

const t = <T extends Record<string, TypographyToken>>(tokens: T): T => tokens;

export const typography = t({
  // Hero amounts — the giant numbers on the home/group balance screens.
  amountHero: { fontFamily: fonts.mono, fontSize: fontSize.displayXl, fontWeight: '400' },
  amountXL: { fontFamily: fonts.monoMedium, fontSize: 48, fontWeight: '500' },
  amountL: { fontFamily: fonts.monoMedium, fontSize: 24, fontWeight: '500' },
  amountM: { fontFamily: fonts.monoMedium, fontSize: 22, fontWeight: '500' },
  amountS: { fontFamily: fonts.monoMedium, fontSize: fontSize.bodyL, fontWeight: '500' },

  // Display — headings, group names, screen titles.
  displayL: { fontFamily: fonts.semiBold, fontSize: fontSize.displayL, fontWeight: '600' },
  displayM: { fontFamily: fonts.semiBold, fontSize: fontSize.displayM, fontWeight: '600' },
  displayS: { fontFamily: fonts.semiBold, fontSize: fontSize.displayS, fontWeight: '600' },
  title: { fontFamily: fonts.semiBold, fontSize: fontSize.bodyL, fontWeight: '600' },

  // Body — the workhorse paragraph/list-row styles.
  bodyL: { fontFamily: fonts.regular, fontSize: fontSize.bodyL, fontWeight: '400' },
  body: { fontFamily: fonts.regular, fontSize: fontSize.body, fontWeight: '400' },
  bodyEmphasis: { fontFamily: fonts.medium, fontSize: fontSize.body, fontWeight: '500' },
  bodyS: { fontFamily: fonts.regular, fontSize: fontSize.bodyS, fontWeight: '400' },

  // Mono — amounts, dates, identifiers, eyebrow labels.
  monoBody: { fontFamily: fonts.mono, fontSize: fontSize.body, fontWeight: '400' },
  monoBodyL: { fontFamily: fonts.mono, fontSize: fontSize.bodyL, fontWeight: '400' },
  monoBodyS: { fontFamily: fonts.mono, fontSize: fontSize.bodyS, fontWeight: '400' },
  monoCaption: { fontFamily: fonts.mono, fontSize: fontSize.caption, fontWeight: '400' },
  monoLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: fontSize.caption,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  monoStamp: {
    fontFamily: fonts.monoMedium,
    fontSize: fontSize.caption,
    fontWeight: '500',
    letterSpacing: 1,
  },
});

export type TypographyVariant = keyof typeof typography;

