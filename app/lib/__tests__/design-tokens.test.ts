/**
 * Generates `design-system/tokens.css` from `app/lib/theme.ts` and fails when
 * the committed file has drifted from the theme.
 *
 * `theme.ts` stays the single source of truth: the Claude Design bundle is a
 * projection of it, never a hand-maintained copy. Regenerate after changing a
 * token with:
 *
 *   UPDATE_DESIGN_TOKENS=1 pnpm test design-tokens
 *
 * Only the region above SENTINEL is machine-owned. Component classes and
 * @font-face rules are hand-authored below it and are left untouched.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  colors,
  fontSize,
  fonts,
  groupAccentSwatches,
  radii,
  spacing,
  typography,
} from '../theme';

const TOKENS_CSS = join(__dirname, '../../../design-system/tokens.css');

const SENTINEL =
  '/* ==== END GENERATED — hand-authored component classes below ==== */';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** Font tokens carry a web fallback stack; the mono faces get a mono stack. */
const stack = (key: string, family: string) =>
  /mono/i.test(key)
    ? `'${family}', ui-monospace, 'SFMono-Regular', monospace`
    : `'${family}', system-ui, -apple-system, 'Segoe UI', sans-serif`;

const block = (title: string, lines: string[]) =>
  [`  /* ---------- ${title} ---------- */`, ...lines, ''].join('\n');

function renderGenerated(): string {
  const root = [
    block(
      'Colors',
      Object.entries(colors).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
    ),
    block(
      'Group accents (index is significant — hash % 8 picks here)',
      groupAccentSwatches.map((v, i) => `  --accent-${i + 1}: ${v};`),
    ),
    block(
      'Font families',
      [
        ...Object.entries(fonts).map(
          ([k, v]) => `  --font-${kebab(k)}: ${stack(k, v)};`,
        ),
        `  --font-display: var(--font-semi-bold);`,
        `  --font-body: var(--font-regular);`,
        `  --font-body-medium: var(--font-medium);`,
      ],
    ),
    block(
      'Spacing',
      Object.entries(spacing).map(([k, v]) => `  --space-${k}: ${v}px;`),
    ),
    block(
      'Radii',
      Object.entries(radii).map(([k, v]) => `  --radius-${kebab(k)}: ${v}px;`),
    ),
    block(
      'Font sizes',
      Object.entries(fontSize).map(([k, v]) => `  --fs-${kebab(k)}: ${v}px;`),
    ),
  ].join('\n');

  const classes = Object.entries(typography)
    .map(([name, token]) => {
      const decls = [
        `font-family: var(--font-${kebab(
          Object.entries(fonts).find(([, v]) => v === token.fontFamily)![0],
        )})`,
        `font-size: ${token.fontSize}px`,
        `font-weight: ${token.fontWeight}`,
        ...(token.letterSpacing === undefined
          ? []
          : [`letter-spacing: ${token.letterSpacing}px`]),
      ];
      return `.ty-${kebab(name)} { ${decls.join('; ')}; }`;
    })
    .join('\n');

  return [
    '/* Chara design tokens.',
    ' *',
    ' * GENERATED from app/lib/theme.ts — do not edit this region by hand.',
    ' * Regenerate: UPDATE_DESIGN_TOKENS=1 pnpm test design-tokens',
    ' */',
    '',
    ':root {',
    root.replace(/\n$/, ''),
    '}',
    '',
    '/* Typography tokens, one class per `typography` entry. */',
    classes,
    '',
  ].join('\n');
}

describe('design-system/tokens.css', () => {
  it('matches the tokens in app/lib/theme.ts', () => {
    const generated = renderGenerated();

    if (process.env.UPDATE_DESIGN_TOKENS) {
      const tail = existsSync(TOKENS_CSS)
        ? readFileSync(TOKENS_CSS, 'utf8').split(SENTINEL)[1] ?? ''
        : '\n';
      writeFileSync(TOKENS_CSS, `${generated}\n${SENTINEL}${tail}`);
    }

    expect(existsSync(TOKENS_CSS)).toBe(true);
    const [actual] = readFileSync(TOKENS_CSS, 'utf8').split(SENTINEL);
    expect(actual.trimEnd()).toBe(generated.trimEnd());
  });
});
