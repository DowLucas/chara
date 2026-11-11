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

/** Same walk as flatKeys but keeps plural suffixes intact. */
function flatKeysRaw(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) =>
    flatKeysRaw(v, prefix ? `${prefix}.${k}` : k),
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

/**
 * A translation may only interpolate variables the call site actually passes.
 * en.json is the contract: the union of placeholders across a key's plural
 * forms is what the caller supplies. `count` is exempt — i18next always
 * injects it for a pluralized key. A translation that invents a variable
 * renders the literal `{{name}}` to the user, which is how every non-English
 * `waitlist.title` shipped `{{cap}}` after the English copy dropped the number.
 */
describe('placeholder parity', () => {
  const placeholders = (s: unknown): string[] =>
    typeof s === 'string' ? [...s.matchAll(/\{\{\s*(\w+)/g)].map((m) => m[1]) : [];

  function byBaseKey(obj: unknown): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const walk = (node: unknown, prefix: string) => {
      if (typeof node !== 'object' || node === null) {
        const base = prefix.replace(PLURAL_SUFFIX, '');
        out.set(base, [...(out.get(base) ?? []), ...placeholders(node)]);
        return;
      }
      for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
    };
    walk(obj, '');
    return out;
  }

  const supplied = byBaseKey(en);

  it.each(Object.keys(LOCALES))('%s interpolates only variables en.json supplies', (lang) => {
    const undefinedVars: string[] = [];
    for (const [base, used] of byBaseKey(LOCALES[lang])) {
      const allowed = new Set([...(supplied.get(base) ?? []), 'count']);
      for (const v of new Set(used)) {
        if (!allowed.has(v)) undefinedVars.push(`${base}: {{${v}}}`);
      }
    }
    expect(undefinedVars).toEqual([]);
  });
});

/**
 * i18next picks a plural suffix from the language's CLDR categories. A key
 * missing a category its language requires (Polish `_few`, Spanish `_many`)
 * silently falls back, so the user reads a grammatically wrong sentence.
 * Extra categories are dead weight rather than a defect, so they are allowed.
 */
describe('plural category completeness', () => {
  const suffixesFor = (obj: unknown, base: string): string[] =>
    flatKeysRaw(obj)
      .filter((k) => k.replace(PLURAL_SUFFIX, '') === base && PLURAL_SUFFIX.test(k))
      .map((k) => k.match(PLURAL_SUFFIX)![1]);

  const pluralBases = [...new Set(
    flatKeysRaw(en).filter((k) => PLURAL_SUFFIX.test(k)).map((k) => k.replace(PLURAL_SUFFIX, '')),
  )];

  it.each(Object.keys(LOCALES))('%s covers every CLDR plural category', (lang) => {
    const required = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    const gaps: string[] = [];
    for (const base of pluralBases) {
      const have = new Set(suffixesFor(LOCALES[lang], base));
      if (have.size === 0) continue; // not pluralized in this language
      for (const cat of required) if (!have.has(cat)) gaps.push(`${base}_${cat}`);
    }
    expect(gaps).toEqual([]);
  });
});
