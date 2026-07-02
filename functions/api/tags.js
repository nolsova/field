// functions/api/tags.js
//
// GET  /api/tags         — returns all tags with image counts
// POST /api/tags         — rename a tag (requires x-api-key)
//
// Body for rename: { action: "rename", oldName, newName }

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const rows = await env.DB.prepare(`
      SELECT tags.name, COUNT(image_tags.image_id) as count
      FROM tags
      LEFT JOIN image_tags ON tags.id = image_tags.tag_id
      GROUP BY tags.id, tags.name
      ORDER BY count DESC, tags.name ASC
    `).all();

    return new Response(JSON.stringify({ tags: rows.results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const providedKey = request.headers.get('x-api-key');
  if (!providedKey || providedKey !== env.MOODBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { action, oldName, newName } = body;

    if (action === 'rename') {
      if (!oldName?.trim() || !newName?.trim()) {
        return new Response(JSON.stringify({ error: 'oldName and newName required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const trimmedNew = newName.trim().toLowerCase();

      // Check if the new name already exists
      const existing = await env.DB.prepare(
        `SELECT id FROM tags WHERE name = ?`
      ).bind(trimmedNew).first();

      if (existing) {
        // New name already exists — merge by re-pointing all image_tags
        // from the old tag to the existing one, then delete the old tag.
        // INSERT OR IGNORE handles cases where an image already has both tags.
        const oldTag = await env.DB.prepare(
          `SELECT id FROM tags WHERE name = ?`
        ).bind(oldName.trim().toLowerCase()).first();

        if (oldTag) {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO image_tags (image_id, tag_id)
            SELECT image_id, ? FROM image_tags WHERE tag_id = ?
          `).bind(existing.id, oldTag.id).run();

          await env.DB.prepare(
            `DELETE FROM image_tags WHERE tag_id = ?`
          ).bind(oldTag.id).run();

          await env.DB.prepare(
            `DELETE FROM tags WHERE id = ?`
          ).bind(oldTag.id).run();
        }

        return new Response(JSON.stringify({ success: true, merged: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // New name doesn't exist — simple rename
      await env.DB.prepare(
        `UPDATE tags SET name = ? WHERE name = ?`
      ).bind(trimmedNew, oldName.trim().toLowerCase()).run();

      return new Response(JSON.stringify({ success: true, merged: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { name } = body;
      if (!name?.trim()) {
        return new Response(JSON.stringify({ error: 'name required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tag = await env.DB.prepare(
        `SELECT id FROM tags WHERE name = ?`
      ).bind(name.trim().toLowerCase()).first();

      if (tag) {
        // Remove all image associations first, then the tag itself.
        // Images are NOT deleted — they just lose this tag.
        await env.DB.prepare(
          `DELETE FROM image_tags WHERE tag_id = ?`
        ).bind(tag.id).run();

        await env.DB.prepare(
          `DELETE FROM tags WHERE id = ?`
        ).bind(tag.id).run();
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
