/**
 * Teardown for a voice recording, expressed over plain values.
 *
 * This exists because of a real crash. expo-audio's useAudioRecorder holds
 * the recorder in useReleasingSharedObject, whose unmount cleanup calls
 * .release() on the native object. That hook is created ABOVE the
 * component's own effects, and React runs unmount cleanups in declaration
 * order — so by the time our cleanup runs the native object is always
 * gone, and reading any property off it throws
 * NativeSharedObjectNotFoundException.
 *
 * The fix is not a try/catch around the read: it is to stop reading. The
 * clip's path is captured while the recorder is alive, and teardown works
 * on that string. Keeping this free of expo imports is what makes the rule
 * testable and hard to regress.
 */

export interface ReleaseRecordingOptions {
  /** Path captured WHILE the recorder was alive, or null if there is none. */
  uri: string | null;
  deleteFile(uri: string): Promise<void>;
  resetAudioMode(): Promise<void>;
}

/**
 * Delete the clip and hand the audio session back.
 *
 * Never rejects. This runs on unmount and cancel paths where there is
 * nobody left to handle a failure, and an unhandled rejection there is
 * exactly the bug this replaced.
 *
 * The session reset runs even when deleting fails: a leftover temp file is
 * untidy, but leaving allowsRecording set keeps iOS in record mode for the
 * rest of the process and routes later playback to the earpiece.
 */
export async function releaseRecording({
  uri,
  deleteFile,
  resetAudioMode,
}: ReleaseRecordingOptions): Promise<void> {
  if (uri) {
    try {
      await deleteFile(uri);
    } catch {
      // Already gone, or never written. The session still matters.
    }
  }
  try {
    await resetAudioMode();
  } catch {
    // Nothing useful to do — we are on our way out.
  }
}
