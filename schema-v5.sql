-- schema-v5.sql
--
-- Fixes a real bug: cropping an image appeared to work, but the browser's
-- aggressive image caching (see functions/api/file/[key].js — 1 year,
-- immutable) would keep serving the OLD cached bytes once you navigated
-- away and back, since a cropped image reuses the exact same URL as the
-- original.
--
-- The fix: every image URL now carries a ?v=<updated_at> tag (see the
-- updated images.js). This column is what that tag is built from — it's
-- bumped by crop.js whenever the actual file bytes change (crop or
-- revert), which changes the URL, which means the browser can never
-- confuse old and new versions of the same file.
--
-- Apply in the Cloudflare dashboard: Storage & Databases → D1 →
-- moodboard-db → Console tab → paste and run each statement below.
-- (Or via wrangler: wrangler d1 execute moodboard-db --remote --file=schema-v5.sql)

ALTER TABLE images ADD COLUMN updated_at INTEGER;

-- Backfill: give every existing image a valid version stamp immediately,
-- using its upload time, rather than waiting for its next crop.
UPDATE images SET updated_at = uploaded_at WHERE updated_at IS NULL;
