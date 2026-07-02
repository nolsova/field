// functions/api/images.js
//
// GET /api/images
// Optional query params:
//   ?board=BOARD_ID   — filter to images in a specific board
//   ?tag=TAG_NAME     — filter by tag (within board if board also set)
//
// Returns each image with its tags, board memberships, and file URL.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const boardFilter = url.searchParams.get("board");
  const tagFilter = url.searchParams.get("tag");

  try {
    let images;

    if (boardFilter && tagFilter) {
      // Filter by both board AND tag
      images = await env.DB.prepare(`
        SELECT DISTINCT images.* FROM images
        JOIN image_boards ON images.id = image_boards.image_id
        JOIN image_tags ON images.id = image_tags.image_id
        JOIN tags ON image_tags.tag_id = tags.id
        WHERE image_boards.board_id = ?
          AND tags.name = ?
        ORDER BY images.uploaded_at DESC
      `).bind(boardFilter, tagFilter.toLowerCase()).all();
    } else if (boardFilter) {
      // Filter by board only
      images = await env.DB.prepare(`
        SELECT images.* FROM images
        JOIN image_boards ON images.id = image_boards.image_id
        WHERE image_boards.board_id = ?
        ORDER BY images.uploaded_at DESC
      `).bind(boardFilter).all();
    } else if (tagFilter) {
      // Filter by tag only
      images = await env.DB.prepare(`
        SELECT images.* FROM images
        JOIN image_tags ON images.id = image_tags.image_id
        JOIN tags ON image_tags.tag_id = tags.id
        WHERE tags.name = ?
        ORDER BY images.uploaded_at DESC
      `).bind(tagFilter.toLowerCase()).all();
    } else {
      // Return everything, newest first
      images = await env.DB.prepare(
        `SELECT * FROM images ORDER BY uploaded_at DESC`
      ).all();
    }

    // For each image, also fetch its tags and board memberships so the
    // frontend doesn't need extra round-trips per image.
    const results = await Promise.all(
      images.results.map(async (img) => {
        const [tagRows, boardRows] = await Promise.all([
          env.DB.prepare(
            `SELECT tags.name FROM tags
             JOIN image_tags ON tags.id = image_tags.tag_id
             WHERE image_tags.image_id = ?`
          ).bind(img.id).all(),
          env.DB.prepare(
            `SELECT board_id FROM image_boards WHERE image_id = ?`
          ).bind(img.id).all(),
        ]);

        return {
          ...img,
          tags: tagRows.results.map((t) => t.name),
          boards: boardRows.results.map((b) => b.board_id),
          url: `/api/file/${img.r2_key}`,
        };
      })
    );

    return new Response(JSON.stringify({ images: results }), {
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
