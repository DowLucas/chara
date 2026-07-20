/**
 * Native module surface for the homescreen widgets.
 *
 * Consumers should use `lib/widget-bridge.ts` rather than importing this
 * directly — it adds the no-op fallback, error swallowing, and write dedup.
 */

export interface CharaWidgetsModule {
  /** Persist the snapshot to shared storage and reload placed widgets. */
  setSnapshot(json: string): Promise<void>;
  /** Delete the snapshot outright. Used on sign-out / account removal. */
  clearSnapshot(): Promise<void>;
}
