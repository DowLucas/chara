import { releaseRecording } from '../voice-recording';

describe('releaseRecording', () => {
  it('deletes the captured clip and hands back the audio session', async () => {
    const deleted: string[] = [];
    let reset = false;
    await releaseRecording({
      uri: 'file:///tmp/clip.m4a',
      deleteFile: async (u) => {
        deleted.push(u);
      },
      resetAudioMode: async () => {
        reset = true;
      },
    });
    expect(deleted).toEqual(['file:///tmp/clip.m4a']);
    expect(reset).toBe(true);
  });

  it('still releases the session when there is no clip', async () => {
    let reset = false;
    await releaseRecording({
      uri: null,
      deleteFile: async () => {
        throw new Error('should not be called');
      },
      resetAudioMode: async () => {
        reset = true;
      },
    });
    expect(reset).toBe(true);
  });

  // The session matters more than the file: leaving allowsRecording set
  // keeps iOS in record mode for the rest of the process.
  it('releases the session even if deleting the clip fails', async () => {
    let reset = false;
    await expect(
      releaseRecording({
        uri: 'file:///tmp/clip.m4a',
        deleteFile: async () => {
          throw new Error('ENOENT');
        },
        resetAudioMode: async () => {
          reset = true;
        },
      }),
    ).resolves.toBeUndefined();
    expect(reset).toBe(true);
  });

  // This is the crash that shipped: on unmount expo-audio has already
  // released the native recorder, so anything that reads from it throws
  // NativeSharedObjectNotFoundException. releaseRecording must therefore
  // take a plain string and never touch the recorder.
  it('never resolves the uri lazily — it takes a plain value', async () => {
    let reset = false;
    const released = { get uri(): string {
      throw new Error('NativeSharedObjectNotFoundException');
    } };
    // Reading `released.uri` at the CALL SITE is the caller's problem;
    // releaseRecording itself must be safe to call with an already-captured
    // value long after the native object is gone.
    await releaseRecording({
      uri: 'file:///tmp/captured-earlier.m4a',
      deleteFile: async () => {},
      resetAudioMode: async () => {
        reset = true;
      },
    });
    expect(reset).toBe(true);
    expect(() => released.uri).toThrow();
  });

  it('swallows a failing session reset rather than rejecting', async () => {
    await expect(
      releaseRecording({
        uri: null,
        deleteFile: async () => {},
        resetAudioMode: async () => {
          throw new Error('audio session busy');
        },
      }),
    ).resolves.toBeUndefined();
  });
});
