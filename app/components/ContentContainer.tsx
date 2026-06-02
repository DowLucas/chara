import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useResponsive } from '@/lib/use-responsive';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Centers and caps its children at the responsive content-column width.
 *
 * On phones this is a no-op: `width: '100%'` with no `maxWidth` renders
 * identically to an unwrapped child, so the shipped iPhone layout is
 * unchanged. At tablet widths the column caps at `CONTENT_MAX_WIDTH` and
 * centers, which is what stops the UI from stretching edge-to-edge on iPad.
 *
 * Wrap the *content* of a screen's `ScrollView` (or the root scroll body) in
 * this. Keep full-bleed surfaces — page background, the `TopBar`/`TabBar`
 * hairline rules — outside it so they still span the whole screen; only the
 * content inside the column is constrained.
 */
export function ContentContainer({ children, style }: Props) {
  const { contentMaxWidth } = useResponsive();
  return (
    <View
      style={[
        { width: '100%', alignSelf: 'center' },
        contentMaxWidth != null && { maxWidth: contentMaxWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}
