/**
 * Global popup tap-through guard.
 *
 * RN modals can leak the dismissal tap through to whatever sits underneath:
 * tapping a modal's backdrop near a tappable row in the parent screen can
 * dismiss the current sheet AND fire the next row's `onPress` in the same
 * gesture, instantly opening a new sheet. Native iOS Alerts/ActionSheets are
 * fine, but our JS-rendered Modals (ActionSheet, SettlementImpactSheet,
 * DeleteGroupModal) and the iOS cancel path of ActionSheetIOS are not.
 *
 * This module is the single source of truth for "a popup was just closed."
 * Popup surfaces call `markPopupClosed()` on their close/cancel/dismiss
 * paths. Row press handlers in screens call `isPopupJustClosed()` and bail
 * if the close happened within `GUARD_MS`.
 *
 * Intentionally framework-agnostic — just module-level state, no React.
 * Safe to call from anywhere (component event handlers, util helpers,
 * iOS native callbacks).
 */

const GUARD_MS = 250;

let lastClose = 0;

/** Mark "right now" as the moment a popup finished its dismissal. */
export function markPopupClosed(): void {
  lastClose = Date.now();
}

/** True if a popup was closed within the last `GUARD_MS`. */
export function isPopupJustClosed(): boolean {
  return Date.now() - lastClose < GUARD_MS;
}

/** Test-only: reset internal state. Not exported through any barrel. */
export function __resetPopupGuardForTests(): void {
  lastClose = 0;
}

/** Test-only: expose the constant so tests can advance fake timers
 *  past it without hardcoding the literal in two places. */
export const __GUARD_MS = GUARD_MS;
