/**
 * Pure helpers for SettlementImpactSheet — separated from the component file
 * so they can be exercised in jest's node environment without rendering.
 */

export type SheetMode = 'edit' | 'delete';

export interface SheetCopyInput {
  mode: SheetMode;
  affectedSettlementsCount: number;
  memberCount: number;
  submitting?: boolean;
  error?: string | null;
}

export interface SheetCopy {
  titleKey: 'impactSheet.title.edit' | 'impactSheet.title.delete';
  leadKey:
    | 'impactSheet.lead.withSettlements'
    | 'impactSheet.lead.plain'
    | 'impactSheet.lead.deletePlain';
  leadParams: Record<string, number>;
  primaryKey: 'impactSheet.save' | 'impactSheet.delete';
  primaryDestructive: boolean;
  primaryDisabled: boolean;
  errorVisible: boolean;
}

/**
 * Pick i18n keys + flags for the sheet based on mode, settlement count, and
 * submitting/error state. Pure — never reads from i18next directly.
 */
export function settlementImpactSheetCopy(input: SheetCopyInput): SheetCopy {
  const settlementsAffect = input.affectedSettlementsCount > 0;

  const titleKey =
    input.mode === 'delete' ? 'impactSheet.title.delete' : 'impactSheet.title.edit';

  let leadKey: SheetCopy['leadKey'];
  let leadParams: Record<string, number> = {};
  if (settlementsAffect) {
    leadKey = 'impactSheet.lead.withSettlements';
  } else if (input.mode === 'delete') {
    leadKey = 'impactSheet.lead.deletePlain';
    leadParams = { count: input.memberCount };
  } else {
    leadKey = 'impactSheet.lead.plain';
    leadParams = { count: input.memberCount };
  }

  const primaryKey = input.mode === 'delete' ? 'impactSheet.delete' : 'impactSheet.save';

  return {
    titleKey,
    leadKey,
    leadParams,
    primaryKey,
    primaryDestructive: input.mode === 'delete',
    primaryDisabled: !!input.submitting,
    errorVisible: !!input.error,
  };
}
