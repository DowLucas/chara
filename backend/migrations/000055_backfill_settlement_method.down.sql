-- No-op. The up migration recovers information that was stored in the wrong
-- column; putting the rail name back into `note` would re-create the original
-- data-quality bug, and rows whose note was already NULL are indistinguishable
-- from rows this migration cleared. Rolling back the schema does not require
-- rolling back this correction.
SELECT 1;
