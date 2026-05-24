import { initialsOf, firstNameOf, shortName, makeNameShortener } from '../name';

describe('initialsOf', () => {
  it('returns ? for empty', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
    expect(initialsOf(undefined)).toBe('?');
  });
  it('uses first two letters for a single-word name', () => {
    expect(initialsOf('Lucas')).toBe('LU');
  });
  it('uses first + last initial for multi-word', () => {
    expect(initialsOf('Lucas Dow Heinonen')).toBe('LH');
  });
});

describe('firstNameOf', () => {
  it('returns first word', () => {
    expect(firstNameOf('Lucas Dow Heinonen')).toBe('Lucas');
  });
  it('returns null for empty / whitespace', () => {
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf('   ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe('shortName', () => {
  it('returns full name when it already fits', () => {
    expect(shortName('Lucas')).toBe('Lucas');
    expect(shortName('Anton', 12)).toBe('Anton');
  });
  it('keeps pronouns/short strings untouched', () => {
    expect(shortName('you')).toBe('you');
    expect(shortName('—')).toBe('—');
  });
  it('falls back to first+last when full name exceeds budget', () => {
    expect(shortName('Lucas Dow Heinonen', 14)).toBe('Lucas Heinonen');
  });
  it('falls back to first + last initial', () => {
    expect(shortName('Lucas Dow Heinonen', 9)).toBe('Lucas H.');
  });
  it('falls back to first name only', () => {
    // Budget too tight for "Alexandra W." (12 chars) — drops to first name.
    expect(shortName('Alexandra Margaret Wexler', 11)).toBe('Alexandra');
  });
  it('truncates a single overlong token with ellipsis', () => {
    expect(shortName('Mwangaaaaaaaaaa', 6)).toBe('Mwang…');
  });
  it('handles empty input', () => {
    expect(shortName('')).toBe('?');
    expect(shortName(null)).toBe('?');
  });
});

describe('makeNameShortener', () => {
  it('returns first name when unique in group', () => {
    const shorten = makeNameShortener(['Lucas Dow', 'Daisy Ng', 'Anton Wexler']);
    expect(shorten('Lucas Dow')).toBe('Lucas');
    expect(shorten('Daisy Ng')).toBe('Daisy');
    expect(shorten('Anton Wexler')).toBe('Anton');
  });

  it('adds last initial when first name collides', () => {
    const shorten = makeNameShortener(['Lucas Dow', 'Lucas Heinonen', 'Anton Wexler']);
    expect(shorten('Lucas Dow')).toBe('Lucas D.');
    expect(shorten('Lucas Heinonen')).toBe('Lucas H.');
    expect(shorten('Anton Wexler')).toBe('Anton');
  });

  it('falls back to full last name when first + last initial also collides', () => {
    const shorten = makeNameShortener([
      'Lucas Heinonen',
      'Lucas Holm',
      'Daisy Ng',
    ]);
    expect(shorten('Lucas Heinonen')).toBe('Lucas Heinonen');
    expect(shorten('Lucas Holm')).toBe('Lucas Holm');
    expect(shorten('Daisy Ng')).toBe('Daisy');
  });

  it('is case-insensitive for collision detection but preserves casing', () => {
    const shorten = makeNameShortener(['lucas dow', 'Lucas Heinonen']);
    expect(shorten('Lucas Heinonen')).toBe('Lucas H.');
    expect(shorten('lucas dow')).toBe('lucas d.');
  });

  it('returns first name for single-token names even on collision', () => {
    const shorten = makeNameShortener(['Lucas', 'Lucas Dow']);
    expect(shorten('Lucas')).toBe('Lucas');
    expect(shorten('Lucas Dow')).toBe('Lucas D.');
  });

  it('handles empty / unknown inputs', () => {
    const shorten = makeNameShortener(['Lucas Dow']);
    expect(shorten('')).toBe('?');
    expect(shorten(null)).toBe('?');
    // Name not in original set still gets disambiguated against the set.
    expect(shorten('Anton')).toBe('Anton');
  });
});
