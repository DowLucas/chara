const { withAndroidWidget } = require('./withAndroidWidget');
const { withIosWidget } = require('./withIosWidget');

/**
 * Homescreen widgets for iOS (WidgetKit) and Android (RemoteViews).
 *
 * `ios/` and `android/` are gitignored, so every widget file, the extension
 * target, the App Group entitlement and the Android receiver have to be
 * generated at prebuild. This plugin owns that.
 *
 * iOS target creation itself is delegated to @bacons/apple-targets, which
 * reads `targets/widget/expo-target.config.js`. It is pinned to an exact
 * version: it reads Expo prebuild internals, so an SDK bump can break it —
 * verify the widget target still builds before merging any SDK upgrade.
 *
 * Android deliberately uses classic RemoteViews rather than Glance. Glance
 * compiles into the app module and would require enabling Compose in the RN
 * app's Gradle files — brittle regex mods against files Expo itself rewrites
 * each SDK, plus a compile-time cost on every local release build. Do not
 * "upgrade" this to Glance without weighing that.
 *
 * Plain JavaScript, not TypeScript: Expo's plugin resolver requires a
 * directly-requirable module.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withWidgets = (config) => withAndroidWidget(withIosWidget(config));

module.exports = withWidgets;
