/**
 * Tests for DeleteGroupModal — focused on the pure helper logic that
 * shapes the sheet's content (enablement, error visibility, error-row
 * forwarding). Mirrors the pattern used by SettlementImpactSheet's tests:
 * the repo intentionally omits @testing-library/react-native, so render-time
 * JSX is exercised only at runtime.
 *
 * Spec §"Frontend component/integration tests" first bullet.
 */

import { deleteGroupModalState } from '../DeleteGroupModal.helpers';

describe('DeleteGroupModal — primary button enablement', () => {
  it('is disabled when typed name does not match group name', () => {
    const s = deleteGroupModalState({
      typedName: 'Lisbn trip',
      groupName: 'Lisbon trip',
      submitting: false,
      error: null,
    });
    expect(s.canConfirm).toBe(false);
  });

  it('is disabled when typed name is empty', () => {
    const s = deleteGroupModalState({
      typedName: '',
      groupName: 'Lisbon trip',
      submitting: false,
      error: null,
    });
    expect(s.canConfirm).toBe(false);
  });

  it('is enabled when typed name matches exactly', () => {
    const s = deleteGroupModalState({
      typedName: 'Lisbon trip',
      groupName: 'Lisbon trip',
      submitting: false,
      error: null,
    });
    expect(s.canConfirm).toBe(true);
  });

  it('is enabled after trimming whitespace', () => {
    const s = deleteGroupModalState({
      typedName: '  Lisbon trip ',
      groupName: 'Lisbon trip',
      submitting: false,
      error: null,
    });
    expect(s.canConfirm).toBe(true);
  });

  it('is disabled while submitting, even when name matches', () => {
    const s = deleteGroupModalState({
      typedName: 'Lisbon trip',
      groupName: 'Lisbon trip',
      submitting: true,
      error: null,
    });
    expect(s.canConfirm).toBe(false);
  });
});

describe('DeleteGroupModal — error rendering', () => {
  it('hides the error banner when error is null', () => {
    const s = deleteGroupModalState({
      typedName: '',
      groupName: 'g',
      submitting: false,
      error: null,
    });
    expect(s.errorVisible).toBe(false);
    expect(s.errorRows).toEqual([]);
    expect(s.hasErrorRows).toBe(false);
  });

  it('surfaces the error rows from a group_has_unsettled_balances refusal', () => {
    const s = deleteGroupModalState({
      typedName: 'g',
      groupName: 'g',
      submitting: false,
      error: {
        rows: [
          { currency: 'SEK', minor_units: 12345 },
          { currency: 'EUR', minor_units: -100 },
        ],
      },
    });
    expect(s.errorVisible).toBe(true);
    expect(s.hasErrorRows).toBe(true);
    expect(s.errorRows).toEqual([
      { currency: 'SEK', minor_units: 12345 },
      { currency: 'EUR', minor_units: 100 },
    ]);
  });

  it('shows the error banner with no rows when the failure is generic', () => {
    const s = deleteGroupModalState({
      typedName: 'g',
      groupName: 'g',
      submitting: false,
      error: { rows: [] },
    });
    expect(s.errorVisible).toBe(true);
    expect(s.hasErrorRows).toBe(false);
    expect(s.errorRows).toEqual([]);
  });
});
