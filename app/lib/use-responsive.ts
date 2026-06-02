import { useWindowDimensions } from 'react-native';
import { layoutForWidth, ResponsiveLayout } from '@/lib/responsive';

/**
 * Live responsive layout. Built on `useWindowDimensions` (not the static
 * `Dimensions.get`) so it re-renders on rotation and iPadOS window resizing.
 *
 * The pure resolver and tokens live in `responsive.ts`.
 */
export function useResponsive(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  return layoutForWidth(width);
}
