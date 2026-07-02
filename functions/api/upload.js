// functions/api/upload.js
//
// This runs on Cloudflare's servers (not in the browser) whenever a request
// hits /api/upload. It receives an image, stores the raw file in R2 (object
// storage), and saves metadata (filename, tags, size) in D1 (the database).
//
// Every request must include the correct API key in the
// x-api-key header, otherwise it's rejected with a 401.
// The key lives in Cloudflare's encrypted secrets (env.MOODBOARD_API_KEY),
// never in any code file.

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Check the API key before doing anything else.
  // ⚠️ If MOODBOARD_API_KEY is not set as a Cloudflare secret, this will
  // reject ALL requests including from the app itself — make sure the
  // secret is set via: wrangler pages secret put MOODBOARD_API_KEY
  const providedKey = request.headers.get("x-api-key");
  if (!providedKey || providedKey !== env.MOODBOARD_API_KEY) {
    return unauthorized();
  }

  try {
    const formData = await request.formData();
    // getAll() supports multiple files being sent under the same "image" field name
    const files = formData.getAll("image");
    const tagsRaw = formData.get("tags") || "";
    const notes = formData.get("notes") || "";
    const location = formData.get("location") || "";
    const boardsRaw = formData.get("boards") || "[]";
    let boardIds = [];
    try { boardIds = JSON.parse(boardsRaw); } catch (e) { boardIds = []; }

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pre-parse tags once, since they're shared across the whole batch
    const tagNames = tagsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const results = [];

    // Loop through every file in the batch and process each the same way
    for (const file of files) {
      // Generate a unique ID for this image (timestamp + random string).
      // This becomes both the database primary key and the R2 object key.
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const ext = file.name.split(".").pop() || "jpg";
      const r2Key = `${id}.${ext}`;

      // Upload the raw image bytes to R2.
      // NOTE: env.IMAGES_BUCKET is a binding configured in wrangler.toml,
      // NOT a hardcoded key — this is the safe way to reference R2 from a Worker.
      await env.IMAGES_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      // Insert metadata into D1.
      const uploadedAt = Date.now();
      await env.DB.prepare(
        `INSERT INTO images (id, filename, r2_key, uploaded_at, notes, location) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(id, file.name, r2Key, uploadedAt, notes, location)
        .run();

      for (const tagName of tagNames) {
        // Insert tag if it doesn't exist yet (INSERT OR IGNORE avoids duplicate errors).
        await env.DB.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`)
          .bind(tagName)
          .run();

        const tagRow = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`)
          .bind(tagName)
          .first();

        if (tagRow) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)`
          )
            .bind(id, tagRow.id)
            .run();
        }
      }

      // Assign to boards if any were selected at upload time
      for (const boardId of boardIds) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO image_boards (image_id, board_id) VALUES (?, ?)`
        ).bind(id, boardId).run();
      }

      results.push({ id, r2Key });
    }

    return new Response(JSON.stringify({ success: true, uploaded: results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Always return a readable error rather than letting it crash silently —
    // makes debugging from the phone/browser much easier.
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
