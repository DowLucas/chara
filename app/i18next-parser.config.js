/**
 * i18next-parser config — scans the app for t('…') calls and keeps
 * lib/locales/<lang>.json in sync.
 *
 *   pnpm i18n:extract        scan + write new keys
 *   pnpm i18n:check          scan + fail if anything would change (CI)
 */
module.exports = {
  locales: ['en'],
  defaultNamespace: 'translation',
  output: 'lib/locales/$LOCALE.json',
  input: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/__tests__/**',
    '!**/*.test.{ts,tsx}',
  ],
  keySeparator: '.',
  namespaceSeparator: false,
  createOldCatalogs: false,
  sort: true,
  // Preserve existing translations; only the source language (en) gets new keys
  // auto-filled with the key text. Other locales come from Weblate.
  defaultValue: (locale, _ns, key) => (locale === 'en' ? key : ''),
  // Keep keys we can't see statically — some screens use t(dynamicKey) for
  // error codes / action labels resolved at runtime. Stale-key audits happen
  // manually for now.
  keepRemoved: true,
  // We use t('group.key') style — flat keys with dot separators.
  lexers: {
    tsx: ['JsxLexer'],
    ts: ['JavascriptLexer'],
  },
  verbose: false,
  // Dynamic-key warnings are expected; don't fail the run on them.
  failOnWarnings: false,
};
