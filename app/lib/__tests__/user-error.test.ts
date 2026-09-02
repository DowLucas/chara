/**
 * `userErrorMessage` is the last gate between a thrown error and a popup the
 * user reads. Server prose passes through; network failures become a
 * translated "you're offline" line; anything machine-shaped collapses to the
 * caller's own translated fallback.
 *
 * `expo-localization` / `expo-secure-store` reach into native modules that
 * don't exist under Node, so stub them before importing the i18n module.
 */
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import i18n from '../i18n';
import { userErrorMessage } from '../user-error';

const FALLBACK = 'Could not load this.';
const NETWORK = i18n.t('common.networkError');

describe('userErrorMessage', () => {
  it('passes a human server message through unchanged', () => {
    expect(userErrorMessage(new Error('equal split values must be 0'), FALLBACK)).toBe(
      'equal split values must be 0',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(userErrorMessage(new Error('  title is required  '), FALLBACK)).toBe(
      'title is required',
    );
  });

  it('maps a fetch TypeError to the offline message', () => {
    expect(userErrorMessage(new TypeError('Network request failed'), FALLBACK)).toBe(NETWORK);
  });

  it('maps network-shaped messages on a plain Error to the offline message', () => {
    for (const m of [
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'The Internet connection appears to be offline.',
      'timeout',
      'The request timed out.',
    ]) {
      expect(userErrorMessage(new Error(m), FALLBACK)).toBe(NETWORK);
    }
  });

  it('falls back when there is no message at all', () => {
    expect(userErrorMessage(new Error(''), FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage({}, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for an absurdly long message', () => {
    expect(userErrorMessage(new Error('x'.repeat(201)), FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a raw JSON body', () => {
    expect(userErrorMessage(new Error('{"error":"nope","code":17}'), FALLBACK)).toBe(FALLBACK);
    expect(userErrorMessage(new Error('[{"id":1}]'), FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for Go-shaped internals', () => {
    for (const m of [
      '*net.OpError',
      'json.SyntaxError',
      'panic: runtime error: index out of range',
      'runtime error: invalid memory address',
      'sql: no rows in result set',
      'pq: duplicate key value violates unique constraint',
      'http: server closed idle connection',
      'EOF',
      'internal/handler/expense.go:412: unexpected',
    ]) {
      expect(userErrorMessage(new Error(m), FALLBACK)).toBe(FALLBACK);
    }
  });

  it('does not mistake ordinary prose for machine output', () => {
    for (const m of [
      "You can't remove the last member of a group.",
      'Amount must be greater than 0.',
      'This invite has expired. Ask for a new link.',
    ]) {
      expect(userErrorMessage(new Error(m), FALLBACK)).toBe(m);
    }
  });

  it('accepts a bare string as the error', () => {
    expect(userErrorMessage('group is locked', FALLBACK)).toBe('group is locked');
  });
});
