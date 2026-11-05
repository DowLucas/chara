/**
 * Guards the balance signal colors against regressions in the two
 * properties users complained about: legibility, and telling "you owe"
 * from "you're owed" with red-green color blindness.
 *
 * Contrast is WCAG 2.x relative-luminance contrast. Color-blind separation
 * simulates deuteranopia and protanopia at full severity (Machado, Oliveira
 * & Fernandes 2009) and measures CIE76 ΔE between the simulated colors.
 * ΔE ≈ 2 is a just-noticeable difference; the old olive/maroon pair scored
 * ~9 under deuteranopia and read as the same brown. Words still carry
 * direction everywhere — this keeps color a genuine second cue.
 */

import { colors } from '../theme';

type RGB = [number, number, number];

function hex(h: string): RGB {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as RGB;
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c: number) => {
  const x = Math.min(1, Math.max(0, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
function luminance([r, g, b]: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const MACHADO = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const;

function simulate(rgb: RGB, m: readonly (readonly number[])[]): RGB {
  const l = rgb.map(lin);
  return m.map((row) => unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])) as RGB;
}
function lab([r, g, b]: RGB): RGB {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function deltaE(a: RGB, b: RGB): number {
  const [x, y] = [lab(a), lab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

describe('balance signal colors', () => {
  it.each([
    ['moss', colors.moss],
    ['brick', colors.brick],
  ])('%s passes WCAG AA (4.5:1) as text on paper and bone', (_name, c) => {
    expect(contrast(c, colors.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c, colors.bone)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(MACHADO))(
    'moss and brick stay clearly apart under %s',
    (_name, m) => {
      const d = deltaE(simulate(hex(colors.moss), m), simulate(hex(colors.brick), m));
      expect(d).toBeGreaterThanOrEqual(20);
    },
  );

  it('brick is distinguishable from the brand vermillion', () => {
    expect(deltaE(hex(colors.brick), hex(colors.vermillion))).toBeGreaterThanOrEqual(18);
  });
});
