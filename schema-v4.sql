-- schema-v4.sql
--
-- Adds support for NON-DESTRUCTIVE cropping.
--
-- When an image is cropped for the first time, the original file is
-- copied to a backup location in R2, and this column remembers where
-- that backup lives. If the column is NULL, the image has never been
-- cropped (or was reverted back to its original).
--
-- Apply with:
--   wrangler d1 execute moodboard-db --remote --file=schema-v4.sql

ALTER TABLE images ADD COLUMN original_r2_key TEXT;
