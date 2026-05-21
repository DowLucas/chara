-- Language to localise AI-generated receipt titles into. ISO 639-1 codes
-- (en, sv, ja, …). Stored at the group level so all members of a group see
-- the same expense titles regardless of who scanned the receipt.
ALTER TABLE groups
    ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
