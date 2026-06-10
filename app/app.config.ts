import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Chara',
  slug: 'chara',
  version: '1.0.2',
  scheme: 'chara',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    // Chara is a proper iPad app: the UI uses a centered max-width content
    // column (see lib/responsive.ts + components/ContentContainer.tsx) so it
    // reads as a single column on iPad instead of stretching edge to edge.
    supportsTablet: true,
    bundleIdentifier: 'app.chara',
    usesAppleSignIn: true,
    // Universal Links — the system fetches
    // https://chara-api.lurkhuset.com/.well-known/apple-app-site-association
    // at install time and routes matching https URLs (/i/*) directly to the
    // app. See docs/superpowers/specs/2026-05-24-invite-deep-links-design.md
    // Phase 2 and backend/internal/handler/aasa.go. Android `intentFilters`
    // / `assetlinks.json` are a future wave gated on Play Console.
    associatedDomains: ['applinks:chara-api.lurkhuset.com'],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Allow Chara to access your camera to scan group QR codes and capture receipt photos.',
      NSPhotoLibraryUsageDescription:
        'Allow Chara to access your photo library to upload a profile picture or attach a receipt photo.',
      // Schemes Chara may call Linking.canOpenURL on. iOS hides apps not
      // listed here behind a `false` return, even if the app is installed.
      LSApplicationQueriesSchemes: ['swish'],
    },
    // Required since May 2024 for App Store submission. The Expo build merges
    // this with whatever the bundled Expo modules declare in their own
    // PrivacyInfo.xcprivacy files. The categories below cover the app's own
    // API usage (UserDefaults, file timestamps, system uptime, disk space)
    // and the data classes we knowingly collect. NSPrivacyTracking is false
    // because Chara does not link user/device data to third-party data for
    // advertising or measurement across other companies' apps.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
            'NSPrivacyCollectedDataTypePurposeAnalytics',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAnalytics',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          ],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          ],
        },
      ],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F0E5CC',
    },
    package: 'chara.app',
    // Android App Links — the system fetches
    // https://chara-api.lurkhuset.com/.well-known/assetlinks.json and, when it
    // verifies the app's signing cert, routes matching https /i/* URLs straight
    // to the app (autoVerify). Counterpart to iOS associatedDomains above.
    // See backend/internal/handler/assetlinks.go and the invite-deep-links spec.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'chara-api.lurkhuset.com',
            pathPrefix: '/i',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F0E5CC',
        image: './assets/chara-logo.png',
        imageWidth: 200,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/SNPro-VariableFont_wght.ttf',
          './assets/fonts/SNPro-Italic-VariableFont_wght.ttf',
          './assets/fonts/JetBrainsMono-Regular.ttf',
          './assets/fonts/JetBrainsMono-Medium.ttf',
        ],
      },
    ],
    [
      'expo-secure-store',
      {
        faceIDPermission: 'Allow Chara to access Face ID.',
      },
    ],
    [
      'expo-camera',
      {
        // Must match the top-level NSCameraUsageDescription above — the
        // expo-camera plugin overrides Info.plist at prebuild time, so a
        // narrower string here drops the receipt-photo justification and
        // makes the merged plist inconsistent at App Review time.
        cameraPermission:
          'Allow Chara to use the camera to scan group QR codes and capture receipt photos.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Chara to access your photo library to upload a profile picture.',
      },
    ],
    'expo-localization',
    '@react-native-community/datetimepicker',
    'expo-apple-authentication',
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          'com.googleusercontent.apps.53625108191-nkpr2abaukbq7s22ev6fp4vmu1djrsgf',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  owner: 'lucasdow1',
  extra: {
    // Only the official hosted build has POSTHOG_API_KEY supplied (via EAS
    // Secrets). Local dev / forks have it unset — the analytics wrapper
    // becomes a permanent no-op when the key is missing.
    posthogApiKey: process.env.POSTHOG_API_KEY ?? null,
    posthogHost: process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    eas: {
      projectId: '8049463f-fe32-4462-a2eb-6cc1e63e1ed2',
    },
  },
};

export default config;
