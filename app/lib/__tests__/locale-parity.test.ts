/**
 * Every locale must carry the same key set as en.json. CLAUDE.md requires
 * non-English locales to be updated in the same commit as en.json; this
 * turns that convention into a failing test instead of a review catch.
 */

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import da from '../locales/da.json';
import de from '../locales/de.json';
import es from '../locales/es.json';
import fi from '../locales/fi.json';
import fr from '../locales/fr.json';
// `it` would shadow Jest's `it`.
import itIT from '../locales/it.json';
import ja from '../locales/ja.json';
import nbNO from '../locales/nb-NO.json';
import nl from '../locales/nl.json';
import pl from '../locales/pl.json';
import pt from '../locales/pt.json';
import sv from '../locales/sv.json';
import zhHans from '../locales/zh-Hans.json';
import { LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, resources } from '../i18n';

/** i18next plural suffixes. Languages have different plural categories
 *  (Arabic has six, English two), so parity is on the base key. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix.replace(PLURAL_SUFFIX, '')];
  return Object.entries(obj).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function keySet(obj: unknown): string[] {
  return [...new Set(flatKeys(obj))].sort();
}

const LOCALES: Record<string, unknown> = {
  ar, da, de, es, fi, fr, it: itIT, ja, 'nb-NO': nbNO, nl, pl, pt, sv, 'zh-Hans': zhHans,
};

describe('locale key parity', () => {
  const expected = keySet(en);

  it.each(Object.keys(LOCALES))('%s has exactly the keys en.json has', (lang) => {
    const actual = keySet(LOCALES[lang]);
    expect(actual.filter((k) => !expected.includes(k))).toEqual([]); // extra
    expect(expected.filter((k) => !actual.includes(k))).toEqual([]); // missing
  });
});

/**
 * A translated locale file is dead weight unless i18n.ts also registers it:
 * it must be selectable (SUPPORTED_LANGUAGES), loadable (resources) and
 * nameable in the picker (LANGUAGE_NATIVE_NAMES). es/nb-NO/pl/pt were fully
 * translated but unreachable until this test went in.
 */
describe('locale registration', () => {
  const registered = SUPPORTED_LANGUAGES as readonly string[];

  it.each(['en', ...Object.keys(LOCALES)])('%s is registered in i18n.ts', (lang) => {
    expect(registered).toContain(lang);
    expect(Object.keys(resources)).toContain(lang);
    expect(Object.keys(LANGUAGE_NATIVE_NAMES)).toContain(lang);
  });

  it('registers nothing that has no locale file', () => {
    const files = ['en', ...Object.keys(LOCALES)];
    expect(registered.filter((l) => !files.includes(l))).toEqual([]);
  });
});
