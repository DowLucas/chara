/**
 * Pure-helper surface for DeleteGroupModal. Mirrors the
 * SettlementImpactSheet.helpers.ts pattern so the component layer stays a
 * thin renderer over decisions made here. 100% branch-covered by
 * components/__tests__/DeleteGroupModal.test.tsx.
 *
 * No i18n import — jest's node env can't transform expo-localization. The
 * component layer formats `minor_units` with `formatMinorUnits` at render time.
 *
 * Spec: docs/superpowers/specs/2026-05-23-group-settings-design.md
 *       §"Frontend component/integration tests".
 */

import { deleteConfirmationMatches } from '../lib/group-settings';

export interface DeleteGroupModalError {
  /** Server returned `group_has_unsettled_balances` — rows is the
   *  refusal payload. Empty when the failure is generic (e.g. a 5xx). */
  rows: { currency: string; minor_units: number }[];
}

export interface DeleteGroupModalState {
  canConfirm: boolean;
  errorVisible: boolean;
  hasErrorRows: boolean;
  errorRows: { currency: string; minor_units: number }[];
}

export function deleteGroupModalState(opts: {
  typedName: string;
  groupName: string;
  submitting: boolean;
  error: DeleteGroupModalError | null | undefined;
}): DeleteGroupModalState {
  const { typedName, groupName, submitting, error } = opts;
  const matches = deleteConfirmationMatches(typedName, groupName);
  const canConfirm = matches && !submitting;
  const rows = (error?.rows ?? []).map((r) => ({
    currency: r.currency,
    minor_units: Math.abs(r.minor_units),
  }));
  return {
    canConfirm,
    errorVisible: !!error,
    hasErrorRows: rows.length > 0,
    errorRows: rows,
  };
}
