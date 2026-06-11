/**
 * The URL the legacy single-account app talked to. Used by:
 *   - migrateLegacyAuth() to write the migrated account's serverUrl
 *   - the first-launch sign-in screen as the default value
 *   - useAuth().signIn() backward-compat shim
 *
 * Mirrors the original `resolveBaseUrl()` in app/lib/api.ts so that
 * existing dev/Expo flows keep resolving to the same backend they did
 * before the multi-account refactor.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PROD_URL = 'https://api.chara.app';

export function legacyHostedUrl(): string {
  if (!__DEV__) return PROD_URL;

  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8080';
  }

  const hostUri =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants.expoConfig as any)?.hostUri ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants as any)?.expoGoConfig?.hostUri ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants.manifest as any)?.hostUri;
  if (typeof hostUri === 'string') {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost') return `http://${host}:8080`;
  }
  return 'http://localhost:8080';
}
