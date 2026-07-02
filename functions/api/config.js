// functions/api/config.js
//
// Returns the API key to the frontend so it can include it in upload/update/
// delete requests. This endpoint itself is protected by Cloudflare Access
// (the login screen in front of the whole site), so only you can reach it.
// The key is never hardcoded in the frontend HTML — it's fetched at runtime
// and kept only in memory for the duration of the browser session.

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.MOODBOARD_API_KEY) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ key: env.MOODBOARD_API_KEY }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Don't let this response get cached anywhere — key should always
      // be fetched fresh from the server, never stored in browser cache.
      "Cache-Control": "no-store",
    },
  });
}
