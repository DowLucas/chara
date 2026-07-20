const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const { assertExists, copyDirMerge } = require('./copy');

const PROVIDER = 'app.chara.widget.CharaWidgetProvider';

/**
 * Copy-time rewrite injecting `import <androidPackage>.R` into Kotlin sources
 * that reference `R.*`.
 *
 * The widget's Kotlin package is a fixed `app.chara.widget` while the app
 * module's namespace — where `R` is generated — is the applicationId
 * (`chara.app` vs `chara.app.dev`), so the import cannot be hardcoded in the
 * source. Idempotent: the injected import short-circuits a second pass, so
 * re-copying an already-transformed tree cannot double-inject.
 *
 * @param {string} androidPackage
 * @returns {(fileName: string, content: string) => string}
 */
const kotlinRImportTransform = (androidPackage) => {
  const rImport = `import ${androidPackage}.R`;
  return (fileName, content) => {
    if (!fileName.endsWith('.kt')) return content;
    if (!/\bR\.[a-z]/.test(content)) return content;
    if (content.includes(`${rImport}\n`)) return content;
    const rewritten = content.replace(/^(package .+)$/m, `$1\n\n${rImport}`);
    if (!rewritten.includes(rImport)) {
      throw new Error(`withWidgets: no package declaration to anchor R import in ${fileName}`);
    }
    return rewritten;
  };
};

/**
 * Copies the widget sources into the generated Android project.
 *
 * The Kotlin package is a fixed `app.chara.widget`, deliberately not derived
 * from `applicationId` (`chara.app` vs `chara.app.dev`) — Kotlin package and
 * applicationId are independent, so a fixed package compiles under both
 * variants. The one thing that does depend on the variant is the `R` class
 * import, handled by `kotlinRImportTransform` above.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withWidgetSources = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'widgets', 'android');
      const platformRoot = cfg.modRequest.platformProjectRoot;

      const androidPackage = cfg.android?.package;
      if (!androidPackage) {
        throw new Error('withWidgets: android.package missing from the Expo config');
      }

      assertExists(
        path.join(src, 'res', 'font', 'jetbrainsmono_medium.ttf'),
        'widget font resources',
      );

      copyDirMerge(
        path.join(src, 'java'),
        path.join(platformRoot, 'app/src/main/java'),
        kotlinRImportTransform(androidPackage),
      );
      copyDirMerge(path.join(src, 'res'), path.join(platformRoot, 'app/src/main/res'));
      return cfg;
    },
  ]);

/**
 * Registers the widget provider.
 *
 * `exported="false"` is correct: the system's APPWIDGET_UPDATE broadcast
 * reaches non-exported receivers, and exporting it would widen the surface
 * for no benefit.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withWidgetReceiver = (config) =>
  withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('withWidgets: no <application> node in AndroidManifest');
    }
    application.receiver = application.receiver ?? [];

    // Idempotent: prebuild runs repeatedly, and a duplicate <receiver> fails
    // the manifest merger.
    const already = application.receiver.some(
      (r) => r.$ && r.$['android:name'] === PROVIDER,
    );
    if (already) return cfg;

    application.receiver.push({
      $: { 'android:name': PROVIDER, 'android:exported': 'false' },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/chara_widget_info',
          },
        },
      ],
    });

    return cfg;
  });

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withAndroidWidget = (config) => withWidgetReceiver(withWidgetSources(config));

module.exports = { withAndroidWidget, kotlinRImportTransform };
