// functions/api/locations.js
//
// GET /api/locations — returns all unique, non-empty locations with their
// image counts, sorted by usage (most used first). Used by the frontend
// to power autocomplete suggestions when typing a location.

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const rows = await env.DB.prepare(`
      SELECT location, COUNT(*) as count
      FROM images
      WHERE location IS NOT NULL AND location != ''
      GROUP BY location
      ORDER BY count DESC, location ASC
    `).all();

    return new Response(JSON.stringify({ locations: rows.results }), {
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
