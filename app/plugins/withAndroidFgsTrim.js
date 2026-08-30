const { withAndroidManifest } = require('expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

/**
 * Permissions two Expo libraries contribute that Chara has no use for, and
 * which together trip Play Console's "restricted foreground service types"
 * check (Android 15 forbids a BOOT_COMPLETED receiver from starting a
 * mediaPlayback or microphone foreground service).
 *
 * - RECEIVE_BOOT_COMPLETED comes from expo-notifications, whose
 *   NotificationsService receiver re-schedules *local* notifications after a
 *   reboot. Chara schedules none — lib/push.ts is remote Expo Push only — so
 *   dropping the permission leaves the receiver with no boot trigger while
 *   keeping its NOTIFICATION_EVENT filter, which is what delivers taps.
 * - FOREGROUND_SERVICE_MEDIA_PLAYBACK comes from expo-audio and only backs
 *   AudioControlsService (below).
 *
 * The microphone service is deliberately left in place: voice expense capture
 * needs it, and with no boot permission there is no path from boot to it.
 */
const REMOVED_PERMISSIONS = [
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
];

/**
 * expo-audio's mediaPlayback service. It is referenced only from the library's
 * AudioPlayer, and Chara never constructs one — components/VoiceExpenseCapture
 * imports the recorder APIs alone — so the whole service is dead weight.
 */
const REMOVED_SERVICE = 'expo.modules.audio.service.AudioControlsService';

/** Find an element by android:name, or append a new one and return it. */
function upsertByName(list, name) {
  let entry = list.find((e) => e.$ && e.$['android:name'] === name);
  if (!entry) {
    entry = { $: { 'android:name': name } };
    list.push(entry);
  }
  return entry;
}

/**
 * Adds manifest-merger `tools:node="remove"` markers for library-contributed
 * entries Chara does not use.
 *
 * These have to be merger directives rather than edits: the entries live in
 * the libraries' own AndroidManifest.xml files and are merged in by Gradle
 * *after* prebuild, so there is nothing to delete at plugin time.
 *
 * Exported for unit testing; the plugin below is the real entry point.
 */
function trimAndroidManifest(androidManifest) {
  const manifest = androidManifest.manifest;
  manifest.$['xmlns:tools'] = TOOLS_NS;

  manifest['uses-permission'] = manifest['uses-permission'] || [];
  for (const permission of REMOVED_PERMISSIONS) {
    upsertByName(manifest['uses-permission'], permission).$['tools:node'] = 'remove';
  }

  const application = manifest.application[0];
  application.service = application.service || [];
  upsertByName(application.service, REMOVED_SERVICE).$['tools:node'] = 'remove';

  return androidManifest;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withAndroidFgsTrim = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = trimAndroidManifest(config.modResults);
    return config;
  });

module.exports = withAndroidFgsTrim;
module.exports.trimAndroidManifest = trimAndroidManifest;
