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

    // Fetch ALL tag links and board links in just two queries (instead of
    // two queries per image), then group them by image id in memory.
    // Workers limit how many subrequests (including D1 queries) one request
    // can make, so a per-image loop breaks as the library grows.
    const [tagLinks, boardLinks] = await Promise.all([
      env.DB.prepare(
        `SELECT image_tags.image_id, tags.name FROM image_tags
         JOIN tags ON tags.id = image_tags.tag_id`
      ).all(),
      env.DB.prepare(
        `SELECT image_id, board_id FROM image_boards`
      ).all(),
    ]);

    const tagsByImage = new Map();
    for (const row of tagLinks.results) {
      if (!tagsByImage.has(row.image_id)) tagsByImage.set(row.image_id, []);
      tagsByImage.get(row.image_id).push(row.name);
    }

    const boardsByImage = new Map();
    for (const row of boardLinks.results) {
      if (!boardsByImage.has(row.image_id)) boardsByImage.set(row.image_id, []);
      boardsByImage.get(row.image_id).push(row.board_id);
    }

    const results = images.results.map((img) => ({
      ...img,
      tags: tagsByImage.get(img.id) || [],
      boards: boardsByImage.get(img.id) || [],
      // ?v= ties the URL to the file's last-changed time. [key].js
      // caches images for a full year with "immutable" — safe and
      // correct ONLY because this version tag guarantees a URL never
      // gets reused for different bytes. Without it, a cropped image
      // (same r2_key, new bytes) would keep serving the browser's
      // year-old cached copy of the original forever.
      url: `/api/file/${img.r2_key}?v=${img.updated_at || img.uploaded_at}`,
    }));

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