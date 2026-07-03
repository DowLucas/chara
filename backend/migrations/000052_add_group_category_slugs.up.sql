-- Per-group expense-category configuration. Categories remain a fixed,
-- code-defined, fully-translated catalog (see app/lib/categories.ts /
-- internal/category) — this column holds which slugs a group has enabled,
-- and in what order. NULL means "use the full default catalog" so existing
-- groups need no backfill.
ALTER TABLE groups ADD COLUMN category_slugs TEXT[];
