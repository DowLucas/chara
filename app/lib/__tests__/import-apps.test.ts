import { IMPORT_APPS, importAppForSource } from '../import-apps';

describe('import-apps registry', () => {
  it('lists the six supported sources in display order, other last', () => {
    expect(IMPORT_APPS.map((a) => a.source)).toEqual([
      'splitwise',
      'tricount',
      'settleup',
      'splid',
      'steven',
      'other',
    ]);
  });

  it('derives i18n keys from the source', () => {
    const sw = IMPORT_APPS[0];
    expect(sw.labelKey).toBe('import.apps.splitwise.label');
    expect(sw.guidanceTitleKey).toBe('import.guidance.splitwise.title');
    expect(sw.guidanceBodyKey).toBe('import.guidance.splitwise.body');
  });

  it('resolves a known source param', () => {
    expect(importAppForSource('steven')?.source).toBe('steven');
  });

  it('returns null for unknown or missing source', () => {
    expect(importAppForSource('venmo')).toBeNull();
    expect(importAppForSource(undefined)).toBeNull();
    expect(importAppForSource('')).toBeNull();
  });
});
