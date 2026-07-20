/**
 * WidgetKit extension target, generated at prebuild by @bacons/apple-targets
 * (ios/ is gitignored — see plugins/withWidgets).
 *
 * The App Group is derived from the host bundle id so the dev variant gets
 * its own container. `plugins/withWidgets` adds the same group to the *host*
 * app's entitlements; without that the app writes to a container the widget
 * cannot read and the widget silently shows the empty state forever.
 */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = (config) => ({
  type: 'widget',
  // Must NOT collide with the `CharaWidgets` pod in modules/chara-widgets:
  // both would emit a Swift module of the same name, and the app (iOS 15.1)
  // would resolve `import CharaWidgets` to this extension's 17.0 swiftmodule
  // and fail to compile. The JS-facing name is `Name("CharaWidgets")` in the
  // module definition and is independent of this.
  name: 'CharaWidgetExtension',
  // Appended to the host id: app.chara -> app.chara.widgets. Apple requires
  // the extension id to be a prefix-child of the host app's.
  bundleIdentifier: '.widgets',
  // 17.0 for containerBackground(for:), which is mandatory on iOS 17+ —
  // omitting it renders a blank background instead of our paper colour.
  deploymentTarget: '17.0',
  entitlements: {
    'com.apple.security.application-groups': [`group.${config.ios.bundleIdentifier}`],
  },
  frameworks: ['SwiftUI', 'WidgetKit'],
});
