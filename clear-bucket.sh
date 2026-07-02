#!/bin/bash
#
# clear-bucket.sh
#
# Deletes every image file in the moodboard-images R2 bucket, AND clears
# the database tables (images, tags, image_tags) — a full reset.
#
# ⚠️ DANGER: this permanently deletes every image and all tags/notes.
# There is no undo. Only run this if you're sure, and you have your own
# copies of anything you care about saved elsewhere.
#
# How it works: wrangler's R2 commands don't include a "list" command
# (only get/put/delete), so instead of asking R2 what files exist, this
# asks YOUR OWN DATABASE — which already keeps a record of every uploaded
# file's r2_key in the `images` table. That list is used to delete each
# file from R2, then the database tables are cleared.

set -e  # stop immediately if any command fails, rather than continuing blindly

BUCKET="moodboard-images"
DB="moodboard-db"

echo "Looking up uploaded file keys from the database..."

# --json returns the query result as JSON so we can parse it reliably,
# rather than scraping the human-readable table Wrangler normally prints.
RAW_JSON=$(wrangler d1 execute "$DB" --remote --json --command="SELECT r2_key FROM images;")

KEYS=$(echo "$RAW_JSON" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const result = JSON.parse(data);
    // wrangler d1 --json returns an array of query results; the first
    // result's .results array holds the actual rows.
    const rows = result[0]?.results || [];
    rows.forEach(r => console.log(r.r2_key));
  });
")

if [ -z "$KEYS" ]; then
  echo "No images found in the database. Nothing to delete."
else
  COUNT=$(echo "$KEYS" | wc -l | tr -d ' ')
  echo "Found $COUNT image file(s) to delete from R2:"
  echo "$KEYS"
  echo ""
fi

read -p "Type DELETE to permanently remove all images and reset the database: " CONFIRM

if [ "$CONFIRM" != "DELETE" ]; then
  echo "Cancelled. Nothing was deleted."
  exit 0
fi

if [ -n "$KEYS" ]; then
  echo "$KEYS" | while IFS= read -r key; do
    if [ -n "$key" ]; then
      echo "Deleting from R2: $key"
      wrangler r2 object delete "$BUCKET/$key"
    fi
  done
fi

echo "Clearing database tables..."
wrangler d1 execute "$DB" --remote --command="DELETE FROM image_tags; DELETE FROM images; DELETE FROM tags;"

echo "Done. Bucket and database are now empty."
