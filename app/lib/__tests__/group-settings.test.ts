/**
 * Pure-helper tests for the group-settings hub.
 *
 * Spec §"Testing strategy" — these helpers are 100% branch-covered here
 * because the live settings screen is a thin renderer over their output.
 */

import {
  lifecycleActionsForViewer,
  deleteConfirmationMatches,
  formatLeaveReasons,
} from '../group-settings';

describe('lifecycleActionsForViewer', () => {
  it('non-owner sees no danger-zone toggles and shows leave', () => {
    const a = lifecycleActionsForViewer({ isOwner: false, isLocked: false, isArchived: false });
    expect(a.showLockToggle).toBe(false);
    expect(a.showArchiveToggle).toBe(false);
    expect(a.showDelete).toBe(false);
    expect(a.showLeave).toBe(true);
  });

  it('non-owner on a locked group still sees leave, no other actions', () => {
    const a = lifecycleActionsForViewer({ isOwner: false, isLocked: true, isArchived: false });
    expect(a).toEqual({
      showLockToggle: false,
      lockLabelKey: 'unlock',
      showArchiveToggle: false,
      archiveLabelKey: 'archive',
      showDelete: false,
      showLeave: true,
    });
  });

  it('non-owner on an archived group still sees leave, no other actions', () => {
    const a = lifecycleActionsForViewer({ isOwner: false, isLocked: false, isArchived: true });
    expect(a.showLeave).toBe(true);
    expect(a.showLockToggle).toBe(false);
    expect(a.showArchiveToggle).toBe(false);
    expect(a.showDelete).toBe(false);
  });

  it('owner of an unlocked, unarchived group sees lock + archive + delete', () => {
    const a = lifecycleActionsForViewer({ isOwner: true, isLocked: false, isArchived: false });
    expect(a).toEqual({
      showLockToggle: true,
      lockLabelKey: 'lock',
      showArchiveToggle: true,
      archiveLabelKey: 'archive',
      showDelete: true,
      showLeave: false,
    });
  });

  it('owner of a locked group sees Unlock label', () => {
    const a = lifecycleActionsForViewer({ isOwner: true, isLocked: true, isArchived: false });
    expect(a.showLockToggle).toBe(true);
    expect(a.lockLabelKey).toBe('unlock');
    expect(a.showArchiveToggle).toBe(true);
    expect(a.archiveLabelKey).toBe('archive');
    expect(a.showDelete).toBe(true);
    expect(a.showLeave).toBe(false);
  });

  it('owner of an archived group sees Unarchive label', () => {
    const a = lifecycleActionsForViewer({ isOwner: true, isLocked: false, isArchived: true });
    expect(a.showArchiveToggle).toBe(true);
    expect(a.archiveLabelKey).toBe('unarchive');
    expect(a.lockLabelKey).toBe('lock');
    expect(a.showDelete).toBe(true);
  });

  it('owner of a locked AND archived group flips both labels', () => {
    const a = lifecycleActionsForViewer({ isOwner: true, isLocked: true, isArchived: true });
    expect(a.lockLabelKey).toBe('unlock');
    expect(a.archiveLabelKey).toBe('unarchive');
  });
});

describe('deleteConfirmationMatches', () => {
  it('matches when typed equals group name exactly', () => {
    expect(deleteConfirmationMatches('Lisbon trip', 'Lisbon trip')).toBe(true);
  });

  it('trims whitespace on both sides before comparing', () => {
    expect(deleteConfirmationMatches('  Lisbon trip  ', 'Lisbon trip')).toBe(true);
    expect(deleteConfirmationMatches('Lisbon trip', '  Lisbon trip  ')).toBe(true);
  });

  it('is case-sensitive', () => {
    expect(deleteConfirmationMatches('lisbon trip', 'Lisbon trip')).toBe(false);
    expect(deleteConfirmationMatches('LISBON TRIP', 'Lisbon trip')).toBe(false);
  });

  it('rejects empty typed input even when group name is empty', () => {
    expect(deleteConfirmationMatches('', '')).toBe(false);
    expect(deleteConfirmationMatches('   ', '')).toBe(false);
  });

  it('rejects mismatched names', () => {
    expect(deleteConfirmationMatches('Lisbon', 'Lisbon trip')).toBe(false);
    expect(deleteConfirmationMatches('Lisbon trip!', 'Lisbon trip')).toBe(false);
  });
});

describe('formatLeaveReasons', () => {
  it('maps owner_cannot_leave to its i18n key with no rows', () => {
    const got = formatLeaveReasons([{ code: 'owner_cannot_leave' }]);
    expect(got.i18nKey).toBe('groupSettings.members.leaveBlocked.ownerCannotLeave');
    expect(got.rows).toEqual([]);
  });

  it('maps member_has_open_balance into structured balance rows (absolute values)', () => {
    const got = formatLeaveReasons([
      { code: 'member_has_open_balance', rows: [
        { currency: 'SEK', minor_units: 12345 },
        { currency: 'EUR', minor_units: -5000 },
      ] },
    ]);
    expect(got.i18nKey).toBe('groupSettings.members.leaveBlocked.body');
    expect(got.rows).toEqual([
      { currency: 'SEK', minor_units: 12345 },
      { currency: 'EUR', minor_units: 5000 },
    ]);
  });

  it('returns empty rows when reasons is empty', () => {
    const got = formatLeaveReasons([]);
    expect(got.rows).toEqual([]);
  });

  it('prefers owner_cannot_leave over balance rows if both reported', () => {
    const got = formatLeaveReasons([
      { code: 'member_has_open_balance', rows: [{ currency: 'SEK', minor_units: 100 }] },
      { code: 'owner_cannot_leave' },
    ]);
    expect(got.i18nKey).toBe('groupSettings.members.leaveBlocked.ownerCannotLeave');
    expect(got.rows).toEqual([]);
  });
});
