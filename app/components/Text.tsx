import React from 'react';
import { Text as RNText, TextProps } from 'react-native';
import { colors, typography, TypographyVariant } from '@/lib/theme';

interface Props extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

// Single text surface for the app. Pulls its styling from the `typography`
// tokens in `lib/theme.ts`, and centralizes accessibility behaviour:
// OS-level font scaling is on, capped at 2x so layouts don't blow up at
// the largest Dynamic Type settings. Override `maxFontSizeMultiplier` via
// props if a specific call site needs a tighter cap.
const MAX_FONT_SCALE = 2;

export function Text({
  variant = 'body',
  color = colors.graphite,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...props
}: Props) {
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typography[variant], { color }, style]}
      {...props}
    />
  );
}
