import config from '../../app.config';

function pluginOptions(name: string): Record<string, unknown> | undefined {
  const entry = config.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe('app.config', () => {
  // App Review (Guideline 2.5.4) rejected 1.5.1 for declaring the `audio`
  // UIBackgroundModes without a persistent-audio feature. expo-audio's plugin
  // adds that mode unless background playback is explicitly turned off; voice
  // expense capture records in the foreground only.
  it('does not let expo-audio declare background audio', () => {
    const audio = pluginOptions('expo-audio');
    expect(audio?.enableBackgroundPlayback).toBe(false);
    expect(audio?.enableBackgroundRecording).not.toBe(true);
    expect(config.ios?.infoPlist?.UIBackgroundModes ?? []).not.toContain('audio');
  });
});
