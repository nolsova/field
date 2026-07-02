// functions/api/file/[key].js
//
// Serves the actual image bytes from R2.
// [key] is a Cloudflare Pages "dynamic route" — whatever comes after
// /api/file/ in the URL gets passed in as context.params.key

export async function onRequestGet(context) {
  const { env, params } = context;
  const key = params.key;

  try {
    const object = await env.IMAGES_BUCKET.get(key);

    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(object.body, { headers });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
