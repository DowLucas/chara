import { nextAppearance, sealLines, tileLayoutFor } from '../profile-scene';

describe('nextAppearance', () => {
  it('cycles System → Light → Dark → System', () => {
    expect(nextAppearance('system')).toBe('light');
    expect(nextAppearance('light')).toBe('dark');
    expect(nextAppearance('dark')).toBe('system');
  });
});

describe('sealLines', () => {
  it('splits the first name into two short lines, like a carved seal', () => {
    expect(sealLines('Maja Ek')).toEqual(['MA', 'JA']);
    expect(sealLines('Lucas Dow')).toEqual(['LUC', 'AS']);
    expect(sealLines('Anna')).toEqual(['AN', 'NA']);
  });

  it('keeps a short name on one line', () => {
    expect(sealLines('Bo')).toEqual(['BO']);
    expect(sealLines('Al Smith')).toEqual(['AL']);
  });

  it('caps a long name at three characters per line', () => {
    expect(sealLines('Alexandra')).toEqual(['ALE', 'XAN']);
  });

  it('handles non-Latin names and falls back when the name is empty', () => {
    expect(sealLines('さくら')).toEqual(['さく', 'ら']);
    expect(sealLines('   ')).toEqual(['?']);
    expect(sealLines(null)).toEqual(['?']);
  });
});

describe('tileLayoutFor', () => {
  it('uses tiles at normal text sizes and rows once text is large', () => {
    expect(tileLayoutFor(1)).toBe('tiles');
    expect(tileLayoutFor(1.3)).toBe('tiles');
    expect(tileLayoutFor(1.31)).toBe('rows');
  });
});
