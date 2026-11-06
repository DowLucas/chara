import { contactLine, tileLayoutFor } from '../profile-scene';

describe('tileLayoutFor', () => {
  it('uses tiles on common phone widths at normal text size', () => {
    expect(tileLayoutFor(1, 360)).toBe('tiles'); // small Android
    expect(tileLayoutFor(1, 375)).toBe('tiles'); // iPhone SE / mini
    expect(tileLayoutFor(1, 440)).toBe('tiles'); // Pro Max
  });

  it('uses rows when a tile is too narrow for its label', () => {
    expect(tileLayoutFor(1, 320)).toBe('rows'); // iPhone SE 1st gen
    expect(tileLayoutFor(1.2, 375)).toBe('rows');
  });

  it('keeps tiles at larger text when the screen is wide enough', () => {
    expect(tileLayoutFor(1.2, 440)).toBe('tiles');
  });

  it('uses rows once text is large, however wide the screen', () => {
    expect(tileLayoutFor(1.3, 600)).toBe('tiles');
    expect(tileLayoutFor(1.31, 600)).toBe('rows');
  });
});

describe('contactLine', () => {
  const NBSP = '\u00A0';

  it('joins email and phone so the line can only wrap after the dot', () => {
    expect(contactLine('lucas@example.com', '+46 70 123 45 67')).toBe(
      `lucas@example.com${NBSP}· +46${NBSP}70${NBSP}123${NBSP}45${NBSP}67`,
    );
  });

  it('keeps a hyphenated phone number in one piece', () => {
    expect(contactLine(undefined, '070-123 45')).toBe(`070\u2011123${NBSP}45`);
  });

  it('shows whichever part is set', () => {
    expect(contactLine('lucas@example.com', '  ')).toBe('lucas@example.com');
    expect(contactLine(null, '0701234567')).toBe('0701234567');
  });

  it('returns null when neither is set', () => {
    expect(contactLine(undefined, null)).toBeNull();
    expect(contactLine(' ', '')).toBeNull();
  });
});
