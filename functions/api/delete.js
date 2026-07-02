// functions/api/delete.js
//
// Handles POST requests to /api/delete
// Body: { id }
// Removes the image from R2 (the actual file) and D1 (the metadata + tags).
// Requires x-api-key header matching env.MOODBOARD_API_KEY.

export async function onRequestPost(context) {
  const { request, env } = context;

  const providedKey = request.headers.get("x-api-key");
  if (!providedKey || providedKey !== env.MOODBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing image id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Look up the r2_key so we know what file to delete from storage
    const row = await env.DB.prepare(`SELECT r2_key FROM images WHERE id = ?`)
      .bind(id)
      .first();

    if (!row) {
      return new Response(JSON.stringify({ error: "Image not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete the actual file from R2
    await env.IMAGES_BUCKET.delete(row.r2_key);

    // Delete tag associations, then the image row itself
    await env.DB.prepare(`DELETE FROM image_tags WHERE image_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM images WHERE id = ?`).bind(id).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
