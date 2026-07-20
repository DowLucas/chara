const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const { assertExists, copyDirMerge } = require('./copy');

const PROVIDER = 'app.chara.widget.CharaWidgetProvider';

/**
 * Copies the widget sources into the generated Android project.
 *
 * The Kotlin package is a fixed `app.chara.widget`, deliberately not derived
 * from `applicationId` (`chara.app` vs `chara.app.dev`) — Kotlin package and
 * applicationId are independent, so a fixed package compiles under both
 * variants with no source rewriting at copy time.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withWidgetSources = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'widgets', 'android');
      const platformRoot = cfg.modRequest.platformProjectRoot;

      assertExists(
        path.join(src, 'res', 'font', 'jetbrainsmono_medium.ttf'),
        'widget font resources',
      );

      copyDirMerge(path.join(src, 'java'), path.join(platformRoot, 'app/src/main/java'));
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

module.exports = { withAndroidWidget };
