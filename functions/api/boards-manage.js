// functions/api/boards-manage.js
//
// POST /api/boards-manage
// Body: { action, ...params }
//
// action: "create"  { name }             → creates a new board
// action: "rename"  { id, name }         → renames an existing board
// action: "delete"  { id }               → deletes board (images stay, just unassigned)
//
// All actions require x-api-key header.

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
    const { action } = body;

    if (action === "create") {
      const { name } = body;
      if (!name?.trim()) {
        return json({ error: "Name is required" }, 400);
      }
      const id = `board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await env.DB.prepare(
        `INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)`
      ).bind(id, name.trim(), Date.now()).run();
      return json({ success: true, id });
    }

    if (action === "rename") {
      const { id, name } = body;
      if (!id || !name?.trim()) return json({ error: "id and name required" }, 400);
      await env.DB.prepare(`UPDATE boards SET name = ? WHERE id = ?`)
        .bind(name.trim(), id).run();
      return json({ success: true });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id required" }, 400);
      // ⚠️ Deletes the board and all image_boards associations.
      // Images themselves are NOT deleted — they just become unassigned.
      await env.DB.prepare(`DELETE FROM image_boards WHERE board_id = ?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM boards WHERE id = ?`).bind(id).run();
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
