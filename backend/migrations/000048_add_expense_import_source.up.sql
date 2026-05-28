-- Attribution for expenses created via the "import from another app" flow.
-- Records which source app (splitwise, tricount, steven, …) a row was
-- migrated from. NULL for natively-created expenses. See
-- docs/superpowers/specs/2026-05-28-import-from-another-app-design.md.

ALTER TABLE expenses ADD COLUMN import_source TEXT;
