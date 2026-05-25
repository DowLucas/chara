import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Chara',
  slug: 'chara',
  version: '1.0.0',
  scheme: 'chara',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    backgroundColor: '#F0E5CC',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.chara',
    usesAppleSignIn: true,
    infoPlist: {
      NSUserNotificationsUsageDescription:
        'Chara sends push notifications when group members add expenses or settle up.',
      // Schemes Chara may call Linking.canOpenURL on. iOS hides apps not
      // listed here behind a `false` return, even if the app is installed.
      LSApplicationQueriesSchemes: ['swish'],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F0E5CC',
    },
    package: 'app.chara',
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
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
        cameraPermission: 'Allow Chara to use the camera to scan group QR codes.',
      },
    ],
    'expo-localization',
    '@react-native-community/datetimepicker',
    'expo-apple-authentication',
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
