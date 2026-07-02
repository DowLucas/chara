/**
 * Thin, named wrappers over expo-haptics. Centralized so call sites read as
 * intent ("this is a destructive confirmation") rather than raw enum values,
 * and so there's one place to adjust feedback styles later.
 *
 * All calls are fire-and-forget — haptics are a nice-to-have, never load-
 * bearing, and expo-haptics no-ops safely on web/unsupported hardware.
 */

import * as Haptics from 'expo-haptics';

/** Entering a mode via long-press (multi-select, action menu). */
export function hapticLongPress(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** A discrete selection changed (toggling a row, a switch, a segmented pick). */
export function hapticSelect(): void {
  void Haptics.selectionAsync();
}

/** A destructive action just executed (delete, remove, revert, sign out). */
export function hapticWarning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}

/** An action completed successfully (settled up, created, saved). */
export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** An action failed and an error is being surfaced to the user. */
export function hapticError(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
