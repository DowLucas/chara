import type { TextStyle } from 'react-native';

/**
 * Two palettes with identical keys. Never import a palette into a module-level
 * StyleSheet — read the active one with `useColors()` or build styles with
 * `makeStyles()` (lib/theme-context.tsx), so the screen follows the user's
 * Appearance setting (System / Light / Dark). Guarded by
 * lib/__tests__/theme-palette.test.ts.
 */
export const lightColors = {
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
  // moss reads "you're owed / settled"; brick reads "you owe / destructive".
  // The pair is tuned for red-green color blindness, not just hue: moss is a
  // deep pine green and brick a rust red, so they separate on the blue-yellow
  // axis deuteranopes and protanopes keep (the old olive/maroon pair collapsed
  // into one brown). Both pass WCAG AA as text on paper *and* bone. Guarded
  // by lib/__tests__/theme-palette.test.ts. The brand anchor `palmLeaf` keeps
  // the pale olive for surfaces that aren't text.
  moss: '#1F6458',
  brick: '#8E3B1A',
  citrine: '#E0A040',

  ruleSoft: 'rgba(45, 31, 26, 0.07)',
  fgOnAccent: '#F4F1E6',
  // Brand red as *text* (links, selection checks, badges). Vermillion itself
  // is 4.45:1 on paper, just under AA, so text gets a slightly deeper shade
  // here and a lighter one in dark.
  vermillionInk: '#A33430',
  // Scrim behind sheets and modals.
  scrim: 'rgba(45, 31, 26, 0.45)',
  // Faint brand-red wash (destructive keypad keys).
  vermillionTint: 'rgba(184, 61, 61, 0.10)',

  // Camera, photo and receipt-viewer chrome. These surfaces are dark in both
  // themes, so the values are the same in both palettes; draw text and icons
  // on them with `fgOnAccent` (light in both), never `paper`.
  mediaBlack: '#000000',
  mediaScrim: 'rgba(0, 0, 0, 0.6)',
  mediaChip: 'rgba(255, 255, 255, 0.15)',
  mediaRing: 'rgba(255, 255, 255, 0.4)',
  // The night sky of the settled print, behind the full-bleed illustration.
  printNight: '#0E1A2E',
  // Wash behind the name seal on the You tab's night scene (same in both).
  printSealWash: 'rgba(14, 26, 46, 0.25)',
  // Dims the print in dark mode so it doesn't glare against Sumi paper.
  printDim: 'rgba(10, 8, 6, 0)',
};

export type ColorPalette = { readonly [K in keyof typeof lightColors]: string };

/** Sumi — warm ink. The light theme turned around: brown-black ground,
 *  cream text, same materials. Proposal + checks:
 *  https://claude.ai/artifact/U3cAxroipa1c1wzJaCdGZc */
export const darkColors: ColorPalette = {
  // Brand anchors stay fixed; they're identity, not roles.
  sandDune: '#F0E5CC',
  darkCoffee: '#2D1F1A',
  tomatoJam: '#B83D3D',
  palmLeaf: '#8FA055',
  honeyBronze: '#E0A040',

  paper: '#1A1512',
  bone: '#251E1A',
  graphite: '#EFE5CF',
  lead: '#B4A592',
  vermillion: '#B8423A',
  moss: '#5DB39C',
  brick: '#E58B5F',
  citrine: '#E6AE52',

  ruleSoft: 'rgba(239, 229, 207, 0.08)',
  fgOnAccent: '#FBF6EC',
  vermillionInk: '#EC7B6C',
  scrim: 'rgba(0, 0, 0, 0.55)',
  vermillionTint: 'rgba(236, 123, 108, 0.14)',

  mediaBlack: '#000000',
  mediaScrim: 'rgba(0, 0, 0, 0.6)',
  mediaChip: 'rgba(255, 255, 255, 0.15)',
  mediaRing: 'rgba(255, 255, 255, 0.4)',
  printNight: '#0E1A2E',
  printSealWash: 'rgba(14, 26, 46, 0.25)',
  printDim: 'rgba(10, 8, 6, 0.18)',
};

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

// Dark-mode lifts for the swatches that vanish on the Sumi ground (< 3:1).
// Same hue, more light; Sumi ink becomes gofun cream.
const DARK_SWATCH_LIFTS: Record<string, string> = {
  '#1F3A6E': '#5679C0',
  '#6B4B7E': '#9A78AE',
  '#7A4F2E': '#AC7A52',
  '#1F1A18': '#D8CDB8',
};

function relLuminance(hex: string): number {
  const s = hex.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark ink or light ink, whichever reads better on `fill` — for marks drawn
 *  on an arbitrary color (a check on a group swatch, an icon on an accent
 *  tile). Independent of the theme: the fill decides. */
export function contrastInkFor(fill: string): string {
  const dark = lightColors.graphite;
  const light = darkColors.fgOnAccent;
  return contrastRatio(dark, fill) >= contrastRatio(light, fill) ? dark : light;
}

/** A group color as it should be drawn in the given scheme. The stored value
 *  is always the light hex; dark mode lifts it at render time. */
export function displaySwatch(hex: string, scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? liftSwatchForDark(hex) : hex;
}

/** A group's avatar color as shown in dark mode. Known swatches use their
 *  designed lift; any other (custom) color too dark to see against the dark
 *  paper is mixed toward cream until it reaches 3:1. */
export function liftSwatchForDark(hex: string): string {
  const known = DARK_SWATCH_LIFTS[hex.toUpperCase()];
  if (known) return known;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return hex;
  if (contrastRatio(hex, darkColors.paper) >= 3) return hex;
  const s = hex.replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const src = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const cream = [0xd8, 0xcd, 0xb8];
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const mixed =
      '#' +
      src
        .map((c, i) => Math.round(c + (cream[i] - c) * t).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    if (contrastRatio(mixed, darkColors.paper) >= 3) return mixed;
  }
  return '#D8CDB8';
}

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

