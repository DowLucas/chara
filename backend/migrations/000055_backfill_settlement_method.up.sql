-- Recover the payment rail from `note` into `method`.
--
-- The app shipped without a `method` field on its settle payload (SettleInput
-- in app/lib/api.ts), so settle-method.tsx passed the rail name through `note`
-- instead. Every historical settlement therefore reads method='manual' with
-- the rail sitting in the free-text note the user sees on the settlement row.
-- See issue #102 (B1).
--
-- Safe because that call site is the only writer of `note` and it only ever
-- sent a bare rail name. Both statements are guarded on method = 'manual' so
-- a row already carrying a real method is never rewritten, and on an exact
-- rail-name match so a genuine user note ("Pizza money") is left alone.
-- Both are idempotent — re-running matches nothing.
UPDATE settlements
SET method = note,
    note   = NULL
WHERE method = 'manual'
  AND note IN ('swish', 'vipps', 'mobilepay');

-- 'manual' in the note said nothing that `method` doesn't already say.
UPDATE settlements
SET note = NULL
WHERE method = 'manual'
  AND note = 'manual';
