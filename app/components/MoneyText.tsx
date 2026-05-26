import { Fragment } from 'react';
import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { fontBody } from '@/lib/theme';

type Props = TextProps & {
  /** Pre-formatted money string from `formatMinorUnits` /
   *  `formatMinorUnitsCompact`. Already includes the currency symbol /
   *  code and the locale's separators. */
  value: string;
  /** Thousands separator size as a fraction of the parent fontSize.
   *  0.9 reads as a "normal" gap that's just narrower than mono;
   *  drop to ~0.6 for a tighter visual. */
  separatorScale?: number;
};

/** Renders a money string with a tighter thousands separator.
 *
 *  JetBrainsMono (our `fontMono`) renders every glyph — including the
 *  Swedish locale's non-breaking-space thousands separator — at a full
 *  em, so "5 307,83" reads as "5    307,83". This component splits on
 *  the common space chars used by `Intl.NumberFormat` and renders the
 *  separator in a proportional font at a reduced size, preserving
 *  tabular alignment of the digits while collapsing the gap.
 *
 *  Pass the already-formatted string as `value`; styling goes on the
 *  outer Text via `style` exactly like a regular `<Text>`. */
export function MoneyText({ value, separatorScale = 0.9, style, ...rest }: Props) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const baseSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
  // Locale separators we care about: U+00A0 NBSP (sv-SE default),
  // U+202F narrow NBSP (newer ICU), U+2009 thin space, regular ASCII
  // space (the gap between number and currency symbol). We only want
  // to compress the *thousands* separator, not the number/symbol gap,
  // but in practice shrinking both reads better in tight layouts.
  const parts = value.split(/[    ]/);
  if (parts.length === 1) {
    return (
      <Text style={style} {...rest}>
        {value}
      </Text>
    );
  }
  return (
    <Text style={style} {...rest}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 ? (
            <Text style={{ fontFamily: fontBody, fontSize: baseSize * separatorScale }}> </Text>
          ) : null}
        </Fragment>
      ))}
    </Text>
  );
}
