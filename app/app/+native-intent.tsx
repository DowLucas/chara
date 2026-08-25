/**
 * Expo Router's hook for URLs the OS hands the app before routing happens.
 *
 * The iOS share extension delivers a shared file by opening the host app at
 * `chara://dataUrl=charaShareKey#file`. That is a handoff signal for
 * expo-share-intent's native module, not a route — without this hook Expo
 * Router tries to match `dataUrl=…`, finds nothing, and renders its built-in
 * "Unmatched Route" screen (bug: sharing a PDF to Chara on iOS).
 *
 * Returning a falsy path cancels the navigation on both entry points
 * (`getInitialURL` on cold launch, the `url` subscription while running), so
 * the app opens where it normally would. Navigation is then left entirely to
 * ShareIntentListener in _layout.tsx, which is the only place that knows
 * whether the file is supported — routing here as well would stack a second
 * receipt-inbox, or show it for a file we are about to reject.
 */

import { isShareIntentUrl } from '@/lib/share-inbox';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return isShareIntentUrl(path) ? null : path;
}
