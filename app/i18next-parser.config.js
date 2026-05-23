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
  // Mark removed keys instead of deleting them on the first pass, so we notice.
  keepRemoved: false,
  // We use t('group.key') style — flat keys with dot separators.
  lexers: {
    tsx: ['JsxLexer'],
    ts: ['JavascriptLexer'],
  },
  verbose: false,
  failOnWarnings: true,
};
