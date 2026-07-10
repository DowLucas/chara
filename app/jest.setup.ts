// Tests run in plain Node where `EXPO_PUBLIC_HOSTED_API_URL` isn't injected.
// Pin it to a neutral example origin so `MAIN_HOSTED_SERVER_URL` resolves
// deterministically (fixtures use this same host for the "Chara Cloud" server).
process.env.EXPO_PUBLIC_HOSTED_API_URL = 'https://api.example.com';

// api.ts now surfaces localized error messages (apiErrorMessage → i18n), and
// i18n.ts reads the device locale via expo-localization, which has no native
// backing under plain Node. Pin a deterministic locale so any module that
// transitively imports i18n (api.ts, and the tests that import it) loads.
jest.mock('expo-localization', () => ({
  getLocales: () => [
    { languageCode: 'en', languageTag: 'en-US', regionCode: 'US', currencyCode: 'USD' },
  ],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));
