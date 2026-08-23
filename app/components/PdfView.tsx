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
}> | null = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Pdf = require('react-native-pdf').default;
}

/** True when this platform can render PDFs inline. */
export const canRenderPdfInline = Pdf !== null;

export function PdfView(props: {
  source: { uri: string; headers?: Record<string, string>; cache?: boolean };
  style?: StyleProp<ViewStyle>;
}) {
  if (!Pdf) return null;
  return <Pdf source={props.source} style={props.style} trustAllCerts={false} />;
}
