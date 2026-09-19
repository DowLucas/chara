import { matchesExpenseQuery } from '../expense-search';

const pizza = { title: 'Pizza night', notes: 'Pepperoni + margherita' };

describe('matchesExpenseQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    expect(matchesExpenseQuery(pizza, 'Anna', '')).toBe(true);
    expect(matchesExpenseQuery(pizza, 'Anna', '   ')).toBe(true);
  });

  it('matches title case-insensitively', () => {
    expect(matchesExpenseQuery(pizza, 'Anna', 'PIZZA')).toBe(true);
    expect(matchesExpenseQuery(pizza, 'Anna', 'sushi')).toBe(false);
  });

  it('ignores diacritics in both directions', () => {
    expect(matchesExpenseQuery({ title: 'Café' }, undefined, 'cafe')).toBe(true);
    expect(matchesExpenseQuery({ title: 'Cafe' }, undefined, 'café')).toBe(true);
    expect(matchesExpenseQuery({ title: 'Lunch' }, 'Åke', 'ake')).toBe(true);
  });

  it('matches notes', () => {
    expect(matchesExpenseQuery(pizza, 'Anna', 'pepperoni')).toBe(true);
  });

  it('matches payer name', () => {
    expect(matchesExpenseQuery(pizza, 'Anna', 'ann')).toBe(true);
  });

  it('requires every token to match somewhere (AND)', () => {
    expect(matchesExpenseQuery(pizza, 'Anna', 'anna pizza')).toBe(true);
    expect(matchesExpenseQuery(pizza, 'Anna', 'anna sushi')).toBe(false);
  });

  it('handles missing notes and payer', () => {
    expect(matchesExpenseQuery({ title: 'Taxi' }, undefined, 'taxi')).toBe(true);
    expect(matchesExpenseQuery({ title: 'Taxi' }, undefined, 'anna')).toBe(false);
  });
});
