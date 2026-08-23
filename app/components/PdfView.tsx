/**
 * In-app PDF renderer. Wraps react-native-pdf behind a lazy require so the
 * web bundle (where the native module doesn't exist) never loads it — web
 * callers keep their browser-tab fallback.
 */

import React from 'react';
import { Platform, StyleProp, ViewStyle } from 'react-native';

let Pdf: React.ComponentType<{
  source: { uri: string; headers?: Record<string, string>; cache?: boolean };
  style?: StyleProp<ViewStyle>;
  trustAllCerts?: boolean;
  onError?: (error: unknown) => void;
  onLoadComplete?: (pages: number) => void;
}> | null = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Pdf = require('react-native-pdf').default;
  } catch {
    // Native module not in this binary (e.g. JS updated over Metro against
    // an app built before react-native-pdf was added). Callers check
    // canRenderPdfInline and fall back to the share-sheet path.
    Pdf = null;
  }
}

/** True when this platform can render PDFs inline. */
export const canRenderPdfInline = Pdf !== null;

export function PdfView(props: {
  source: { uri: string; headers?: Record<string, string>; cache?: boolean };
  style?: StyleProp<ViewStyle>;
}) {
  if (!Pdf) return null;
  return (
    <Pdf
      source={props.source}
      style={props.style}
      trustAllCerts={false}
      onError={(e) => {
        if (__DEV__) console.log('[PdfView] error', e);
      }}
    />
  );
}
