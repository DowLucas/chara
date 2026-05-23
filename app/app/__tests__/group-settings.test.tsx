/**
 * Group-settings host screen — flow tests.
 *
 * Mirrors the pattern in edit-expense.test.tsx: the rendering layer is a
 * thin dispatcher over pure helpers in app/lib/group-settings.ts. We test
 * the orchestration's pure decision layer in isolation.
 *
 * Spec §"Frontend component/integration tests" — second bullet.
 */

import {
  lifecycleActionsForViewer,
  deleteConfirmationMatches,
  formatLeaveReasons,
} from '../../lib/group-settings';

describe('group-settings — owner gate', () => {
  // The screen renders DangerZoneSection iff
  // `members.find(m => m.user_id === me.id)?.role === 'owner'`.
  // The check itself is a property equality — we assert the predicate
  // collapses correctly when fed through lifecycleActionsForViewer.

  it('non-owner predicate hides every danger-zone action', () => {
    const a = lifecycleActionsForViewer({ isOwner: false, isLocked: false, isArchived: false });
    expect(a.showLockToggle || a.showArchiveToggle || a.showDelete).toBe(false);
  });

  it('owner predicate shows every danger-zone action', () => {
    const a = lifecycleActionsForViewer({ isOwner: true, isLocked: false, isArchived: false });
    expect(a.showLockToggle && a.showArchiveToggle && a.showDelete).toBe(true);
  });

  it('treats a missing per-server account as non-owner (no danger zone)', () => {
    const me: { id: string } | null = null;
    const myRole = me ? 'owner' : undefined;
    const a = lifecycleActionsForViewer({
      isOwner: myRole === 'owner',
      isLocked: false,
      isArchived: false,
    });
    expect(a.showLockToggle).toBe(false);
    expect(a.showLeave).toBe(true);
  });
});

describe('group-settings — leave flow predicate', () => {
  it('non-owner with zero open balance can leave (no reasons)', () => {
    const reasons = formatLeaveReasons([]);
    expect(reasons.rows).toEqual([]);
  });

  it('non-owner with open balance is told to settle first', () => {
    const reasons = formatLeaveReasons([
      { code: 'member_has_open_balance', rows: [{ currency: 'SEK', minor_units: 500 }] },
    ]);
    expect(reasons.i18nKey).toBe('groupSettings.members.leaveBlocked.body');
    expect(reasons.rows).toHaveLength(1);
  });

  it('owner attempting to leave gets the owner-cannot-leave message', () => {
    const reasons = formatLeaveReasons([{ code: 'owner_cannot_leave' }]);
    expect(reasons.i18nKey).toBe('groupSettings.members.leaveBlocked.ownerCannotLeave');
  });
});

describe('group-settings — delete flow', () => {
  it('rejects the delete attempt when name confirmation does not match', () => {
    expect(deleteConfirmationMatches('Wrong name', 'Lisbon trip')).toBe(false);
  });

  it('accepts the delete attempt when the typed name exactly matches', () => {
    expect(deleteConfirmationMatches('Lisbon trip', 'Lisbon trip')).toBe(true);
  });
});

// ─── API surface contract ────────────────────────────────────────────────
//
// Compile-time check that the apiFor(serverUrl) extension exposes the new
// endpoints in the shape the screen expects. We can't import api.ts in jest
// node-mode (it pulls in expo-secure-store), so this is purely a type-level
// fixture — TS-compilation failure is the signal.

describe('group-settings — api surface contract', () => {
  it('GroupStats type carries the fields the StatsCard renders', () => {
    type Stats = import('../../lib/api').GroupStats;
    const sample: Stats = {
      member_count: 4,
      expense_count: 17,
      totals_by_currency: [{ currency: 'SEK', minor_units: 99999 }],
      top_spender: {
        member_id: 'm1',
        user_id: 'u1',
        display_name: 'Alice',
        minor_units_paid: 50000,
        currency: 'SEK',
      },
      created_at: '2026-05-01T00:00:00Z',
      first_expense_at: '2026-05-02T00:00:00Z',
      last_expense_at: '2026-05-22T00:00:00Z',
    };
    expect(sample.member_count).toBe(4);
    expect(sample.top_spender?.display_name).toBe('Alice');
  });

  it('GroupStats top_spender accepts null', () => {
    type Stats = import('../../lib/api').GroupStats;
    const empty: Stats = {
      member_count: 1,
      expense_count: 0,
      totals_by_currency: [],
      top_spender: null,
      created_at: '2026-05-01T00:00:00Z',
      first_expense_at: null,
      last_expense_at: null,
    };
    expect(empty.top_spender).toBeNull();
  });

  it('Group gains is_locked boolean', () => {
    type Grp = import('../../lib/api').Group;
    const g: Grp = {
      id: 'g1',
      name: 'g',
      currency: 'SEK',
      language: 'en',
      invite_token: 'tok',
      created_at: '2026-05-01T00:00:00Z',
      is_locked: false,
      is_archived: false,
    };
    expect(g.is_locked).toBe(false);
  });
});
