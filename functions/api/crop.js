// functions/api/crop.js
//
// Handles NON-DESTRUCTIVE image cropping.
//
// Two operations, both POST to /api/crop:
//
//   1. APPLY A CROP  — sent as FormData with:
//        id     : the image's database id
//        image  : the cropped image file (produced by the canvas in the browser)
//      What happens:
//        - If this is the FIRST crop of this image, the current (original)
//          file is copied to a backup key in R2 first ("orig-<r2_key>"),
//          and that backup location is remembered in the database.
//        - The cropped file then OVERWRITES the image's normal r2_key.
//          Because the key doesn't change, everything else (grid, viewer,
//          boards, the homepage integration) keeps working untouched.
//        - updated_at is bumped — see the note below on why this matters.
//
//   2. REVERT TO ORIGINAL — sent as JSON with:
//        { "id": "...", "revert": true }
//      What happens:
//        - The backup file is copied back over the normal r2_key,
//          the backup is deleted, and the database column is cleared.
//        - updated_at is bumped here too.
//
// Why updated_at matters (fixed after the original build of this file):
// images.js builds each image's URL as /api/file/<key>?v=<updated_at>, and
// [key].js caches image responses for a full year as "immutable". Without
// updated_at changing here, a crop would overwrite the file on the server
// correctly, but every browser that had already loaded this image would
// keep confidently serving its old cached (pre-crop) copy from that same
// URL — appearing as if the crop "didn't save," even though it had.
// Bumping updated_at changes the URL, which is the only way to tell a
// browser "this really is different content now, go fetch it again."
//
// Auth: same x-api-key check as upload.js — the key lives in
// Cloudflare's encrypted secrets (env.MOODBOARD_API_KEY).

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- Auth check, identical pattern to upload.js ---
  const providedKey = request.headers.get("x-api-key");
  if (!providedKey || providedKey !== env.MOODBOARD_API_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const contentType = request.headers.get("Content-Type") || "";

    // ---------- REVERT (JSON body) ----------
    if (contentType.includes("application/json")) {
      const { id, revert } = await request.json();
      if (!revert) return json({ error: "Unknown JSON action" }, 400);
      if (!id) return json({ error: "No image id provided" }, 400);

      const row = await env.DB.prepare(
        `SELECT r2_key, original_r2_key FROM images WHERE id = ?`
      ).bind(id).first();

      if (!row) return json({ error: "Image not found" }, 404);
      if (!row.original_r2_key) {
        // Nothing to revert — the image was never cropped.
        return json({ error: "No original to revert to" }, 400);
      }

      // Fetch the backed-up original from R2...
      const backup = await env.IMAGES_BUCKET.get(row.original_r2_key);
      if (!backup) return json({ error: "Backup file missing from storage" }, 500);

      // ...copy it back over the display key...
      await env.IMAGES_BUCKET.put(row.r2_key, backup.body, {
        httpMetadata: backup.httpMetadata,
      });

      // ...delete the backup, clear the column, and bump updated_at so
      // the URL changes back away from the cropped version's ?v=.
      await env.IMAGES_BUCKET.delete(row.original_r2_key);
      await env.DB.prepare(
        `UPDATE images SET original_r2_key = NULL, updated_at = ? WHERE id = ?`
      ).bind(Date.now(), id).run();

      return json({ success: true, reverted: true });
    }

    // ---------- APPLY CROP (FormData body) ----------
    const formData = await request.formData();
    const id = formData.get("id");
    const file = formData.get("image");

    if (!id) return json({ error: "No image id provided" }, 400);
    if (!file) return json({ error: "No cropped image provided" }, 400);

    const row = await env.DB.prepare(
      `SELECT r2_key, original_r2_key FROM images WHERE id = ?`
    ).bind(id).first();

    if (!row) return json({ error: "Image not found" }, 404);

    // First crop ever? Back up the original before touching anything.
    // (If original_r2_key is already set, the backup exists from a
    // previous crop — re-cropping just replaces the display file again,
    // and revert still goes all the way back to the true original.)
    if (!row.original_r2_key) {
      const current = await env.IMAGES_BUCKET.get(row.r2_key);
      if (!current) return json({ error: "Original file missing from storage" }, 500);

      const backupKey = `orig-${row.r2_key}`;
      await env.IMAGES_BUCKET.put(backupKey, current.body, {
        httpMetadata: current.httpMetadata,
      });
      await env.DB.prepare(
        `UPDATE images SET original_r2_key = ? WHERE id = ?`
      ).bind(backupKey, id).run();
    }

    // Overwrite the display key with the cropped version.
    await env.IMAGES_BUCKET.put(row.r2_key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    // The actual fix: bump updated_at so images.js builds a fresh ?v=
    // for this image on the next fetch, forcing browsers past their
    // year-long cache instead of silently reusing the pre-crop bytes.
    await env.DB.prepare(
      `UPDATE images SET updated_at = ? WHERE id = ?`
    ).bind(Date.now(), id).run();

    return json({ success: true, cropped: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
