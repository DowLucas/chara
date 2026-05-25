/**
 * Lazy wrapper around `@react-native-google-signin/google-signin`.
 *
 * Importing the SDK statically crashes in Expo Go because the native
 * `RNGoogleSignin` TurboModule isn't bundled (the SDK has native code that
 * only ships with EAS dev/preview/production builds). The crash cascades
 * up the module graph and bricks every screen that *transitively* imports
 * the SDK — including `_layout.tsx`, leaving the whole app blank.
 *
 * This module defers `require()` until first use and caches a single
 * configured instance. Returns `null` in environments where the native
 * module is missing (Expo Go on either platform) so callers can fall back
 * gracefully — usually by hiding the button.
 *
 * `GoogleSignin.configure()` is idempotent and pure (no network), so
 * calling it on first access is safe.
 */

let cached: any | null | undefined; // undefined = not tried; null = tried + missing

export function getGoogleSignin(): any | null {
  if (cached !== undefined) return cached;
  try {
    const mod = require('@react-native-google-signin/google-signin');
    const Signin = mod?.GoogleSignin;
    if (!Signin) {
      cached = null;
      return null;
    }
    Signin.configure({
      iosClientId:
        '53625108191-nkpr2abaukbq7s22ev6fp4vmu1djrsgf.apps.googleusercontent.com',
      webClientId:
        '53625108191-a5db4kv5jbbb7c7htatb4ig6q21e5jn4.apps.googleusercontent.com',
    });
    cached = Signin;
    return Signin;
  } catch {
    cached = null;
    return null;
  }
}
