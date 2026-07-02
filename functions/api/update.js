// functions/api/update.js
//
// Handles POST requests to /api/update
// Body: { id, tags (comma-separated string), notes, boards (array of board IDs) }
// Replaces all tags and board assignments, and updates notes.
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
    const { id, tags, notes, boards = [], location } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing image id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update notes and location
    await env.DB.prepare(`UPDATE images SET notes = ?, location = ? WHERE id = ?`)
      .bind(notes || "", location || "", id).run();

    // Replace all existing tag associations
    await env.DB.prepare(`DELETE FROM image_tags WHERE image_id = ?`).bind(id).run();

    const tagNames = (tags || "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    for (const tagName of tagNames) {
      await env.DB.prepare(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).bind(tagName).run();
      const tagRow = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`).bind(tagName).first();
      if (tagRow) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)`
        ).bind(id, tagRow.id).run();
      }
    }

    // Replace all existing board assignments
    await env.DB.prepare(`DELETE FROM image_boards WHERE image_id = ?`).bind(id).run();

    for (const boardId of boards) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO image_boards (image_id, board_id) VALUES (?, ?)`
      ).bind(id, boardId).run();
    }

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
