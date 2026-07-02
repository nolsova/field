-- schema-v3.sql
-- Run once with:
-- wrangler d1 execute moodboard-db --remote --file=./schema-v3.sql
--
-- Adds a location text column to the images table.
-- Safe to run on existing data — uses ALTER TABLE which preserves everything.

ALTER TABLE images ADD COLUMN location TEXT DEFAULT '';
