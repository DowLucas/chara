const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Adds the App Group to the **host app's** entitlements.
 *
 * @bacons/apple-targets sets the group on the extension only. If the host app
 * doesn't also hold it, the app writes to a container the widget cannot read
 * and the widget shows the empty state forever — with no error surfaced
 * anywhere. This is the single most common way to get this wrong.
 *
 * The group is derived from the bundle id so the dev variant (`app.chara.dev`)
 * gets its own container and cannot clobber a production install's widget
 * data on a device that has both.
 *
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const withIosWidget = (config) =>
  withEntitlementsPlist(config, (cfg) => {
    const bundleId = cfg.ios && cfg.ios.bundleIdentifier;
    if (!bundleId) {
      throw new Error(
        'withWidgets: ios.bundleIdentifier must be set before this plugin runs',
      );
    }
    const key = 'com.apple.security.application-groups';
    const existing = cfg.modResults[key];
    const groups = new Set(Array.isArray(existing) ? existing : []);
    groups.add(`group.${bundleId}`);
    cfg.modResults[key] = [...groups];
    return cfg;
  });

module.exports = { withIosWidget };
