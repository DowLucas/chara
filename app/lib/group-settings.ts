/**
 * Pure helpers for the group-settings hub.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md §"Pure helpers".
 *
 * No I/O, no React, no i18n imports (jest's node env can't transform
 * expo-localization). The component layer formats amounts with
 * `formatMinorUnits` after consuming these helper outputs.
 */

export type LeaveReason =
  | {
      code: 'member_has_open_balance';
      rows: { currency: string; minor_units: number }[];
    }
  | { code: 'owner_cannot_leave' };

export interface LifecycleActions {
  /** Owner only. */
  showLockToggle: boolean;
  /** Which i18n key the toggle should render — `lock` when unlocked, `unlock` when locked. */
  lockLabelKey: 'lock' | 'unlock';
  /** Owner only. */
  showArchiveToggle: boolean;
  archiveLabelKey: 'archive' | 'unarchive';
  /** Owner only. */
  showDelete: boolean;
  /** Non-owner only. Owners can't leave (P0). */
  showLeave: boolean;
}

/**
 * Decide which lifecycle buttons to show for the current viewer.
 *
 * Owner: lock/unlock toggle, archive/unarchive toggle, delete. No leave.
 * Non-owner: leave only. No danger-zone buttons at all.
 */
export function lifecycleActionsForViewer(opts: {
  isOwner: boolean;
  isLocked: boolean;
  isArchived: boolean;
}): LifecycleActions {
  const { isOwner, isLocked, isArchived } = opts;
  return {
    showLockToggle: isOwner,
    lockLabelKey: isLocked ? 'unlock' : 'lock',
    showArchiveToggle: isOwner,
    archiveLabelKey: isArchived ? 'unarchive' : 'archive',
    showDelete: isOwner,
    showLeave: !isOwner,
  };
}

/**
 * Type-to-confirm: case-sensitive exact match between `typed` and the
 * current group name. Both sides are whitespace-trimmed first. An empty
 * typed value is always rejected (so blanking the input doesn't enable
 * the destructive primary button).
 */
export function deleteConfirmationMatches(typed: string, groupName: string): boolean {
  const t = typed.trim();
  if (t.length === 0) return false;
  return t === groupName.trim();
}

/**
 * Map a backend leave/kick refusal into an i18n key + structured rows
 * the host UI can render. `owner_cannot_leave` is the dominant reason —
 * if both codes are present, the owner case wins and balance rows are
 * suppressed (the owner gate is the actionable fix, not "settle up").
 *
 * Rows are passed through as `{currency, minor_units}` — the caller
 * formats them via `formatMinorUnits` at render time. The
 * `minor_units` are emitted as absolute values so the UI never has to
 * worry about the sign.
 */
export function formatLeaveReasons(reasons: LeaveReason[]): {
  i18nKey: string;
  rows: { currency: string; minor_units: number }[];
} {
  const ownerCannotLeave = reasons.some((r) => r.code === 'owner_cannot_leave');
  if (ownerCannotLeave) {
    return {
      i18nKey: 'groupSettings.members.leaveBlocked.ownerCannotLeave',
      rows: [],
    };
  }
  const balance = reasons.find(
    (r): r is Extract<LeaveReason, { code: 'member_has_open_balance' }> =>
      r.code === 'member_has_open_balance',
  );
  if (!balance) {
    return { i18nKey: 'groupSettings.members.leaveBlocked.body', rows: [] };
  }
  return {
    i18nKey: 'groupSettings.members.leaveBlocked.body',
    rows: balance.rows.map((r) => ({
      currency: r.currency,
      minor_units: Math.abs(r.minor_units),
    })),
  };
}
