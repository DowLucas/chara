/**
 * The plugin module is plain JS (Expo's plugin resolver requires a directly
 * requirable module), so it is loaded with `require`.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { trimAndroidManifest } = require('../withAndroidFgsTrim');

const BOOT = 'android.permission.RECEIVE_BOOT_COMPLETED';
const MEDIA_FGS = 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK';
const AUDIO_CONTROLS = 'expo.modules.audio.service.AudioControlsService';

/** Shape of a prebuilt AndroidManifest as @expo/config-plugins parses it. */
function manifestFixture(): any {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      'uses-permission': [
        { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
        { $: { 'android:name': 'android.permission.CAMERA' } },
      ],
      application: [{ $: { 'android:name': '.MainApplication' } }],
    },
  };
}

function permissionEntry(manifest: any, name: string) {
  return manifest.manifest['uses-permission'].find(
    (p: any) => p.$['android:name'] === name,
  );
}

describe('trimAndroidManifest', () => {
  it('declares the tools namespace so the remove markers resolve', () => {
    const out = trimAndroidManifest(manifestFixture());
    expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  });

  it('removes RECEIVE_BOOT_COMPLETED, which expo-notifications contributes', () => {
    const out = trimAndroidManifest(manifestFixture());
    expect(permissionEntry(out, BOOT).$['tools:node']).toBe('remove');
  });

  it('removes FOREGROUND_SERVICE_MEDIA_PLAYBACK, which expo-audio contributes', () => {
    const out = trimAndroidManifest(manifestFixture());
    expect(permissionEntry(out, MEDIA_FGS).$['tools:node']).toBe('remove');
  });

  it("removes expo-audio's unused mediaPlayback service", () => {
    const out = trimAndroidManifest(manifestFixture());
    const service = out.manifest.application[0].service.find(
      (s: any) => s.$['android:name'] === AUDIO_CONTROLS,
    );
    expect(service.$['tools:node']).toBe('remove');
  });

  it("leaves the app's own permissions untouched", () => {
    const out = trimAndroidManifest(manifestFixture());
    const record = permissionEntry(out, 'android.permission.RECORD_AUDIO');
    expect(record.$['tools:node']).toBeUndefined();
    expect(permissionEntry(out, 'android.permission.CAMERA')).toBeDefined();
  });

  it('is idempotent — a second prebuild pass adds no duplicates', () => {
    const once = trimAndroidManifest(manifestFixture());
    const twice = trimAndroidManifest(JSON.parse(JSON.stringify(once)));
    expect(twice.manifest['uses-permission']).toHaveLength(
      once.manifest['uses-permission'].length,
    );
    expect(twice.manifest.application[0].service).toHaveLength(
      once.manifest.application[0].service.length,
    );
  });

  it('marks an already-present permission rather than adding a second entry', () => {
    const input = manifestFixture();
    input.manifest['uses-permission'].push({ $: { 'android:name': BOOT } });
    const out = trimAndroidManifest(input);
    const matches = out.manifest['uses-permission'].filter(
      (p: any) => p.$['android:name'] === BOOT,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].$['tools:node']).toBe('remove');
  });
});
