// functions/api/boards.js
//
// GET /api/boards — returns all boards with image count and up to 4 cover
// image URLs (the most recently added images in that board), used to render
// the mosaic cover on the boards overview screen.

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const boardRows = await env.DB.prepare(
      `SELECT id, name, created_at FROM boards ORDER BY name ASC`
    ).all();

    const boards = await Promise.all(
      boardRows.results.map(async (board) => {
        const countRow = await env.DB.prepare(
          `SELECT COUNT(*) as count FROM image_boards WHERE board_id = ?`
        ).bind(board.id).first();

        // Grab up to 4 of the most recently added images for the cover mosaic
        const coverRows = await env.DB.prepare(
          `SELECT images.r2_key FROM images
           JOIN image_boards ON images.id = image_boards.image_id
           WHERE image_boards.board_id = ?
           ORDER BY images.uploaded_at DESC
           LIMIT 4`
        ).bind(board.id).all();

        return {
          ...board,
          count: countRow?.count || 0,
          covers: coverRows.results.map((r) => `/api/file/${r.r2_key}`),
        };
      })
    );

    return new Response(JSON.stringify({ boards }), {
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
